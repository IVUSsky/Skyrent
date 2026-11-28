// Годишен отчет — реални пари по фирмените сметки, без счетоводна амортизация.
//
// Чиста функция: получава вече филтрираните движения (само сметките, които в
// account_scope_map са 'business'), имотите, договорите и кредитите, и връща
// месечни редове, суми и разбивки за екрана „Годишен отчет".
//
// Защо по сметката, а не по `scope`: в една фирмена сметка има и лични редове
// (напр. заем от собственика, маркиран `personal`), а наемите в брой по личните
// имоти са маркирани `business`, без да са на фирмата. Истината за фирмата е
// това, което е минало през нейната сметка.
//
// Правило за ДДС (решено, не се преобсъжда): доходността е нето. Оборотът се
// показва и с ДДС, и без — без ДДС = бруто ÷ (1 + ставка) за имоти, които не
// са освободени (`vat_exempt`), когато фирмата е регистрирана по ДДС.

const BGN_RATE = 1.95583;

// Движение → сума в евро. Колоната currency я има от импорта; за стари редове
// без нея валутата следва датата (преди 2026 — лева).
function toEur(t) {
  const cur = t.currency || ((t.месец || String(t.дата || '').slice(0, 7)) < '2026-01' ? 'BGN' : 'EUR');
  const v = Number(t.сума) || 0;
  return cur === 'BGN' ? v / BGN_RATE : v;
}

// Магазини за строителни материали, обзавеждане и техника → ремонт/обзавеждане
// (капиталов разход за имота, не оперативен). Евристика по името на търговеца.
const RENO_RE = /praktiker|практикер|praktis|практис|bricolage|бриколаж|bauhaus|баухаус|stroykomplekt|ikea|икеа|mebelmag|мебелмаг|jysk|technopolis|технополис|emag|tmtelkom|tmt elkom|robicam|megamag|мегамаг|leroy|merlin|темакс|temax|домко|aiko|айко|стройкомплект|halfprice|vikiwat|llvtechnology/i;

// Некатегоризирано плащане над тази сума почти винаги е покупка/капитал, не
// текущ разход → не влиза в печалбата, показва се отделно за проверка.
const LARGE_UNCATEGORIZED = 10000;

const OPEX_LABELS = {
  счетоводство: 'Счетоводство', такса: 'Такси', разход: 'Банкови и др. такси', ток: 'Ток', вода: 'Вода',
  застраховка: 'Застраховки', друго: 'Други', интернет: 'Интернет', поддръжка: 'Поддръжка', данък: 'Данъци',
};

const norm = s => String(s || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, ' ').trim();
// Импортът от някои банки разкъсва името на търговеца на произволно място
// („PR AKTIKER", „ema g.bg") → сравняваме без интервали.
const squash = s => String(s || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '');

// Познати търговци → четимо име (иначе „PRA KTIKER" и „PRAK TIKER" са два реда).
const MERCHANTS = [
  [/praktiker|практикер/, 'Практикер'], [/praktis|практис/, 'Практис'], [/emag/, 'eMAG'], [/jysk/, 'JYSK'],
  [/ikea|икеа/, 'IKEA'], [/metrocash|метро/, 'Метро'], [/technopolis|технополис/, 'Технополис'],
  [/mebelmag|мебелмаг/, 'Мебелмаг'], [/bricolage/, 'Mr. Bricolage'], [/bauhaus|баухаус/, 'Баухаус'],
  [/megamag/, 'Мегамаг'], [/stroykomplekt|стройкомплект/, 'Стройкомплект'], [/tmtelkom/, 'ТМТ Елком'],
  [/econt|еконт/, 'Еконт'], [/officeshoes/, 'Office Shoes'], [/google/, 'Google Workspace'],
  [/superhosting/, 'SuperHosting'], [/governance|егов/, 'Е-управление (такси)'], [/robicam/, 'Robicam'],
  [/llvtechnology/, 'LLV Technology'], [/halfprice/, 'Halfprice'], [/vikiwat/, 'Vikiwat'],
  [/ringmall/, 'Ring Mall'],
];

// Едно движение → { kind, label }.
//   kind: rent | deposit_in | deposit_out | other_in | financing | vat_refund | vat_paid |
//         opex | reno | purchase | metals | internal | owner | cash | unclear
function classify(t, ctx) {
  const cat = String(t.категория || '').trim();
  const who = `${t.контрагент || ''} ${t.основание || ''}`;
  const isOwner = ctx.ownerTokens.length && ctx.ownerTokens.every(tok => norm(t.контрагент).includes(tok));
  const isSelf = ctx.selfName && norm(t.контрагент).includes(ctx.selfName);

  if (t.operation === 'Кт') {
    if (cat === 'наем' || cat.startsWith('наем')) return { kind: 'rent', label: 'Наем' };
    if (cat === 'депозит_получен') return { kind: 'deposit_in', label: 'Получен депозит' };
    if (/възстанов/i.test(who) && /(^|\s)нап(\s|$)/i.test(norm(t.контрагент))) return { kind: 'vat_refund', label: 'Възстановен ДДС' };
    if (cat === 'equity_inject' || /заем/i.test(who) || isOwner) return { kind: 'financing', label: 'Финансиране от собственика' };
    if (isSelf || cat === 'вътрешен_превод') return { kind: 'internal', label: 'Вътрешен превод' };
    return { kind: 'other_in', label: 'Други постъпления' };
  }

  // Дт
  if (cat === 'ддс' || cat === 'нап_ддс') return { kind: 'vat_paid', label: 'ДДС към НАП' };
  if (cat === 'депозит_върнат') return { kind: 'deposit_out', label: 'Върнат депозит' };
  if (cat === 'благородни метали') return { kind: 'metals', label: 'Благородни метали' };
  if (cat === 'инвестиция') return { kind: 'purchase', label: 'Покупка на имоти' };
  if (cat === 'ремонт') return { kind: 'reno', label: 'Ремонт и обзавеждане' };
  if (isSelf || cat === 'вътрешен_превод') return { kind: 'internal', label: 'Вътрешен превод' };
  if (isOwner || cat.startsWith('заем')) return { kind: 'owner', label: 'Към собственика' };
  if (/atm|теглене/i.test(who)) return { kind: 'cash', label: 'Теглене в брой' };
  const learned = ctx.learned && ctx.learned.get(squash(t.контрагент));
  if (learned && (cat === 'разход_друг' || cat === 'разход' || !cat)) return learned;
  if (/нотариус|нот\.|notarius/i.test(who)) return { kind: 'purchase', label: 'Нотариус и такси по покупки' };
  if (RENO_RE.test(who) || RENO_RE.test(squash(who))) return { kind: 'reno', label: 'Ремонт и обзавеждане' };
  if ((cat === 'разход_друг' || cat === 'разход' || !cat) && toEur(t) >= LARGE_UNCATEGORIZED)
    return { kind: 'large', label: 'Голямо плащане без категория' };
  if (OPEX_LABELS[cat]) return { kind: 'opex', label: OPEX_LABELS[cat] };
  if (cat === 'разход_друг' || cat === 'разход' || !cat) return { kind: 'opex', label: null }; // етикет по контрагента
  // Лични категории в бизнес сметката (храна, почивка…) — покупки на собственика
  return { kind: 'owner', label: 'Лични покупки с фирмената карта' };
}

// Етикет за „други" оперативни разходи — по контрагента; плащанията с карта
// носят търговеца в основанието.
function counterpartyLabel(t) {
  const sq = squash(`${t.контрагент || ''} ${t.основание || ''}`);
  for (const [re, name] of MERCHANTS) if (name && re.test(sq)) return name;
  const c = String(t.контрагент || '').trim();
  if (/^към реф/i.test(c)) return 'Банкови такси';
  if (c) return c.replace(/\s+/g, ' ').slice(0, 40);
  const o = String(t.основание || '');
  const m = o.match(/EUR\s+[A-Z0-9]{6,9}\s+(.+?)(\s{2,}|\s+\d{4}\*|\s+SOFI|\s+Sofi|$)/);
  if (m) return m[1].replace(/\s+/g, ' ').slice(0, 40);
  if (/такса|към реф/i.test(o)) return 'Банкови такси';
  return o.replace(/\s+/g, ' ').slice(0, 40) || 'Без описание';
}

// Смесено плащане „наем + депозит": ако основанието говори за депозит и сумата
// е над наема по договора, излишъкът е депозит (не е оборот).
function splitDeposit(t, eur, rentByProperty) {
  if (!/депозит|deposit/i.test(String(t.основание || ''))) return { rent: eur, deposit: 0 };
  const r = rentByProperty.get(t.property_id);
  if (!r || eur <= r) return { rent: eur, deposit: 0 };
  return { rent: r, deposit: Math.round((eur - r) * 100) / 100 };
}

const emptyMonth = m => ({
  month: m, rent_gross: 0, rent_net: 0, opex: 0, vat_paid: 0, cash: 0, reno: 0, purchase: 0, metals: 0,
  vat_refund: 0, financing: 0, owner: 0, deposits: 0, large: 0, other_in: 0, internal: 0, tenants: 0, _payers: new Set(),
});

const r2 = v => Math.round(v * 100) / 100;

/**
 * @param {object} p
 * @param {number} p.year
 * @param {Array}  p.transactions   движения по фирмените сметки (поне за year и year-1)
 * @param {Array}  p.properties     [{id, адрес, vat_exempt}]
 * @param {Array}  p.contracts      [{property_id, status, monthly_rent, currency}]
 * @param {Array}  p.loans          [{id, банка, остатък, лихва, вноска, имоти}]
 * @param {object} p.issuer         {name, mol, vat_number, vat_rate}
 */
function buildAnnualReport({ year, transactions = [], properties = [], contracts = [], loans = [], issuer = {} }) {
  const Y = String(year);
  const vatRate = issuer.vat_number ? (Number(issuer.vat_rate) || 20) / 100 : 0;
  const props = new Map(properties.map(p => [p.id, p]));
  const netOf = (gross, pid) => {
    const p = props.get(pid);
    return vatRate && !(p && Number(p.vat_exempt)) ? gross / (1 + vatRate) : gross;
  };
  const rentByProperty = new Map();
  for (const c of contracts) {
    if (c.status !== 'active' || !c.property_id) continue;
    const v = (Number(c.monthly_rent) || 0) / (c.currency === 'BGN' ? BGN_RATE : 1);
    if (c.kind && c.kind !== 'наем') continue;
    rentByProperty.set(c.property_id, (rentByProperty.get(c.property_id) || 0) + v);
  }
  const ctx = {
    ownerTokens: norm(issuer.mol).split(' ').filter(w => w.length > 2).slice(0, 2),
    // без правната форма (\b не работи с кирилица в JS — затова по думи)
    selfName: norm(issuer.name).split(' ').filter(w => !['оод', 'еоод', 'ад', 'еад', 'ead', 'ood', 'eood', 'ltd'].includes(w)).join(' '),
  };

  const months = Array.from({ length: 12 }, (_, i) => emptyMonth(`${Y}-${String(i + 1).padStart(2, '0')}`));
  const prevMonths = Array.from({ length: 12 }, (_, i) => ({ month: `${year - 1}-${String(i + 1).padStart(2, '0')}`, rent_gross: 0, rent_net: 0 }));
  const opexBy = new Map(), renoBy = new Map(), unclearBy = new Map();
  const byProperty = new Map();
  const payers = new Map(); // нормализирано име → {name, months:Set, total, last}
  const largeList = [];
  let lastDate = null, firstDate = null;

  // Едно и също банково движение, внесено в два импорта (припокриващи се
  // извлечения, с различно разкъсано име, което е излъгало проверката при
  // импорта) — брои се веднъж. В рамките на една сесия не пипаме: два
  // еднакви превода в един ден са реални.
  // Ключ: посока + сума + име без интервали. Двойник е запис от ДРУГ импорт, когато:
  //  • датата е същата и основанието е същото (един и същ файл, внесен два пъти), или
  //  • датата е до 3 дни встрани (дата на плащане ↔ вальор) и основанието е
  //    записано РАЗЛИЧНО — т.е. същото движение от друг формат на извлечението.
  // Еднакво основание в различни дни = два реални превода (напр. две месечни
  // такси в един месец) — не се пипат.
  const seen = new Map(); let duplicates = 0, duplicates_amount = 0;
  const unique = [];
  const day = d => Date.parse(String(d || '').slice(0, 10)) / 864e5;
  for (const t of transactions) {
    const key = [t.operation, (Number(t.сума) || 0).toFixed(2), squash(t.контрагент).slice(0, 12)].join('|');
    const list = seen.get(key) || [];
    const osn = String(t.основание || '').trim();
    const twin = list.find(p => {
      if (p.paired || p.session_id == null || t.session_id == null || p.session_id === t.session_id) return false;
      const dd = Math.abs(p.day - day(t.дата));
      return (dd === 0 && p.osn === osn) || (dd <= 3 && p.osn !== osn);
    });
    if (twin) { twin.paired = true; duplicates++; duplicates_amount += toEur(t); continue; }
    list.push({ session_id: t.session_id, day: day(t.дата), osn });
    seen.set(key, list);
    unique.push(t);
  }

  // Контрагент, който веднъж е категоризиран (напр. „счетоводство"), носи
  // същия етикет и когато някой ред при него е останал „разход_друг".
  const cpLabel = new Map();
  for (const t of unique) {
    const cat = String(t.категория || '');
    if (t.operation === 'Дт' && OPEX_LABELS[cat] && cat !== 'разход' && squash(t.контрагент)) cpLabel.set(squash(t.контрагент), OPEX_LABELS[cat]);
  }

  // Контрагент, към когото поне веднъж има покупка/ремонт/метали, носи този вид
  // и в некатегоризираните си редове (най-честият вид печели).
  {
    const votes = new Map();
    const KIND = { инвестиция: ['purchase', 'Покупка на имоти'], ремонт: ['reno', 'Ремонт и обзавеждане'], 'благородни метали': ['metals', 'Благородни метали'] };
    for (const t of unique) {
      const k = KIND[String(t.категория || '')]; const sq = squash(t.контрагент);
      if (!k || !sq || t.operation !== 'Дт') continue;
      const v = votes.get(sq) || {}; v[k[0]] = (v[k[0]] || 0) + 1; votes.set(sq, v);
    }
    ctx.learned = new Map();
    for (const [sq, v] of votes) {
      const best = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
      const lbl = Object.values(KIND).find(k => k[0] === best)[1];
      ctx.learned.set(sq, { kind: best, label: lbl });
    }
  }

  for (const t of unique) {
    const d = String(t.дата || '').slice(0, 10);
    const m = d.slice(0, 7);
    const yr = d.slice(0, 4);
    if (yr !== Y && yr !== String(year - 1)) continue;
    const eur = toEur(t);
    const c = classify(t, ctx);

    if (yr === String(year - 1)) {
      if (c.kind === 'rent') {
        const pm = prevMonths[Number(m.slice(5)) - 1];
        pm.rent_gross += eur; pm.rent_net += netOf(eur, t.property_id);
      }
      continue;
    }
    if (!lastDate || d > lastDate) lastDate = d;
    if (!firstDate || d < firstDate) firstDate = d;
    const row = months[Number(m.slice(5)) - 1];

    switch (c.kind) {
      case 'rent': {
        const { rent, deposit } = splitDeposit(t, eur, rentByProperty);
        row.rent_gross += rent; row.rent_net += netOf(rent, t.property_id); row.deposits += deposit;
        // По имот, когато е известен: един човек често плаща ту на латиница, ту на
        // кирилица („PETAR IVANOV" / „ПЕТЪР ИВАНОВ") — това е един наемател.
        const key = t.property_id ? `p${t.property_id}` : (norm(t.контрагент) || 'без име');
        row._payers.add(key);
        const p = payers.get(key) || { name: '—', names: new Set(), months: new Set(), total: 0, last: '', property_id: t.property_id };
        const nm = (t.контрагент || '').trim();
        if (nm) p.names.add(norm(nm));
        p.months.add(m); p.total += rent;
        if (d >= p.last) { p.last = d; p.last_amount = rent; if (nm) p.name = nm; }
        payers.set(key, p);
        const pk = t.property_id || 0;
        const bp = byProperty.get(pk) || { property_id: t.property_id || null, gross: 0, net: 0 };
        bp.gross += rent; bp.net += netOf(rent, t.property_id); byProperty.set(pk, bp);
        break;
      }
      case 'deposit_in': row.deposits += eur; break;
      case 'deposit_out': row.deposits -= eur; break;
      case 'vat_refund': row.vat_refund += eur; break;
      case 'vat_paid': row.vat_paid += eur; break;
      case 'financing': row.financing += eur; break;
      case 'other_in': row.other_in += eur; break;
      case 'internal': row.internal += (t.operation === 'Кт' ? eur : -eur); break;
      case 'owner': row.owner += eur; break;
      case 'metals': row.metals += eur; break;
      case 'large': { row.large += eur; largeList.push({ date: d, label: counterpartyLabel(t), amount: r2(eur), description: String(t.основание || '').slice(0, 80) }); break; }
      case 'purchase': row.purchase += eur; break;
      case 'cash': row.cash += eur; { const k = 'Теглене в брой'; unclearBy.set(k, (unclearBy.get(k) || 0) + eur); } break;
      case 'reno': { row.reno += eur; const k = counterpartyLabel(t); renoBy.set(k, (renoBy.get(k) || 0) + eur); break; }
      case 'opex': {
        row.opex += eur;
        const k = (c.label && c.label !== OPEX_LABELS.разход ? c.label : null)
          || cpLabel.get(squash(t.контрагент)) || (String(t.контрагент || '').trim() ? counterpartyLabel(t) : c.label) || counterpartyLabel(t);
        opexBy.set(k, (opexBy.get(k) || 0) + eur);
        break;
      }
      default: break;
    }
  }

  // Последен месец с данни — по-нататък празен (бъдеще / неимпортирано)
  const lastMonth = lastDate ? lastDate.slice(0, 7) : null;
  let cumProfit = 0;
  const rows = months.map(mo => {
    const has = lastMonth && mo.month <= lastMonth && (!firstDate || mo.month >= firstDate.slice(0, 7));
    mo.tenants = mo._payers.size; delete mo._payers;
    const profit = mo.rent_net - mo.opex - mo.cash;
    if (has) cumProfit += profit;
    const out = { ...mo, has_data: !!has, profit: r2(profit), cum_profit: has ? r2(cumProfit) : null };
    for (const k of Object.keys(out)) if (typeof out[k] === 'number' && k !== 'tenants') out[k] = r2(out[k]);
    return out;
  });

  const live = rows.filter(r => r.has_data);
  const sum = k => r2(live.reduce((a, r) => a + r[k], 0));
  const totals = {
    rent_gross: sum('rent_gross'), rent_net: sum('rent_net'), opex: sum('opex'), cash: sum('cash'),
    vat_paid: sum('vat_paid'), vat_refund: sum('vat_refund'), reno: sum('reno'), purchase: sum('purchase'),
    metals: sum('metals'), financing: sum('financing'), owner: sum('owner'), deposits: sum('deposits'),
    other_in: sum('other_in'), internal: sum('internal'), large: sum('large'),
  };
  totals.profit = r2(totals.rent_net - totals.opex - totals.cash);
  totals.margin = totals.rent_net ? r2(totals.profit / totals.rent_net * 100) : null;
  totals.net_cash = r2(totals.rent_gross + totals.deposits + totals.vat_refund + totals.financing + totals.other_in + totals.internal
    - totals.opex - totals.cash - totals.vat_paid - totals.reno - totals.purchase - totals.metals - totals.owner - totals.large);

  // Сравнение с миналата година — само месеците, в които И ДВЕТЕ години имат
  // наеми (иначе месец без импорт отпреди година изглежда като ръст).
  const comparable = rows.map((r, i) => i).filter(i => rows[i].has_data && prevMonths[i].rent_gross > 0 && rows[i].rent_gross > 0);
  const prevSameNet = r2(comparable.reduce((a, i) => a + prevMonths[i].rent_net, 0));
  const curSameNet = r2(comparable.reduce((a, i) => a + rows[i].rent_net, 0));
  const prevHasData = comparable.length > 0;
  const yoy = prevHasData && prevSameNet ? r2((curSameNet / prevSameNet - 1) * 100) : null;

  // Наем на месец сега: последният ПЪЛЕН месец; ако последният е частичен — и него, с бележка
  const lastFull = [...live].reverse().find(r => r.month < lastMonth) || live[live.length - 1] || null;
  const run_rate = lastFull ? { month: lastFull.month, gross: lastFull.rent_gross, net: lastFull.rent_net, tenants: lastFull.tenants } : null;

  // Наематели: активни = платили в последните 2 месеца с данни; спрели = платили по-рано, но не и тогава
  const recent = new Set(live.slice(-2).map(r => r.month));
  const payerList = [...payers.values()].map(p => ({
    name: p.name, property_id: p.property_id || null,
    // различни платци по имота през годината (смяна на наемател или изписване)
    other_names: Math.max(0, p.names.size - 1),
    address: p.property_id && props.get(p.property_id) ? props.get(p.property_id).адрес : null,
    months: p.months.size, total: r2(p.total), last: p.last, last_amount: r2(p.last_amount || 0),
    active: [...p.months].some(m => recent.has(m)),
  })).sort((a, b) => b.total - a.total);

  // Лихви по кредитите за имотите, които носят приход на фирмата (плащат се
  // извън фирмената сметка → не са в печалбата, показват се отделно).
  const earning = new Set([...byProperty.values()].map(b => b.property_id).filter(Boolean));
  const parseIds = v => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch (_) { return String(v || '').split(/[,\s]+/).filter(Boolean).map(Number); } };
  const loanRows = loans.map(l => {
    const ids = parseIds(l.имоти).map(Number);
    const bal = (Number(l.остатък_calc) || Number(l.остатък) || 0) / (l.currency === 'BGN' ? BGN_RATE : 1);
    return {
      id: l.id, bank: l.банка, balance: r2(bal), rate: Number(l.лихва) || 0, payment: r2(Number(l.вноска) || 0),
      property_ids: ids, company: ids.some(id => earning.has(id)),
      interest_month: r2(bal * (Number(l.лихва) || 0) / 100 / 12),
    };
  });
  const companyLoans = loanRows.filter(l => l.company);
  const interestMonth = r2(companyLoans.reduce((a, l) => a + l.interest_month, 0));
  const financing = {
    loans: companyLoans,
    balance: r2(companyLoans.reduce((a, l) => a + l.balance, 0)),
    payment_month: r2(companyLoans.reduce((a, l) => a + l.payment, 0)),
    interest_month: interestMonth,
    interest_period: r2(interestMonth * live.length),
    profit_after_interest: r2(totals.profit - interestMonth * live.length),
  };

  const toList = (map, limit = 30) => [...map.entries()].map(([label, amount]) => ({ label, amount: r2(amount) }))
    .sort((a, b) => b.amount - a.amount).slice(0, limit);

  // 12-месечна прогноза при сегашния наем и средния опекс на месец
  const opexMonthly = live.length ? (totals.opex + totals.cash) / live.length : 0;
  const forecast = run_rate ? {
    rent_net_year: r2(run_rate.net * 12), rent_gross_year: r2(run_rate.gross * 12),
    opex_year: r2(opexMonthly * 12),
    profit_year: r2(run_rate.net * 12 - opexMonthly * 12),
    profit_after_interest_year: r2(run_rate.net * 12 - opexMonthly * 12 - interestMonth * 12),
  } : null;

  return {
    year: Number(year),
    period: { from: firstDate, to: lastDate, months_with_data: live.length },
    vat_rate: vatRate,
    months: rows,
    prev_year: { months: prevMonths.map(r => ({ ...r, rent_gross: r2(r.rent_gross), rent_net: r2(r.rent_net) })), same_period_net: prevSameNet, current_same_period_net: curSameNet, comparable_months: comparable.length, has_data: prevHasData },
    totals, yoy, run_rate, forecast, financing,
    opex_breakdown: toList(opexBy),
    reno_breakdown: toList(renoBy, 15),
    unclear: toList(unclearBy),
    large_uncategorized: largeList.sort((a, b) => b.amount - a.amount),
    by_property: [...byProperty.values()].map(b => ({
      ...b, gross: r2(b.gross), net: r2(b.net),
      address: b.property_id && props.get(b.property_id) ? props.get(b.property_id).адрес : 'Без имот',
    })).sort((a, b) => b.gross - a.gross),
    payers: payerList,
    data_quality: { duplicates_skipped: duplicates, duplicates_amount: r2(duplicates_amount) },
  };
}

module.exports = { buildAnnualReport, classify, toEur, splitDeposit, counterpartyLabel };
