/**
 * Разходи по придобиване на имот: местен данък по ЗМДТ, нотариална такса,
 * държавна такса за вписване, брокерска комисионна.
 *
 * По чл. 10(1) от предварителните договори със СКАНУЕЛ ИНВЕСТ тези суми са за
 * сметка на купувача и НЕ се включват в цената, затова ги няма в „покупна".
 * Реално излезли пари са — влизат в знаменателя на доходността, но НЕ в
 * стойността на актива: при продажба не се връщат.
 *
 * Където ги знаем точно, се завеждат на имота (properties.acquisition_costs).
 * Където не — изчисляват се като процент от платената цена. Иво ги оценява на
 * 4,5–5% с брокерската комисионна; подразбирането е 4,75%.
 *
 * Процентът е върху цената С ДДС, защото МДТ и нотариалната такса се
 * начисляват върху материалния интерес по сделката, който е брутната сума.
 */

/** Подразбиращ се процент, ако в настройките няма стойност. */
const DEFAULT_ACQ_PCT = 4.75;

/**
 * @param {object} p              редът от properties
 * @param {number} purchaseGross  покупна цена С ДДС
 * @param {number} pct            дял (0.0475 за 4,75%), НЕ проценти
 * @returns {number}
 */
function acquisitionCost(p, purchaseGross, pct) {
  // NULL значи „не е заведено" → смятай по процента.
  // 0 значи „няма такива разходи" и е различно от NULL.
  if (p && p.acquisition_costs != null && p.acquisition_costs !== '') {
    const n = Number(p.acquisition_costs);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  const gross = Number(purchaseGross) || 0;
  const rate = Number(pct) || 0;
  if (gross <= 0 || rate <= 0) return 0;
  return gross * rate;
}

/** Чете процента от settings и го връща като дял. */
function acquisitionPct(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='acquisition_cost_pct'").get();
  const parsed = row ? parseFloat(row.value) : NaN;
  const pct = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_ACQ_PCT;
  return pct / 100;
}

module.exports = { acquisitionCost, acquisitionPct, DEFAULT_ACQ_PCT };
