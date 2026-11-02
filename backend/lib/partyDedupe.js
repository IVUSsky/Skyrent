// Дубликати в указателя на контактите (tenant_directory) — намиране и сливане.
//
// Поводът: записът се създава от всеки нов договор, а дедупликацията при запис
// беше по ТОЧНО ЕГН или ТОЧНО име. Затова „JOVANOVIĆ LUKA" и „LUKA JOVANOVIC"
// станаха два записа, въпреки че носят едно и също ЕГН, телефон и имейл.
//
// ⚠️ Главната опасност не е да пропуснем дубликат, а да слеем ДВА РАЗЛИЧНИ
// СУБЕКТА. В реалните данни вече има такива капани:
//   • фирма и управителят ѝ носят един и същ номер на лична карта;
//   • фирма и собственикът ѝ ползват един телефон;
//   • двама наематели делят телефона на единия.
// Затова съвпадение само по телефон/имейл/документ НИКОГА не е „сигурно", а
// фирма и човек не влизат в обща сигурна група.

// Българските ЕГН са 10 цифри; ЕИК е 9 или 13. Това отличава човек от фирма
// по-надеждно от името.
const COMPANY_WORDS = /(?<!\p{L})(ЕООД|ООД|ЕАД|АД|ЕТ|АДСИЦ|ДЗЗД|LTD|EOOD|OOD|GMBH|SRL)(?!\p{L})/iu;

const digits = (s) => String(s || '').replace(/\D/g, '');

// Малки букви, без диакритика и препинателни. „Йълдърън" и „Йълдърьм" остават
// различни — не гадаем правописа, само нормализираме формата.
function normName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // ć → c
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Подредени думи — „Иван Петров" и „Петров Иван" дават един ключ.
const sortedName = (s) => normName(s).split(' ').filter(Boolean).sort().join(' ');

function isCompany(p = {}) {
  if (COMPANY_WORDS.test(String(p.name || ''))) return true;
  const d = digits(p.egn);
  if (/^BG/i.test(String(p.egn || '').trim())) return true;
  return d.length === 9 || d.length === 13;
}

// Последните 9 цифри — така 0878555310 и +359878555310 съвпадат.
const phoneKey = (s) => { const d = digits(s); return d.length >= 9 ? d.slice(-9) : ''; };
const emailKey = (s) => String(s || '').trim().toLowerCase();
const egnKey   = (s) => { const d = digits(s); return d.length >= 9 ? d : ''; };
const docKey   = (s) => { const d = digits(s); return d.length >= 6 ? d : ''; };

// Две записки спорят ли за самоличност: различни непразни ЕГН-та.
function conflicting(a, b) {
  const x = egnKey(a.egn), y = egnKey(b.egn);
  return !!(x && y && x !== y);
}

// Групите се градят по ключ, после се сливат преходно: ако A и B съвпадат по
// ЕГН, а B и C по име, трите са една група.
function buildGroups(parties) {
  const keyOf = (p) => [
    ['ЕГН', egnKey(p.egn)],
    ['име', sortedName(p.name)],
    ['телефон', phoneKey(p.phone)],
    ['имейл', emailKey(p.email)],
    ['документ', docKey(p.doc_number)],
  ].filter(([, v]) => v);

  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
  parties.forEach(p => parent.set(p.id, p.id));

  const byKey = new Map();
  const reasons = new Map();   // id → Set от причини
  for (const p of parties) {
    for (const [kind, val] of keyOf(p)) {
      const k = kind + '|' + val;
      if (byKey.has(k)) {
        union(byKey.get(k), p.id);
        for (const id of [byKey.get(k), p.id]) {
          if (!reasons.has(id)) reasons.set(id, new Set());
          reasons.get(id).add(kind);
        }
      } else byKey.set(k, p.id);
    }
  }

  const out = new Map();
  for (const p of parties) {
    const root = find(p.id);
    if (!out.has(root)) out.set(root, []);
    out.get(root).push(p);
  }
  return [...out.values()].filter(g => g.length > 1)
    .map(items => ({ items, reasons: [...new Set(items.flatMap(i => [...(reasons.get(i.id) || [])]))] }));
}

// „сигурно" иска съвпадение по самоличност (ЕГН или еднакво име) И да няма
// нито спор за ЕГН, нито смесване на фирма с човек.
function classify(group) {
  const { items, reasons } = group;
  const anyCompany = items.some(isCompany);
  const anyPerson  = items.some(p => !isCompany(p));
  const mixed = anyCompany && anyPerson;

  let conflict = false;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      if (conflicting(items[i], items[j])) conflict = true;

  const identity = reasons.includes('ЕГН') || reasons.includes('име');
  const confidence = (identity && !conflict && !mixed) ? 'сигурно' : 'за преглед';

  const warnings = [];
  if (mixed)    warnings.push('фирма и физическо лице в една група — почти сигурно са различни субекти');
  if (conflict) warnings.push('различни ЕГН/ЕИК — различни субекти');
  if (!identity) warnings.push('съвпада само по контакт (телефон/имейл/документ), не по самоличност');

  return { ...group, confidence, warnings };
}

function findDuplicates(parties = []) {
  return buildGroups(parties).map(classify)
    // Сигурните първо, после по големина.
    .sort((a, b) => (a.confidence === b.confidence ? b.items.length - a.items.length
                                                   : a.confidence === 'сигурно' ? -1 : 1));
}

// Полетата, които се пренасят при сливане. Оцелелият пази своите непразни
// стойности; празните се допълват от другите, по реда на подаване.
const MERGE_FIELDS = ['egn', 'address', 'phone', 'email', 'doc_type', 'doc_number',
  'doc_date', 'doc_country', 'dob', 'notes'];

// Връща какво да стане с оцелелия: { fields, note }. Нищо не се трие тук —
// това е чиста функция, записът е работа на маршрута.
function planMerge(keep, others) {
  const fields = {};
  for (const f of MERGE_FIELDS) {
    if (String(keep[f] ?? '').trim()) continue;          // своето бие
    const donor = others.find(o => String(o[f] ?? '').trim());
    if (donor) fields[f] = donor[f];
  }
  // Различните имена не се губят — влизат в бележка, за да може да се търси
  // по стария правопис.
  const otherNames = others.map(o => String(o.name || '').trim())
    .filter(n => n && normName(n) !== normName(keep.name));
  const parts = [];
  if (otherNames.length) parts.push('Други изписвания: ' + [...new Set(otherNames)].join(' · '));
  parts.push(`Слети записи №${others.map(o => o.id).join(', №')} на ${new Date().toISOString().slice(0, 10)}`);
  const note = parts.join('. ');
  fields.notes = [String(keep.notes || '').trim(), note].filter(Boolean).join(' | ');
  return { fields, note };
}

module.exports = {
  findDuplicates, planMerge, isCompany, normName, sortedName,
  phoneKey, emailKey, egnKey, docKey, MERGE_FIELDS,
};
