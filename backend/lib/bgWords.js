// Числа с думи на български — едно място за фактурите и за договорите.
//
// Поводът: договорът на един наемател излезе с „гаранционен депозит в размер на
// 1000,00 EUR (1000 EUR)" и „наем 667,00 EUR (шестста шестдесет и седем EUR)".
// `amountToWords` в routes/contracts.js се отказваше над 999 (`return String(num)`)
// и сглобяваше стотиците като `ones[h] + 'ста'` — вярно само за „триста".
// Фактурите отдавна имаха работеща реализация; сега тя е обща.
//
// Поправено при изнасянето: „и" пред кръгла стотица след хилядите —
// „хиляда и триста", не „хиляда триста".

// Родът следва броеното: „един милион", „две хиляди" (ж.р.), „две евро" (ср.р.).
function bgThreeDigits(num, gender) {
  const ones = {
    n: ['', 'едно', 'две', 'три', 'четири', 'пет', 'шест', 'седем', 'осем', 'девет'],
    m: ['', 'един', 'два', 'три', 'четири', 'пет', 'шест', 'седем', 'осем', 'девет'],
    f: ['', 'една', 'две', 'три', 'четири', 'пет', 'шест', 'седем', 'осем', 'девет'],
  }[gender] || [];
  const teens = ['десет', 'единадесет', 'дванадесет', 'тринадесет', 'четиринадесет', 'петнадесет', 'шестнадесет', 'седемнадесет', 'осемнадесет', 'деветнадесет'];
  const tens = ['', '', 'двадесет', 'тридесет', 'четиридесет', 'петдесет', 'шестдесет', 'седемдесет', 'осемдесет', 'деветдесет'];
  const hund = ['', 'сто', 'двеста', 'триста', 'четиристотин', 'петстотин', 'шестстотин', 'седемстотин', 'осемстотин', 'деветстотин'];
  const h = Math.floor(num / 100), rem = num % 100, t = Math.floor(rem / 10), u = rem % 10;
  let tp = [];
  if (rem >= 10 && rem <= 19) tp.push(teens[rem - 10]);
  else { if (t) tp.push(tens[t]); if (u) tp.push(ones[u]); }
  const tail = tp.length === 2 ? tp[0] + ' и ' + tp[1] : (tp[0] || '');
  if (h && tail) return tp.length === 2 ? hund[h] + ' ' + tail : hund[h] + ' и ' + tail;
  if (h) return hund[h];
  return tail;
}

function bgIntToWords(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'нула';
  const mil = Math.floor(n / 1000000), th = Math.floor((n % 1000000) / 1000), rest = n % 1000;
  const g = [];
  if (mil) g.push(bgThreeDigits(mil, 'm') + ' ' + (mil === 1 ? 'милион' : 'милиона'));
  if (th) g.push(th === 1 ? 'хиляда' : bgThreeDigits(th, 'f') + ' хиляди');
  if (rest) g.push(bgThreeDigits(rest, 'n'));
  let res = g.join(' ');
  // „и" пред последната съставка: под сто („хиляда двеста и петдесет") или кръгла
  // стотица („хиляда и триста"). Ако вътре вече има „и", второто би било излишно.
  if (g.length > 1 && rest > 0 && (rest < 100 || rest % 100 === 0)) {
    const last = g[g.length - 1];
    if (!last.includes(' и ')) res = g.slice(0, -1).join(' ') + ' и ' + last;
  }
  return res.replace(/\s+/g, ' ').trim();
}

// За договорите: „(шестстотин шестдесет и седем EUR)" — бланката слага валутата
// сама. Стотинки се изписват само когато ги има; интернет таксата 25,98 € иначе
// се закръгляше до „двадесет и шест".
function amountToWords(amount) {
  const x = Math.round(Math.abs(Number(amount || 0)) * 100);
  const whole = Math.floor(x / 100), cents = x % 100;
  if (!cents) return bgIntToWords(whole);
  return `${bgIntToWords(whole)} и ${bgIntToWords(cents)} цента`;
}

// За фактурите: редът „Словом:" е с пълния изказ, стотинките остават с цифри.
function amountToWordsBG(amount) {
  const x = Math.round(Math.abs(Number(amount || 0)) * 100);
  return `${bgIntToWords(Math.floor(x / 100))} евро и ${String(x % 100).padStart(2, '0')} евроцента`;
}

module.exports = { bgThreeDigits, bgIntToWords, amountToWords, amountToWordsBG };
