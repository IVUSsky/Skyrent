// Срокът на договора, изписан като готово изречение — на български и на английски.
//
// Поводът: двуезичната наемна бланка иска {{СРОК_BG}} и {{СРОК_EN}}, а кодът
// познаваше само {{СРОК_МЕСЕЦИ}} и {{СРОК_МЕСЕЦИ_ДУМИ}}. fillTemplate оставя
// непознат плейсхолдър буквално (нарочно — за да се види), затова в готовия
// договор стоеше „{{СРОК_BG}}".
//
// Изреченията НЕ завършват с точка — бланката слага своята след плейсхолдъра.
//
// Броят месеци се смята тук, за да не се разминават двата езика и
// {{СРОК_МЕСЕЦИ}} помежду си.

const { amountToWords } = require('./bgWords');
const { enIntToWords } = require('./enWords');

// Числата с думи са общи с договорите — lib/enWords.js.
const enWords = enIntToWords;

// null = безсрочен (няма крайна дата). Иначе цели месеци, минимум 1.
function termMonths(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const s = new Date(startDate), e = new Date(endDate);
  if (isNaN(s) || isNaN(e)) return null;
  return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24 * 30.44)));
}

const pad = (n) => String(n).padStart(2, '0');

function fmtBG(d) {
  const x = new Date(d);
  return isNaN(x) ? '' : `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()} г.`;
}
// Без „г." — то е българско и нямаше работа в английското изречение.
function fmtEN(d) {
  const x = new Date(d);
  return isNaN(x) ? '' : `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}`;
}

function termBG(contract = {}) {
  const m = termMonths(contract.start_date, contract.end_date);
  if (m === null) return 'Договорът се сключва за неопределен срок';
  const until = fmtBG(contract.end_date);
  return `Срокът на договора е ${m} (${amountToWords(m)}) месеца${until ? `, до ${until}` : ''}`;
}

function termEN(contract = {}) {
  const m = termMonths(contract.start_date, contract.end_date);
  if (m === null) return 'This Agreement is concluded for an indefinite term';
  const until = fmtEN(contract.end_date);
  const unit = m === 1 ? 'month' : 'months';
  return `The term of this Agreement is ${m} (${enWords(m)}) ${unit}${until ? `, until ${until}` : ''}`;
}

module.exports = { termMonths, termBG, termEN, enWords };
