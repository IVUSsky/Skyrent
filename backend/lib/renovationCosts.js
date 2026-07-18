// Ремонтни разходи от фактури (expense_invoices, категория 'ремонт') по имот.
// Допълват ръчната колона properties.ремонт във всички инвестиционни
// калкулации (Покупна+Ремонт, cap rate, wealth). Сумите се връщат в EUR
// (BGN се конвертира по фиксинга). 'ремонт д' (извън бизнеса) НЕ се брои.

const BGN_PER_EUR = 1.95583;

function renovationByProperty(db) {
  try {
    const rows = db.prepare(`
      SELECT property_id, currency, SUM(amount) AS s
      FROM expense_invoices
      WHERE property_id IS NOT NULL AND expense_category = 'ремонт'
      GROUP BY property_id, currency
    `).all();
    const map = {};
    for (const r of rows) {
      const eur = (r.currency || 'BGN') === 'BGN' ? r.s / BGN_PER_EUR : r.s;
      map[r.property_id] = Math.round(((map[r.property_id] || 0) + eur) * 100) / 100;
    }
    return map;
  } catch {
    return {}; // org без таблица expense_invoices
  }
}

// Обща стойност на ремонта за имот: ръчната колона + фактурите
function renoTotal(p, map) {
  return (Number(p['ремонт']) || 0) + (map?.[p.id] || 0);
}

module.exports = { renovationByProperty, renoTotal, BGN_PER_EUR };
