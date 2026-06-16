// Централен генератор на номера на фактури — ДВЕ независими серии:
//   main — не-наемни фактури (интернет/услуги/ръчни): 10-цифрен, напр. 1000000062
//   rent — наемни фактури: 10-цифрен с нули отпред, напр. 0000000123
// Серията се избира по флаг { rent }. Това е глобален непрекъснат брояч
// (НЕ per-година — счетоводна серия). Стойностите се пазят в settings:
//   invoice_counter_main / invoice_counter_rent  (= ПОСЛЕДНИЯ ползван номер)
//
// Backward-compat: ако броячът за серията не е зададен, връща се старата
// year-схема (YYYYNNNNNN), за да не се чупят инсталации без новата настройка.

function counterKey(rent) { return rent ? 'invoice_counter_rent' : 'invoice_counter_main'; }

function readInt(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (row == null || row.value == null || String(row.value).trim() === '') return null;
  const n = parseInt(String(row.value).replace(/"/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

// Консумира и връща следващия номер за серията (string).
function nextInvoiceNumber(db, opts = {}) {
  const rent = !!opts.rent;
  const key = counterKey(rent);
  const cur = readInt(db, key);
  if (cur != null) {
    const next = cur + 1;
    db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key, String(next));
    return String(next).padStart(10, '0');
  }
  // Fallback: стара year-схема (докато новите броячи не са зададени)
  const year = new Date().getFullYear();
  const ck = `invoice_counter_${year}`;
  const yc = readInt(db, ck);
  const next = (yc != null ? yc : 0) + 1;
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(ck, String(next));
  return `${year}${String(next).padStart(6, '0')}`;
}

// Преглежда следващия номер за серия БЕЗ да го консумира (за Settings UI).
function peekNextInvoiceNumber(db, rent) {
  const cur = readInt(db, counterKey(rent));
  if (cur != null) {
    return { configured: true, counter: cur, next_sequential: cur + 1, next_number: String(cur + 1).padStart(10, '0') };
  }
  const year = new Date().getFullYear();
  const yc = readInt(db, `invoice_counter_${year}`) || 0;
  return { configured: false, year, counter: yc, next_sequential: yc + 1, next_number: `${year}${String(yc + 1).padStart(6, '0')}` };
}

module.exports = { nextInvoiceNumber, peekNextInvoiceNumber, counterKey };
