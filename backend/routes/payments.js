const express = require('express');

// Stripe SDK is lazy-loaded — only initialized if STRIPE_SECRET_KEY is set,
// so the app still boots in environments without Stripe configured.
let stripe = null;
function getStripe() {
  if (stripe) return stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripe = require('stripe')(key, { apiVersion: '2024-12-18.acacia' });
  return stripe;
}

const BG_MONTHS = ['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември'];
function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${BG_MONTHS[parseInt(m) - 1]} ${y}`;
}

// ─── Tenant-facing: create Checkout Session ────────────────────────────────
function tenantPaymentsRouter(db) {
  const router = express.Router();

  // Tenant-only guard (duplicated from routes/tenant.js for safety in case
  // mount order changes — defense-in-depth)
  router.use((req, res, next) => {
    if (req.user?.role !== 'tenant') return res.status(403).json({ error: 'Само за наематели' });
    next();
  });

  // POST /api/tenant/invoices/:id/pay → returns { url } to redirect tenant
  router.post('/invoices/:id/pay', async (req, res) => {
    const s = getStripe();
    if (!s) return res.status(500).json({ error: 'Stripe не е конфигуриран на сървъра' });

    // Find invoice + verify tenant has access via active contract
    const inv = db.prepare(`
      SELECT i.* FROM rent_invoices i
      WHERE i.id=? AND i.type='invoice' AND i.property_id IN (
        SELECT DISTINCT property_id FROM contracts
        WHERE tenant_user_id=? AND property_id IS NOT NULL
      )
    `).get(req.params.id, req.user.id);
    if (!inv) return res.status(404).json({ error: 'Фактурата не е намерена' });
    if (inv.paid_at) return res.status(400).json({ error: 'Фактурата вече е платена' });

    const prop = db.prepare('SELECT адрес FROM properties WHERE id=?').get(inv.property_id);
    const user = db.prepare('SELECT email FROM users WHERE id=?').get(req.user.id);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const amountCents = Math.round(Number(inv.total) * 100);

    try {
      const session = await s.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: user?.email || undefined,
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Наем ${monthLabel(inv.month)}${prop?.['адрес'] ? ' — ' + prop['адрес'] : ''}`,
              description: `Фактура № ${inv.invoice_number}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        metadata: {
          invoice_id: String(inv.id),
          invoice_number: inv.invoice_number,
          tenant_user_id: String(req.user.id),
        },
        success_url: `${frontendUrl}/?stripe_success=1&invoice=${inv.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${frontendUrl}/?stripe_cancel=1&invoice=${inv.id}`,
      });

      // Record session as pending
      db.prepare(`
        INSERT INTO stripe_payments (invoice_id, session_id, status, amount, currency, customer_email)
        VALUES (?, ?, 'pending', ?, 'eur', ?)
      `).run(inv.id, session.id, Number(inv.total), user?.email || null);

      res.json({ url: session.url, session_id: session.id });
    } catch (err) {
      console.error('Stripe session create failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tenant/invoices/:id/payment-status — frontend polls after redirect
  router.get('/invoices/:id/payment-status', (req, res) => {
    const inv = db.prepare(`
      SELECT i.id, i.invoice_number, i.paid_at, i.payment_method
      FROM rent_invoices i
      WHERE i.id=? AND i.property_id IN (
        SELECT DISTINCT property_id FROM contracts
        WHERE tenant_user_id=? AND property_id IS NOT NULL
      )
    `).get(req.params.id, req.user.id);
    if (!inv) return res.status(404).json({ error: 'Not found' });
    res.json({
      paid: !!inv.paid_at,
      paid_at: inv.paid_at,
      payment_method: inv.payment_method,
    });
  });

  return router;
}

// ─── Webhook handler (public, raw body, Stripe signature verified) ─────────
function webhookHandler(db) {
  return (req, res) => {
    const s = getStripe();
    if (!s) return res.status(500).send('Stripe not configured');

    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('STRIPE_WEBHOOK_SECRET not set — refusing to process webhook');
      return res.status(500).send('Webhook secret missing');
    }

    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = s.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      console.error('Stripe webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const invoiceId = session.metadata?.invoice_id;
          if (!invoiceId) {
            console.warn('checkout.session.completed without invoice_id metadata:', session.id);
            break;
          }
          // Mark stripe_payment as succeeded
          db.prepare(`
            UPDATE stripe_payments
            SET status='succeeded', payment_intent_id=?, paid_at=datetime('now')
            WHERE session_id=?
          `).run(session.payment_intent || null, session.id);
          // Mark invoice as paid (only if not already paid)
          db.prepare(`
            UPDATE rent_invoices
            SET paid_at=COALESCE(paid_at, datetime('now')),
                payment_method=COALESCE(payment_method, 'stripe')
            WHERE id=?
          `).run(invoiceId);
          console.log(`Stripe: invoice ${invoiceId} marked as paid (session ${session.id})`);
          break;
        }
        case 'payment_intent.payment_failed': {
          const pi = event.data.object;
          db.prepare(`UPDATE stripe_payments SET status='failed' WHERE payment_intent_id=?`).run(pi.id);
          console.log(`Stripe: payment failed for intent ${pi.id}`);
          break;
        }
        case 'charge.refunded': {
          const charge = event.data.object;
          if (charge.payment_intent) {
            db.prepare(`UPDATE stripe_payments SET status='refunded' WHERE payment_intent_id=?`).run(charge.payment_intent);
            console.log(`Stripe: charge refunded for intent ${charge.payment_intent}`);
          }
          break;
        }
        default:
          // Unhandled events are fine — return 200 so Stripe doesn't retry forever
          break;
      }
      res.json({ received: true });
    } catch (err) {
      console.error('Webhook handler error:', err.message);
      res.status(500).send('Handler error');
    }
  };
}

module.exports = { tenantPaymentsRouter, webhookHandler };
