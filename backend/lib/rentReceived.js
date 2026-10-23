/**
 * Реално постъпил наем по имот, от всички три източника.
 *
 * Доходността дълго време се смяташе от полето `properties.наем` × 12 — тоест
 * от ДОГОВОРЕНИЯ наем при пълна заетост и нула просрочия. Това е капацитетът
 * на портфейла, не парите, които влизат. Иво (23.10.2026): да се смята на
 * влезли суми от банка и по кои имоти, а не прогнозно.
 *
 * Наемът пристига по три пътя и `rent-matrix` отдавна ги събира и трите;
 * метриките гледаха само първия, затова показваха 78% от договореното:
 *
 *   1. `transactions`  — банков превод, категория „наем", операция Кт
 *   2. `manual_rent_payments` — в брой или друго, въведено на ръка
 *   3. `rent_invoices` — платена наемна фактура с карта или Stripe, която
 *      няма насрещно банково движение (иначе се брои два пъти)
 *
 * Сумите са БРУТНИ — толкова, колкото плаща наемателят. Нетирането на ДДС
 * се прави от извикващия, със същия делител като за договорения наем, за да
 * не се разминават двете.
 */

const BGN_RATE = 1.95583;

/** Същата резерва по дата, която ползва и останалият код. */
const SQL_EUR = `CASE WHEN UPPER(COALESCE(currency, CASE WHEN месец < '2026-01' THEN 'BGN' ELSE 'EUR' END))='BGN'
                      THEN сума/${BGN_RATE} ELSE сума END`;

/**
 * @param {object} db
 * @param {string} fromMonth  'YYYY-MM', включително
 * @returns {{byProperty: Map<number, number>, total: number, bySource: object}}
 *          брутни суми в евро
 */
function rentReceivedByProperty(db, fromMonth) {
  const byProperty = new Map();
  const bySource = { bank: 0, manual: 0, invoice: 0 };
  const add = (pid, eur, src) => {
    const n = Number(eur) || 0;
    if (!n) return;
    bySource[src] += n;
    if (pid) byProperty.set(pid, (byProperty.get(pid) || 0) + n);
  };

  // 1. Банка. Само business scope — личният наем не е приход на дружеството.
  try {
    db.prepare(`
      SELECT property_id, SUM(${SQL_EUR}) AS eur
      FROM transactions
      WHERE категория = 'наем' AND operation = 'Кт'
        AND COALESCE(месец, '') >= ?
        AND COALESCE(scope, 'business') = 'business'
      GROUP BY property_id
    `).all(fromMonth).forEach(r => add(r.property_id, r.eur, 'bank'));
  } catch (_) { /* няма таблица */ }

  // 2. Ръчно въведени плащания (в брой и подобни).
  try {
    db.prepare(`
      SELECT property_id, SUM(amount) AS eur
      FROM manual_rent_payments
      WHERE month >= ?
      GROUP BY property_id
    `).all(fromMonth).forEach(r => add(r.property_id, r.eur, 'manual'));
  } catch (_) { /* няма таблица */ }

  // 3. Платени наемни фактури с карта/Stripe. Тези с `bank_tx_id` или
  //    `manual_payment_id` вече са преброени горе — изключват се.
  try {
    db.prepare(`
      SELECT property_id, SUM(total) AS eur
      FROM rent_invoices
      WHERE type = 'invoice' AND COALESCE(product, 'наем') = 'наем'
        AND paid_at IS NOT NULL
        AND bank_tx_id IS NULL AND manual_payment_id IS NULL
        AND month >= ?
      GROUP BY property_id
    `).all(fromMonth).forEach(r => add(r.property_id, r.eur, 'invoice'));
  } catch (_) { /* няма таблица */ }

  const total = Object.values(bySource).reduce((s, n) => s + n, 0);
  return { byProperty, total, bySource };
}

module.exports = { rentReceivedByProperty, BGN_RATE };
