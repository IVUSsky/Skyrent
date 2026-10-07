// „Платил предварително" — кога превод от предходния месец наистина покрива
// текущия.
//
// Старото правило беше само „има превод за наем през предходния месец със
// същата сума" и затова обявяваше за предплатили всички, които са си платили
// редовно: наемът за септември, платен на 2 септември, излизаше като
// предплащане за октомври (07.10.2026 — 10 имота, от които верен беше един).
//
// Истинското предплащане изглежда така: преводът е в КРАЯ на предходния месец
// и самият предходен месец вече е покрит от друг превод. Пример: Витали плаща
// на 02.09 за септември и на 30.09 за октомври — вторият е предплащане.

const LAST_DAYS = 7;      // колко дни преди края на месеца се брои за „край"
const TOLERANCE = 0.1;    // ±10% от очаквания наем

function daysInMonth(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Близо ли е датата до края на своя месец
function isEndOfMonth(дата, ym, lastDays = LAST_DAYS) {
  const d = Number(String(дата).slice(8, 10));
  if (!d) return false;
  return d > daysInMonth(ym) - lastDays;
}

// prevTxs: преводите за наем с месец = предходния
// paidPrev(property_id) → колко е платено за предходния месец БЕЗ този превод
function detectPrepaid({ prevTxs, prevMonth, propMap, isPaidThisMonth, paidPrevExcluding }) {
  const out = [];
  const seen = new Set();
  for (const tx of prevTxs) {
    if (isPaidThisMonth(tx.property_id)) continue;
    const prop = propMap[tx.property_id];
    if (!prop) continue;
    const expected = Number(prop['наем'] || 0);
    if (expected <= 0) continue;

    // сумата да прилича на месечен наем
    if (Math.abs(tx['сума'] - expected) / expected > TOLERANCE) continue;
    // преводът да е в края на предходния месец
    if (!isEndOfMonth(tx['дата'], prevMonth)) continue;
    // предходният месец да е покрит и БЕЗ този превод — иначе това е
    // просто наемът за предходния месец, платен по-късно
    if (paidPrevExcluding(tx.property_id, tx.id) + 0.5 < expected) continue;

    if (seen.has(tx.property_id)) continue;   // по един ред на имот
    seen.add(tx.property_id);
    out.push({
      property_id: tx.property_id,
      адрес: prop['адрес'],
      наемател: prop['наемател'],
      expected,
      tx_id: tx.id, дата: tx['дата'], сума: tx['сума'], контрагент: tx['контрагент'],
    });
  }
  return out;
}

module.exports = { detectPrepaid, isEndOfMonth, daysInMonth, LAST_DAYS, TOLERANCE };
