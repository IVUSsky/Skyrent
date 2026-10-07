// Кои имоти влизат в наемните справки.
//
// Имот само с интернет договор (ап.45, ап.46 — чужди имоти, където продаваме
// само интернет) няма наем: в „Не са платили" излизаше с очакван 0 лв и
// объркваше справката. Там се плаща пакет в раздел Интернет, а не наем.
//
// Правило: изключваме имот, който има активен договор за ИНТЕРНЕТ и НЯМА
// активен договор за наем. Имот с двата вида (ап.9 — наем + интернет) остава.

// Връща Set от property_id, които НЕ са наемни
function internetOnlyPropertyIds(db) {
  try {
    const rows = db.prepare(`
      SELECT property_id,
             SUM(CASE WHEN COALESCE(kind,'наем') = 'наем'     THEN 1 ELSE 0 END) AS rent_contracts,
             SUM(CASE WHEN COALESCE(kind,'наем') = 'интернет' THEN 1 ELSE 0 END) AS net_contracts
        FROM contracts
       WHERE status = 'active' AND property_id IS NOT NULL
       GROUP BY property_id
    `).all();
    return new Set(rows.filter(r => r.net_contracts > 0 && r.rent_contracts === 0).map(r => r.property_id));
  } catch {
    return new Set();
  }
}

// Филтър за списък имоти от наемните справки
function keepRentProperties(db, props) {
  const skip = internetOnlyPropertyIds(db);
  return (props || []).filter(p => !skip.has(p.id ?? p.property_id));
}

module.exports = { internetOnlyPropertyIds, keepRentProperties };
