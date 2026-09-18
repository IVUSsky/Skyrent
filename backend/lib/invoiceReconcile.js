// Сверяване фактура ↔ плащане. Фактурата за наем ставаше „платена" само от
// Stripe или от ръчно „✓ Платена" — банковият превод (както плащат повечето
// наематели) никога не я отбелязваше, и след колоната „Платена" всяка платена
// по банка фактура стоеше „⏳ не" (Себастиан, ап.9, 09.2026).
//
// Правило: неплатена фактура за наем/депозит се маркира като платена, когато
// вече отчетените плащания за имота я покриват:
//   наем    — банкови преводи „наем" за същия месец + ръчно отбелязано плащане
//   депозит — преводи „депозит_получен" около датата на фактурата + излишъкът
//             над наема за месеца („наем + депозит" в един превод)
// Такава фактура получава bank_tx_id / manual_payment_id = ИЗВЕДЕНА от вече
// отчетено плащане → Наематели/матрицата НЕ я броят втори път. Ако източникът
// изчезне (изтрит превод), изведеният статус пада. Ръчно „✓ Платена" (без
// връзка) и Stripe не се пипат.

const RATE = 1.95583;
const TOL = 1.0; // EUR — закръгляне бруто/нето при ДДС
const eurExpr = "CASE WHEN UPPER(COALESCE(currency,'BGN'))='BGN' THEN сума/" + RATE + " ELSE сума END";

function hasColumn(db, table, col) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col); } catch { return false; }
}

// opts: { property_id, month, dry } — всички по подразбиране
function reconcileInvoices(db, opts = {}) {
  const { property_id = null, month = null, dry = false } = opts;
  if (!hasColumn(db, 'rent_invoices', 'bank_tx_id')) return { ok: false, reason: 'no_column', changes: [] };
  const changes = [];

  const where = [`type='invoice'`, `COALESCE(product,'наем') IN ('наем','депозит')`];
  const args = [];
  if (property_id) { where.push('property_id=?'); args.push(property_id); }
  if (month) { where.push(`(COALESCE(product,'наем')='депозит' OR month=?)`); args.push(month); }
  const invoices = db.prepare(`SELECT id, invoice_number, property_id, month, total, product, paid_at, payment_method,
                                      bank_tx_id, manual_payment_id, issued_at, contract_id
                               FROM rent_invoices WHERE ${where.join(' AND ')} ORDER BY month, id`).all(...args);

  const bankRent = db.prepare(`SELECT COALESCE(SUM(${eurExpr}),0) AS s, MAX(дата) AS d, MAX(id) AS id, COUNT(*) AS n
                               FROM transactions WHERE категория='наем' AND operation='Кт' AND property_id=? AND месец=?`);
  const manualRent = db.prepare(`SELECT id, amount, payment_type FROM manual_rent_payments WHERE property_id=? AND month=?`);
  const rentInvTotal = db.prepare(`SELECT COALESCE(SUM(total),0) AS s FROM rent_invoices
                                   WHERE type='invoice' AND COALESCE(product,'наем')='наем' AND property_id=? AND month=?`);
  const propRent = db.prepare(`SELECT наем FROM properties WHERE id=?`);
  const depTx = db.prepare(`SELECT COALESCE(SUM(${eurExpr}),0) AS s, MAX(дата) AS d, MAX(id) AS id
                            FROM transactions WHERE категория='депозит_получен' AND operation='Кт' AND property_id=?
                              AND дата BETWEEN date(?, '-90 days') AND date(?, '+90 days')`);
  const markPaid = db.prepare(`UPDATE rent_invoices SET paid_at=?, payment_method=?, bank_tx_id=?, manual_payment_id=? WHERE id=?`);
  const unmark = db.prepare(`UPDATE rent_invoices SET paid_at=NULL, payment_method=NULL, bank_tx_id=NULL, manual_payment_id=NULL WHERE id=?`);

  for (const inv of invoices) {
    const derived = !!(inv.bank_tx_id || inv.manual_payment_id);
    if (inv.paid_at && !derived) continue; // Stripe или ръчно ✓ — не се пипа
    const total = Number(inv.total || 0);
    if (!(total > 0)) continue;

    let covered = 0, txId = null, manId = null, paidAt = null, method = null;
    if (inv.product === 'депозит') {
      const ref = String(inv.issued_at || (inv.month ? inv.month + '-01' : '')).slice(0, 10);
      const d = ref ? depTx.get(inv.property_id, ref, ref) : { s: 0 };
      covered += d.s;
      if (d.s > 0) { txId = d.id; paidAt = d.d; method = 'bank'; }
      // „наем + депозит" в един превод: излишъкът над наема за месеца на фактурата
      const m = inv.month || ref.slice(0, 7);
      const b = bankRent.get(inv.property_id, m);
      const rentDue = rentInvTotal.get(inv.property_id, m).s || Number(propRent.get(inv.property_id)?.наем || 0);
      const surplus = Math.max(0, b.s - rentDue);
      if (surplus > 0) { covered += surplus; if (!txId) { txId = b.id; paidAt = b.d; method = 'bank'; } }
    } else {
      const b = bankRent.get(inv.property_id, inv.month);
      const man = manualRent.get(inv.property_id, inv.month);
      covered = b.s + (man ? Number(man.amount || 0) : 0);
      if (b.n > 0) { txId = b.id; paidAt = b.d; method = 'bank'; }
      if (man) {
        manId = man.id;
        if (!paidAt) { paidAt = inv.month + '-01'; method = man.payment_type === 'брой' ? 'cash' : 'bank'; }
      }
    }

    const paysOff = covered + TOL >= total;
    if (paysOff && !inv.paid_at) {
      changes.push({ id: inv.id, invoice_number: inv.invoice_number, property_id: inv.property_id, month: inv.month,
                     product: inv.product || 'наем', total, covered: Math.round(covered * 100) / 100, action: 'paid', paid_at: paidAt, method });
      if (!dry) markPaid.run(String(paidAt).slice(0, 10) + ' 00:00:00', method, txId, manId, inv.id);
    } else if (!paysOff && inv.paid_at && derived) {
      changes.push({ id: inv.id, invoice_number: inv.invoice_number, property_id: inv.property_id, month: inv.month,
                     product: inv.product || 'наем', total, covered: Math.round(covered * 100) / 100, action: 'unpaid' });
      if (!dry) unmark.run(inv.id);
    }
  }
  return { ok: true, dry, checked: invoices.length, changes };
}

module.exports = { reconcileInvoices, TOL };
