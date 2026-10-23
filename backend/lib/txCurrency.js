/**
 * Валутата на банково движение (`transactions`).
 *
 * `transactions.currency` е истината — попълва се при импорта от извлечението.
 * Датата е само резерва за стари редове, където колоната е празна: преди
 * 01.01.2026 лева, след това евро (приемането на еврото в България).
 *
 * ⚠️ Защо съществува този модул: `routes/metricsPortfolio.js` гадаеше САМО по
 * датата и игнорираше колоната, докато останалият код (`routes/import.js`,
 * `rent-matrix`) я чете. Заради това всяко движение от 2026 г., записано в
 * лева, се броеше 1.95583 пъти по-голямо — надуваше „получен наем" и близо
 * половината опекс, който идва от движения, а не от фактури.
 *
 * Същата резерва по дата се ползва и в SQL на няколко места:
 *   COALESCE(currency, CASE WHEN месец < '2026-01' THEN 'BGN' ELSE 'EUR' END)
 */

const BGN_RATE = 1.95583;

/**
 * @param {string|null} currency  съдържанието на колоната, ако го има
 * @param {string|null} дата      'YYYY-MM-DD'
 * @returns {'BGN'|'EUR'}
 */
function txCurrency(currency, дата) {
  const c = String(currency || '').trim().toUpperCase();
  if (c === 'BGN' || c === 'EUR') return c;
  if (!дата) return 'EUR';
  return String(дата) < '2026-01-01' ? 'BGN' : 'EUR';
}

/** Сумата в евро, според валутата на реда. */
function txEur(amount, currency, дата) {
  const n = Number(amount) || 0;
  return txCurrency(currency, дата) === 'BGN' ? n / BGN_RATE : n;
}

module.exports = { txCurrency, txEur, BGN_RATE };
