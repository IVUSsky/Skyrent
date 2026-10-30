// Разсрочване на гаранционния депозит — трите вноски по Чл.13.
//
// Поводът: Чл.13 от бланката ОТДАВНА предвижда разсрочване, но с многоточия и
// заковани месеци: „............... от депозита се заплащат със сключването на
// договора, ............... с плащането на наема за месец януари и останалите
// ................ с плащането на наема за месец февруари". Пишеше се на ръка,
// а „януари/февруари" е вярно само за договор, започнал през декември.
//
// Тук разбивката става данни: три числа на договора + месеците, смятани от
// началната дата. Депозитната фактура се издава на вноски, не наведнъж.
//
// Заварените договори нямат разбивка (трите колони са NULL) — за тях целият
// депозит е „при подписване", тоест поведението остава точно каквото беше.

const { amountToWords } = require('./bgWords');

const BG_MONTHS = [
  'януари', 'февруари', 'март', 'април', 'май', 'юни',
  'юли', 'август', 'септември', 'октомври', 'ноември', 'декември',
];

// Номерата на вноските се пишат в rent_invoices.deposit_part — по тях се
// познава коя вноска вече е фактурирана.
const PART_AT_SIGNING = 1;
const PART_RENT_1     = 2;
const PART_RENT_2     = 3;

const round2 = (n) => Math.round(Number(n) * 100) / 100;
// В стотинки — за да не се трупа грешка при събиране на 166.67 + 166.67 + 166.66.
const cents  = (n) => Math.round(Number(n) * 100);

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Месецът на наема, отместен с offset месеца от началото на договора.
// Връща { ym: '2026-05', name: 'май' } или null при липсваща начална дата.
function rentMonth(startDate, offset) {
  if (!startDate) return null;
  const m = String(startDate).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + offset, 1));
  return {
    ym: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    name: BG_MONTHS[d.getUTCMonth()],
  };
}

// Вноските с НЕнулева сума, в реда на падежа.
// [{ part, amount, when: 'signing'|'rent', month: '2026-05'|null, monthName, label }]
function depositSchedule(contract = {}) {
  const total = round2(contract.deposit || 0);
  if (!(total > 0)) return [];

  const atSigningRaw = num(contract.deposit_at_signing);
  const p1Raw = num(contract.deposit_part_1);
  const p2Raw = num(contract.deposit_part_2);

  // Нито едно от трите не е зададено → заварен договор, всичко при подписване.
  const unset = atSigningRaw === null && p1Raw === null && p2Raw === null;
  const atSigning = unset ? total : round2(atSigningRaw || 0);
  const p1 = unset ? 0 : round2(p1Raw || 0);
  const p2 = unset ? 0 : round2(p2Raw || 0);

  const m1 = rentMonth(contract.start_date, 0);
  const m2 = rentMonth(contract.start_date, 1);

  const out = [];
  if (atSigning > 0) {
    out.push({
      part: PART_AT_SIGNING, amount: atSigning, when: 'signing',
      month: null, monthName: null, label: 'при подписване на договора',
    });
  }
  for (const [part, amount, m] of [[PART_RENT_1, p1, m1], [PART_RENT_2, p2, m2]]) {
    if (amount > 0) {
      out.push({
        part, amount, when: 'rent',
        month: m ? m.ym : null,
        monthName: m ? m.name : null,
        label: m ? `с наема за месец ${m.name}` : 'с наема',
      });
    }
  }
  return out;
}

// Трите суми трябва да дават точно депозита — иначе Чл.13 обещава едно, а
// фактурите вадят друго. Празна разбивка е валидна (заварено поведение).
function validateDepositSplit({ deposit, deposit_at_signing, deposit_part_1, deposit_part_2 }) {
  // Отрицателен депозит няма смисъл и дотук минаваше: полето е `number` без
  // долна граница и стрелката/колелцето го вкарват под нулата. Хваща се тук,
  // защото оттам нататък всичко останало е вярно смятане върху грешно число.
  if (Number(deposit || 0) < 0) return { ok: false, error: 'Депозитът не може да е отрицателен' };

  const atSigningRaw = num(deposit_at_signing);
  const p1Raw = num(deposit_part_1);
  const p2Raw = num(deposit_part_2);
  if (atSigningRaw === null && p1Raw === null && p2Raw === null) return { ok: true };

  const parts = [atSigningRaw || 0, p1Raw || 0, p2Raw || 0];
  if (parts.some(v => v < 0)) return { ok: false, error: 'Вноските по депозита не могат да са отрицателни' };

  const total = cents(deposit || 0);
  const sum = parts.reduce((s, v) => s + cents(v), 0);
  if (sum !== total) {
    // Запетая, не точка — съобщението се чете в български интерфейс.
    const bg = (c) => round2(c / 100).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return {
      ok: false,
      error: `Вноските по депозита (${bg(sum)}) не дават депозита (${bg(total)})`,
    };
  }
  return { ok: true };
}

// Стойностите за плейсхолдърите в Чл.13. Липсваща вноска се изписва „0,00",
// а не празно — празнотата в договор се чете като недовършен текст.
function depositPlaceholders(contract = {}) {
  const sched = depositSchedule(contract);
  const find = (p) => sched.find(x => x.part === p);
  const money = (v) => Number(v || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const m1 = rentMonth(contract.start_date, 0);
  const m2 = rentMonth(contract.start_date, 1);
  return {
    'ДЕПОЗИТ_ПРИ_ПОДПИС': money(find(PART_AT_SIGNING)?.amount),
    'ДЕПОЗИТ_ВНОСКА_1':   money(find(PART_RENT_1)?.amount),
    'ДЕПОЗИТ_ВНОСКА_2':   money(find(PART_RENT_2)?.amount),
    'ДЕПОЗИТ_МЕСЕЦ_1':    m1 ? m1.name : '',
    'ДЕПОЗИТ_МЕСЕЦ_2':    m2 ? m2.name : '',
  };
}


// ─── Клаузата за плащане на депозита ────────────────────────────────────
//
// Чл.5 на двуезичната бланка твърдеше „При подписване на договора Наемателят
// заплаща гаранционен депозит…" — при разсрочване това е НЕВЯРНО. Договорът
// трябва да каже, че страните са се споразумели за вноски заедно с наема.
//
// Затова едно поле дава цяло изречение, което пасва на всяка бланка:
// без разсрочване казва „при подписване", с разсрочване изброява вноските.

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const EN_COUNT = ['zero', 'one', 'two', 'three'];

function monthIndex(ym) {
  const m = String(ym || '').match(/^\d{4}-(\d{2})/);
  return m ? Number(m[1]) - 1 : null;
}

const fmtMoney = (n, locale) => Number(n || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Разсрочен ли е изобщо: или има повече от една вноска, или единствената не е
// „при подписване".
function isSplit(sched) {
  return sched.length > 1 || (sched.length === 1 && sched[0].part !== PART_AT_SIGNING);
}

function depositClauseBG(contract = {}) {
  const cur = contract.currency || 'EUR';
  const sched = depositSchedule(contract);
  if (!sched.length) return '';
  if (!isSplit(sched)) return 'Депозитът се заплаща при подписване на договора.';

  const parts = sched.map(s => {
    const sum = `${fmtMoney(s.amount, 'bg-BG')} ${cur}`;
    return s.when === 'signing'
      ? `${sum} при подписване на договора`
      : `${sum} с наема за месец ${s.monthName || '—'}`;
  });
  const last = parts.pop();
  const list = parts.length ? `${parts.join(', ')} и ${last}` : last;
  return `Страните се споразумяват депозитът да се заплати на ${sched.length} `
       + `(${amountToWords(sched.length)}) вноски заедно с плащането на наема: ${list}.`;
}

function depositClauseEN(contract = {}) {
  const cur = contract.currency || 'EUR';
  const sched = depositSchedule(contract);
  if (!sched.length) return '';
  if (!isSplit(sched)) return 'The deposit is payable upon signing of this Agreement.';

  const parts = sched.map(s => {
    const sum = `${cur} ${fmtMoney(s.amount, 'en-US')}`;
    if (s.when === 'signing') return `${sum} upon signing of this Agreement`;
    const mi = monthIndex(s.month);
    return `${sum} with the rent for ${mi === null ? 'the respective month' : EN_MONTHS[mi]}`;
  });
  const last = parts.pop();
  const list = parts.length ? `${parts.join(', ')} and ${last}` : last;
  const n = sched.length;
  return `The parties agree that the deposit shall be paid in ${n} (${EN_COUNT[n] || n}) `
       + `instalments together with the rent: ${list}.`;
}

module.exports = {
  depositSchedule, validateDepositSplit, depositPlaceholders, rentMonth,
  depositClauseBG, depositClauseEN,
  PART_AT_SIGNING, PART_RENT_1, PART_RENT_2, BG_MONTHS,
};
