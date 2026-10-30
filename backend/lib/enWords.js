// Числа с думи на английски — огледало на lib/bgWords.js.
//
// Поводът: двуезичният договор излизаше с
//   „Art. 5. The Tenant pays a security deposit of 1100,00 EUR (хиляда и сто EUR)"
// Сумата с думи беше българска, защото {{ДЕПОЗИТ_ДУМИ}} е само българско поле,
// а бланката го ползваше и в двете половини. За договор с чуждестранно лице
// това е грубо. Същото важи и за формата на числото: английската половина иска
// 1,100.00, не 1100,00.
//
// Стилът следва българския: само числото с думи, без валута — бланката слага
// {{ВАЛУТА_EN}} сама.

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALE = [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];

// 0..999. „one hundred and one" — британският изказ, който се очаква в договор;
// американското „one hundred one" звучи като счетоводна таблица.
function enThreeDigits(n) {
  n = Math.floor(Math.abs(Number(n) || 0)) % 1000;
  const h = Math.floor(n / 100), rem = n % 100;
  let tail = '';
  if (rem >= 10 && rem <= 19) tail = TEENS[rem - 10];
  else {
    const t = Math.floor(rem / 10), u = rem % 10;
    if (t && u) tail = TENS[t] + '-' + ONES[u];        // twenty-four
    else if (t) tail = TENS[t];
    else if (u) tail = ONES[u];
  }
  if (h && tail) return ONES[h] + ' hundred and ' + tail;
  if (h) return ONES[h] + ' hundred';
  return tail;
}

function enIntToWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'zero';
  const out = [];
  let rest = n;
  for (const [value, name] of SCALE) {
    const q = Math.floor(rest / value);
    if (q) { out.push(enThreeDigits(q) + ' ' + name); rest %= value; }
  }
  if (rest) out.push(enThreeDigits(rest));
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

// Огледало на amountToWords: стотинките се изписват само когато ги има,
// иначе 25,98 се закръгля и договорът казва друга сума.
//
// Стотинките са „and 50/100", не „and fifty cents“ — иначе „one thousand one
// hundred and fifty…“ се чете като 1150. Дробта е стандартният изказ в
// английски финансови документи и не се бърка с „and“-а в самото число.
function amountToWordsEN(amount) {
  const x = Math.round(Math.abs(Number(amount || 0)) * 100);
  const whole = Math.floor(x / 100), cents = x % 100;
  if (!cents) return enIntToWords(whole);
  return `${enIntToWords(whole)} and ${String(cents).padStart(2, '0')}/100`;
}

// Английската половина иска 1,100.00 — bg-BG дава 1100,00.
function fmtAmountEN(amount) {
  return Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { enThreeDigits, enIntToWords, amountToWordsEN, fmtAmountEN };
