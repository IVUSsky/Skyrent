// Проверка на дата за ръчна корекция на „изпратена на“ (rent_invoices.sent_at).
//
// Защо изобщо съществува: POST /api/invoices/:id/send вдига sent_at на „сега“.
// Препращането на вече изпратена фактура на друг адрес (гараж 63, 20.11.2026)
// затова изтри кога фактурата е тръгнала към наемателя — 01.11, 07:00 от
// месечния тираж. Корекцията иска отделен път, който не пипа PDF-а.
//
// Защо проверката е тук, а не в SQL: SQLite не пази типове за дати. Подаден
// текст се записва както е дошъл, а datetime('2026-02-31') не връща грешка —
// превърта мълчаливо на 2026-03-03. И двете са по-лоши от отказ.
//
// Приема 'YYYY-MM-DD' (допълва 00:00:00) и 'YYYY-MM-DD HH:MM:SS' (или с „T“).
// null, undefined и '' значат „изчисти“ → фактурата пак е неизпратена.

const RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/;

function normalizeSentAt(raw) {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  // Изрично само текст: String([]) е '', тоест подаден масив щеше да мине за
  // „изчисти“ и да изтрие датата, вместо да бъде отказан.
  if (typeof raw !== 'string') return { ok: false, error: 'Датата трябва да е текст' };
  const s = raw.trim();
  if (s === '') return { ok: true, value: null };
  const m = s.match(RE);
  if (!m) return { ok: false, error: 'Формат: YYYY-MM-DD или YYYY-MM-DD HH:MM:SS' };

  const [, Y, Mo, D, H = '00', Mi = '00', S = '00'] = m;
  const mo = Number(Mo);
  if (mo < 1 || mo > 12) return { ok: false, error: `Невалиден месец: ${Mo}` };

  // Колко дни има месецът: нулевият ден на следващия месец е последният на този.
  const daysInMonth = new Date(Date.UTC(Number(Y), mo, 0)).getUTCDate();
  const d = Number(D);
  if (d < 1 || d > daysInMonth) {
    return { ok: false, error: `${Mo}.${Y} има ${daysInMonth} дни — няма ${D}-и` };
  }
  if (Number(H) > 23 || Number(Mi) > 59 || Number(S) > 59) {
    return { ok: false, error: `Невалиден час: ${H}:${Mi}:${S}` };
  }

  // Форматът е същият като на datetime('now') — за да се сравнява в SQL.
  return { ok: true, value: `${Y}-${Mo}-${D} ${H}:${Mi}:${S}` };
}

module.exports = { normalizeSentAt };
