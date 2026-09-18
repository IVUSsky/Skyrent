// Разпознаване на наемател по името на платеца от банката.
//
// Банката пише латиница с главни букви („DANAYA DANEVA", „NIKOLA VICHEV"), а в
// Имоти наемателят е както е въведен („danaya daneva", „Никола Петров Вичев").
// Досега съвпадение имаше само през tenant_map / tx_rules → новият наемател
// винаги излизаше „неплатил" до първото ръчно присвояване.
//
// Правила: транслитерация кирилица→латиница, без диакритика, малки букви,
// сравнение по думи (≥ 2 общи думи, или 1 при едносрично име); при два
// наематели с еднакъв резултат — без съвпадение (по-добре ръчно, отколкото грешно).

const CYR = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya', ѐ: 'e', ё: 'e', ы: 'y', э: 'e', і: 'i', ї: 'i', є: 'e', ґ: 'g',
};

function normalizeName(s) {
  let out = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); // диакритика (Ș→s, ă→a)
  out = out.replace(/[а-яѐёыэіїєґ]/g, ch => CYR[ch] ?? ch);
  out = out.replace(/ş/g, 's').replace(/ţ/g, 't').replace(/ț/g, 't').replace(/ș/g, 's');
  // варианти на транслитерация, които банките/хората смесват
  out = out.replace(/iya\b/g, 'ia').replace(/iy\b/g, 'i').replace(/yi/g, 'i').replace(/ii/g, 'i')
           .replace(/tz/g, 'ts').replace(/kh/g, 'h').replace(/ou/g, 'u').replace(/ph/g, 'f')
           .replace(/y/g, 'i').replace(/w/g, 'v').replace(/ck/g, 'k').replace(/x/g, 'ks');
  return out.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const STOP = new Set(['i', 'and', 'eood', 'ood', 'et', 'ad', 'ltd', 'llc', 'eood.', 'g-n', 'g-zha']);
function tokens(s) { return normalizeName(s).split(' ').filter(t => t.length >= 2 && !STOP.has(t)); }

// Разстояние на Левенщайн ≤ 1 за дълги думи: Йълдърън/Йълдъръм, Danaia/Danaya
function near(a, b) {
  if (a === b) return true;
  if (a.length < 6 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// tenants: [{ property_id, name }] → { property_id, name, score } | null
function matchTenant(counterparty, tenants) {
  const ct = [...new Set(tokens(counterparty))];
  if (!ct.length) return null;
  // колко наематели носят дадена дума — рядка дума (≥ 6 букви, само при един)
  // стига и сама: „GYORKEM" при „Гьоркем Йълдърън" ↔ банка „ЙЪЛДЪРЪМ"
  const freq = new Map();
  for (const t of tenants || []) for (const w of new Set(tokens(t.name))) freq.set(w, (freq.get(w) || 0) + 1);
  let best = null, tie = false;
  for (const t of tenants || []) {
    const tt = [...new Set(tokens(t.name))];
    if (!tt.length) continue;
    const hitWords = tt.filter(w => ct.some(c => near(w, c)));
    const hits = hitWords.length;
    const rare = hits === 1 && hitWords[0].length >= 6 && freq.get(hitWords[0]) === 1;
    const ok = tt.length === 1 ? hits === 1 : (hits >= 2 || rare);
    if (!ok) continue;
    const score = hits * 10 + (hits === tt.length ? 5 : 0) - (rare ? 8 : 0);
    if (!best || score > best.score) { best = { property_id: t.property_id, name: t.name, score }; tie = false; }
    else if (score === best.score && best.property_id !== t.property_id) tie = true;
  }
  return tie ? null : best;
}

module.exports = { normalizeName, tokens, matchTenant, near };
