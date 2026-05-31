// SEPA Autopay monthly charge cron
//
// For each user with autopay_enabled=1 whose autopay_day matches today:
//   1. Find their active contract → property
//   2. Find or generate the rent invoice for the current month
//   3. Charge via stripe.paymentIntents.create({ off_session: true, confirm: true })
//
// Webhook checkout.session.completed handler covers payment-mode sessions
// (interactive checkout); for these off-session PaymentIntents, we mark the
// invoice paid inline as soon as the API call succeeds. The webhook still
// fires `payment_intent.succeeded` / `.payment_failed` which we route to the
// stripe_payments table for audit.

const path = require('path');
const fs = require('fs');

let stripeSingleton = null;
function getStripe() {
  if (stripeSingleton) return stripeSingleton;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripeSingleton = require('stripe')(key, { apiVersion: '2024-12-18.acacia' });
  return stripeSingleton;
}

const BG_MONTHS = ['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември'];
function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${BG_MONTHS[parseInt(m) - 1]} ${y}`;
}

function getIssuer(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='issuer'").get();
  if (!row) return {};
  try { return JSON.parse(row.value); } catch { return {}; }
}

function nextInvoiceNumber(db) {
  const year = new Date().getFullYear();
  const counterKey = `invoice_counter_${year}`;
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(counterKey);
  const next = row ? (parseInt(String(row.value).replace(/"/g, '')) + 1) : 1;
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").run(counterKey, String(next));
  return `${year}${String(next).padStart(6, '0')}`;
}

// Find or create an unpaid invoice for the given property + current month
function ensureInvoiceForMonth(db, property, month, generatePDF) {
  let inv = db.prepare("SELECT * FROM rent_invoices WHERE property_id=? AND month=? AND type='invoice'")
    .get(property.id, month);
  if (inv) return inv;

  if (!property.invoice_enabled) return null;

  const issuer = getIssuer(db);
  const invoice_number = nextInvoiceNumber(db);
  const vat_rate  = property.vat_exempt ? 0 : (issuer.vat_rate ? Number(issuer.vat_rate) : 0);
  const total     = Number(property['наем'] || 0);
  const amount    = vat_rate > 0 ? Math.round(total / (1 + vat_rate / 100) * 100) / 100 : total;
  const vat_amount = Math.round((total - amount) * 100) / 100;
  const issued_at = new Date().toISOString().slice(0, 10);

  let recipient = {};
  try { recipient = JSON.parse(property.invoice_recipient || '{}'); } catch {}

  const draft = {
    invoice_number, type: 'invoice',
    property_id: property.id, property_address: property['адрес'], month,
    tenant_name: property['наемател'] || '',
    recipient_name:    recipient.name    || property['наемател'] || '',
    recipient_address: recipient.address || '',
    recipient_eik:     recipient.eik     || '',
    recipient_mol:     recipient.mol     || '',
    amount, vat_rate, vat_amount, total,
    payment_type: 'банков превод',
    tax_event_date: issued_at, due_date: null,
    issued_at, notes: 'Автоматично издадена за SEPA автоплащане',
  };

  if (generatePDF) {
    // Best-effort: skip PDF generation in cron (admin can regenerate via Edit)
    // — keep cron fast and avoid font/disk dependencies
  }

  const r = db.prepare(`
    INSERT INTO rent_invoices
      (invoice_number, type, property_id, month, tenant_name, recipient_name,
       recipient_address, recipient_eik, recipient_mol, amount, vat_rate, vat_amount,
       total, payment_type, tax_event_date, due_date, issued_at, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    invoice_number, 'invoice', property.id, month, draft.tenant_name,
    draft.recipient_name, draft.recipient_address, draft.recipient_eik, draft.recipient_mol,
    amount, vat_rate, vat_amount, total,
    draft.payment_type, draft.tax_event_date, draft.due_date,
    issued_at, draft.notes
  );
  return db.prepare('SELECT * FROM rent_invoices WHERE id=?').get(r.lastInsertRowid);
}

async function runAutopayCharges(db, options = {}) {
  const stripe = getStripe();
  if (!stripe) {
    console.log('Autopay cron: STRIPE_SECRET_KEY not set, skipping');
    return { processed: 0, error: 'Stripe not configured' };
  }

  const today = new Date();
  const todayDay = today.getDate(); // 1-31
  const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM

  // Find users due today (or all enabled if forceAll for manual testing)
  const users = options.forceAll
    ? db.prepare(`SELECT * FROM users WHERE autopay_enabled=1 AND sepa_payment_method_id IS NOT NULL`).all()
    : db.prepare(`
        SELECT * FROM users
        WHERE autopay_enabled=1
          AND sepa_payment_method_id IS NOT NULL
          AND COALESCE(autopay_day, 5) = ?
      `).all(todayDay);

  if (users.length === 0) {
    console.log(`Autopay cron: no users due on day ${todayDay}`);
    return { processed: 0, charged: 0, errors: 0 };
  }

  console.log(`Autopay cron: processing ${users.length} user(s) ${options.forceAll ? '(FORCE-ALL)' : `due on day ${todayDay}`} for ${currentMonth}`);
  let charged = 0;
  let errors  = 0;
  const results = [];

  for (const user of users) {
    try {
      // Find property linked through active contract
      const contract = db.prepare(`
        SELECT c.*, p.* FROM contracts c
        LEFT JOIN properties p ON p.id = c.property_id
        WHERE c.tenant_user_id=? AND c.status='active' AND p.invoice_enabled=1
        ORDER BY c.created_at DESC LIMIT 1
      `).get(user.id);
      if (!contract || !contract.property_id) {
        console.warn(`Autopay: user ${user.id} has no active contract with billable property — skip`);
        continue;
      }

      const property = db.prepare('SELECT * FROM properties WHERE id=?').get(contract.property_id);
      if (property.stripe_enabled === 0) {
        console.warn(`Autopay: user ${user.id} property ${property.id} has stripe_enabled=0 — skip`);
        continue;
      }
      const inv = ensureInvoiceForMonth(db, property, currentMonth, false);
      if (!inv) {
        console.warn(`Autopay: user ${user.id} property ${property.id} has invoice_enabled=0 — skip`);
        continue;
      }
      if (inv.paid_at) {
        console.log(`Autopay: invoice ${inv.invoice_number} already paid — skip`);
        continue;
      }

      // Charge off-session
      const pi = await stripe.paymentIntents.create({
        customer: user.stripe_customer_id,
        amount: Math.round(Number(inv.total) * 100),
        currency: 'eur',
        payment_method: user.sepa_payment_method_id,
        payment_method_types: ['sepa_debit'],
        off_session: true,
        confirm: true,
        metadata: {
          invoice_id: String(inv.id),
          invoice_number: inv.invoice_number,
          tenant_user_id: String(user.id),
          autopay: 'true',
        },
      });

      db.prepare(`
        INSERT INTO stripe_payments (invoice_id, session_id, payment_intent_id, status, amount, currency, customer_email)
        VALUES (?, NULL, ?, ?, ?, 'eur', ?)
      `).run(
        inv.id,
        pi.id,
        pi.status === 'succeeded' ? 'succeeded' : 'processing',
        Number(inv.total),
        user.email || null
      );

      // For SEPA DD, PaymentIntent is typically 'processing' initially (not
      // 'succeeded') because the debit takes several days. We mark the invoice
      // paid when the webhook reports `payment_intent.succeeded` later.
      if (pi.status === 'succeeded') {
        db.prepare(`
          UPDATE rent_invoices
          SET paid_at=COALESCE(paid_at, datetime('now')),
              payment_method=COALESCE(payment_method, 'stripe_sepa')
          WHERE id=?
        `).run(inv.id);
      }

      console.log(`Autopay: charged ${inv.total} EUR for invoice ${inv.invoice_number} (user ${user.id}, status=${pi.status})`);
      charged++;
      results.push({ user_id: user.id, invoice_number: inv.invoice_number, amount: inv.total, status: pi.status });
    } catch (err) {
      console.error(`Autopay error for user ${user.id}:`, err.message);
      errors++;
      results.push({ user_id: user.id, error: err.message });
      // TODO: email admin alert; mark a retry counter on the user
    }
  }

  return { processed: users.length, charged, errors, results };
}

module.exports = { runAutopayCharges };
