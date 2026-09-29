// ДДС по издадените документи за календарен месец.
//
// Периодът е по ДАТА НА ДАНЪЧНОТО СЪБИТИЕ (иначе датата на издаване), а не по
// наемния месец: про-рата фактура за октомври, издадена на 18.09, влиза в
// septemврийската справка. Таблицата на екрана филтрира по наемен месец —
// затова тази справка се смята отделно, на сървъра, и не зависи от филтрите.
//
// ДДС по издадените = начислен по фактурите − ДДС по кредитните известия.
// Това НЕ е крайното задължение към НАП: от него се приспада ДДС по покупките
// (разходните фактури), който Skyrent не води.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// rows: { type, product, vat_rate, amount (основа), vat_amount, total }
function summarizeVat(rows = []) {
  const zero = () => ({ count: 0, base: 0, vat: 0, total: 0 });
  const out = {
    invoices: zero(),
    credit_notes: zero(),
    vat_due: 0,
    by_rate: {},     // '20' → { base, vat, total, count }
    by_product: {},  // 'наем' → { base, vat, total, count }
  };
  for (const row of rows) {
    const isCN = row.type === 'credit_note';
    const sign = isCN ? -1 : 1;
    const base = Number(row.amount) || 0;
    const vat = Number(row.vat_amount) || 0;
    const total = Number(row.total) || 0;

    const bucket = isCN ? out.credit_notes : out.invoices;
    bucket.count += Number(row.count || 1);
    bucket.base += base; bucket.vat += vat; bucket.total += total;

    const rate = String(row.vat_rate == null ? '' : row.vat_rate);
    const product = row.product || 'наем';
    for (const [map, key] of [[out.by_rate, rate], [out.by_product, product]]) {
      if (!map[key]) map[key] = zero();
      map[key].count += Number(row.count || 1) * sign;
      map[key].base += base * sign;
      map[key].vat += vat * sign;
      map[key].total += total * sign;
    }
  }
  out.vat_due = r2(out.invoices.vat - out.credit_notes.vat);
  for (const b of [out.invoices, out.credit_notes]) { b.base = r2(b.base); b.vat = r2(b.vat); b.total = r2(b.total); }
  for (const map of [out.by_rate, out.by_product]) {
    for (const k of Object.keys(map)) { map[k].base = r2(map[k].base); map[k].vat = r2(map[k].vat); map[k].total = r2(map[k].total); }
  }
  return out;
}

// Последният ден от месеца — '2026-02' → '2026-02-29'
function monthEnd(month) {
  const [y, m] = String(month).split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

function vatSummary(db, month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error('month трябва да е ГГГГ-ММ');
  const rows = db.prepare(
    `SELECT type, COALESCE(product,'наем') AS product, vat_rate,
            COUNT(*) AS count, SUM(COALESCE(amount,0)) AS amount,
            SUM(COALESCE(vat_amount,0)) AS vat_amount, SUM(COALESCE(total,0)) AS total
       FROM rent_invoices
      WHERE date(COALESCE(NULLIF(tax_event_date,''), issued_at)) BETWEEN ? AND ?
      GROUP BY type, product, vat_rate`
  ).all(month + '-01', monthEnd(month));
  return { month, ...summarizeVat(rows) };
}

// Редовете за същия период — за списъка „кой какво е получил"
function vatRows(db, month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error('month трябва да е ГГГГ-ММ');
  return db.prepare(
    `SELECT i.id, i.invoice_number, i.type, COALESCE(i.product,'наем') AS product,
            COALESCE(NULLIF(i.tax_event_date,''), i.issued_at) AS doc_date,
            i.month, i.recipient_name, i.tenant_name, i.amount, i.vat_rate, i.vat_amount, i.total,
            i.paid_at, i.sent_at, p.адрес AS property_address
       FROM rent_invoices i LEFT JOIN properties p ON p.id = i.property_id
      WHERE date(COALESCE(NULLIF(i.tax_event_date,''), i.issued_at)) BETWEEN ? AND ?
      ORDER BY doc_date, i.invoice_number`
  ).all(month + '-01', monthEnd(month));
}

module.exports = { summarizeVat, vatSummary, vatRows, monthEnd };
