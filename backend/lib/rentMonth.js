// Месецът, ЗА който е наемът, от основанието на превода.
//
// Наемателите плащат за следващия месец в края на текущия („NAEM MESEC
// SEPTEMVRI 2026" на 31.08) — по датата преводът отива в август и септември
// излиза „неплатен". Ако основанието назовава месец (кирилица/латиница, число,
// „09 26", „09.2026"), той има предимство, но само ако е до ±2 месеца от датата
// на превода — иначе е шум (номер на договор, адрес).
const MONTHS = [
  ['януари', 'yanuari', 'january', 'jan', 'яну'],
  ['февруари', 'fevruari', 'february', 'feb', 'фев'],
  ['март', 'mart', 'march', 'mar'],
  ['април', 'april', 'apr', 'апр'],
  ['май', 'may', 'mai'],
  ['юни', 'yuni', 'juni', 'june', 'jun'],
  ['юли', 'yuli', 'juli', 'july', 'jul'],
  ['август', 'avgust', 'august', 'aug', 'авг'],
  ['септември', 'septemvri', 'september', 'sept', 'sep', 'септ'],
  ['октомври', 'oktomvri', 'october', 'oct', 'окт'],
  ['ноември', 'noemvri', 'november', 'nov', 'ное'],
  ['декември', 'dekemvri', 'december', 'dec', 'дек'],
];

function monthDiff(a, b) { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); }

// Връща 'YYYY-MM' или null. `date` = датата на превода (YYYY-MM-DD).
function rentMonthFromReason(reason, date) {
  const text = String(reason || '').toLowerCase().replace(/[|;]/g, ' ').replace(/\s+/g, ' ');
  if (!text || !date) return null;
  const [y, m] = date.slice(0, 7).split('-').map(Number);
  const candidates = [];
  // 1) име на месец (+ по избор година)
  for (let i = 0; i < 12; i++) {
    for (const w of MONTHS[i]) {
      const re = new RegExp(`(?:^|[^a-zа-я])${w}(?:[^a-zа-я]|$)`);
      const m2 = text.match(re);
      if (!m2) continue;
      const after = text.slice(text.indexOf(w) + w.length, text.indexOf(w) + w.length + 8);
      const ym = after.match(/(20\d{2}|\b\d{2}\b)/);
      let year = y;
      if (ym) year = ym[1].length === 4 ? Number(ym[1]) : 2000 + Number(ym[1]);
      candidates.push(`${year}-${String(i + 1).padStart(2, '0')}`);
      break;
    }
  }
  // 2) „09 26", „09.2026", „09/2026", „9.2026"
  for (const m3 of text.matchAll(/(?:^|[^\d.])(0?[1-9]|1[0-2])[ ./-](20\d{2}|\d{2})(?:[^\d]|$)/g)) {
    const mm = Number(m3[1]); const yy = m3[2].length === 4 ? Number(m3[2]) : 2000 + Number(m3[2]);
    if (yy >= 2020 && yy <= 2100) candidates.push(`${yy}-${String(mm).padStart(2, '0')}`);
  }
  const cur = date.slice(0, 7);
  const ok = candidates.filter(c => Math.abs(monthDiff(cur, c)) <= 2);
  if (!ok.length) return null;
  // предпочитай най-близкия до датата, при равенство — по-късния (предплащане)
  ok.sort((a, b) => Math.abs(monthDiff(cur, a)) - Math.abs(monthDiff(cur, b)) || (a < b ? 1 : -1));
  return ok[0];
}

module.exports = { rentMonthFromReason };
