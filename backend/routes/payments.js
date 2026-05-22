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

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getIssuerSetting(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='issuer'").get();
  if (!row) return {};
  try { return JSON.parse(row.value); } catch { return {}; }
}

// Fire-and-forget Resend send. Logs errors but doesn't throw — webhook
// MUST respond 200 to Stripe even if email fails (we'll retry/recover via
// admin-visible status badges).
async function sendPaymentEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return { sent: false, reason: 'no_key_or_to' };
  const fromName  = 'Sky Capital';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'info@skycapital.pro';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [to], subject, html }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.warn('Resend payment email failed:', err.message || r.status);
      return { sent: false, reason: err.message || r.status };
    }
    return { sent: true };
  } catch (e) {
    console.warn('Resend payment email exception:', e.message);
    return { sent: false, reason: e.message };
  }
}

function paymentEmailShell(bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">
        <tr><td style="background:#1a1a2e;padding:18px 32px;font-size:18px;font-weight:bold;color:#fff;letter-spacing:2px;">SKY CAPITAL</td></tr>
        <tr><td style="padding:32px 32px 24px;color:#1a1a2e;font-size:14px;line-height:1.7;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="background:#e8eaf2;padding:14px 32px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #d1d5db;">
          <strong>Sky Capital OOD</strong> · info@skycapital.pro
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function getAdminEmails(db) {
  // Notify all admins by email (excludes empty emails)
  return db.prepare("SELECT email FROM users WHERE role='admin' AND email IS NOT NULL AND email != ''").all().map(u => u.email);
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
          db.prepare(`
            UPDATE stripe_payments
            SET status='succeeded', payment_intent_id=?, paid_at=datetime('now')
            WHERE session_id=?
          `).run(session.payment_intent || null, session.id);
          db.prepare(`
            UPDATE rent_invoices
            SET paid_at=COALESCE(paid_at, datetime('now')),
                payment_method=COALESCE(payment_method, 'stripe')
            WHERE id=?
          `).run(invoiceId);
          console.log(`Stripe: invoice ${invoiceId} marked as paid (session ${session.id})`);

          // Email notifications (fire-and-forget, don't block webhook response)
          const inv = db.prepare(`
            SELECT i.*, p.адрес AS property_address
            FROM rent_invoices i LEFT JOIN properties p ON p.id=i.property_id
            WHERE i.id=?
          `).get(invoiceId);
          if (inv) {
            const tenantBody = `
              <p>Уважаеми/а <strong>${inv.tenant_name || ''}</strong>,</p>
              <p>Получихме плащането Ви за <strong>${monthLabel(inv.month)}</strong>.</p>
              <table cellpadding="0" cellspacing="0" style="margin:18px 0;border-collapse:collapse;border:1px solid #d1d5db;border-radius:6px;overflow:hidden;width:100%;">
                <tr><td style="background:#f9fafb;padding:8px 14px;border-bottom:1px solid #d1d5db;color:#6b7280;font-size:12px;">Фактура</td>
                    <td style="padding:8px 14px;border-bottom:1px solid #d1d5db;font-weight:bold;">№ ${inv.invoice_number}</td></tr>
                <tr><td style="background:#f9fafb;padding:8px 14px;border-bottom:1px solid #d1d5db;color:#6b7280;font-size:12px;">Имот</td>
                    <td style="padding:8px 14px;border-bottom:1px solid #d1d5db;">${inv.property_address || ''}</td></tr>
                <tr><td style="background:#f9fafb;padding:8px 14px;color:#6b7280;font-size:12px;">Сума</td>
                    <td style="padding:8px 14px;font-weight:bold;color:#166534;">${fmtMoney(inv.total)} EUR</td></tr>
              </table>
              <p>Благодарим Ви!</p>`;
            const customerEmail = session.customer_email || session.customer_details?.email;
            if (customerEmail) {
              sendPaymentEmail({
                to: customerEmail,
                subject: `Плащане потвърдено — фактура № ${inv.invoice_number}`,
                html: paymentEmailShell(tenantBody),
              });
            }

            // Admin alert
            const adminBody = `
              <p>Получено плащане:</p>
              <ul>
                <li>Фактура: <strong>№ ${inv.invoice_number}</strong></li>
                <li>Сума: <strong>${fmtMoney(inv.total)} EUR</strong></li>
                <li>Наемател: ${inv.tenant_name || '—'} (${customerEmail || '—'})</li>
                <li>Имот: ${inv.property_address || '—'}</li>
                <li>Stripe session: ${session.id}</li>
              </ul>`;
            for (const adminEmail of getAdminEmails(db)) {
              sendPaymentEmail({
                to: adminEmail,
                subject: `Skyrent: получено плащане ${fmtMoney(inv.total)} EUR (№ ${inv.invoice_number})`,
                html: paymentEmailShell(adminBody),
              });
            }
          }
          break;
        }
        case 'payment_intent.payment_failed': {
          const pi = event.data.object;
          db.prepare(`UPDATE stripe_payments SET status='failed' WHERE payment_intent_id=?`).run(pi.id);
          console.log(`Stripe: payment failed for intent ${pi.id}`);

          // Find associated invoice via stripe_payments
          const sp = db.prepare('SELECT * FROM stripe_payments WHERE payment_intent_id=?').get(pi.id);
          const inv = sp ? db.prepare('SELECT * FROM rent_invoices WHERE id=?').get(sp.invoice_id) : null;
          const failureMsg = pi.last_payment_error?.message || 'unknown';
          const adminBody = `
            <p style="color:#991b1b;"><strong>⚠️ Неуспешно плащане</strong></p>
            <ul>
              <li>Фактура: <strong>№ ${inv?.invoice_number || '—'}</strong></li>
              <li>Сума: <strong>${fmtMoney(inv?.total || pi.amount / 100)} EUR</strong></li>
              <li>Наемател: ${inv?.tenant_name || '—'} (${sp?.customer_email || '—'})</li>
              <li>Причина: ${failureMsg}</li>
              <li>PaymentIntent: ${pi.id}</li>
            </ul>
            <p>Наемателят може да опита отново от tenant портала.</p>`;
          for (const adminEmail of getAdminEmails(db)) {
            sendPaymentEmail({
              to: adminEmail,
              subject: `Skyrent: неуспешно плащане (№ ${inv?.invoice_number || pi.id})`,
              html: paymentEmailShell(adminBody),
            });
          }
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

module.exports = { tenantPaymentsRouter, webhookHandler, getStripe };
