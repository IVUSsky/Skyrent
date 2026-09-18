// Дубликати от двоен импорт на една и съща банкова операция.
//
// ProBanking има два xlsx експорта („по сметка" и „Движения по сметки"), а до
// #227 вторият се четеше с грешни колони → контрагентът оставаше празен. Двата
// експорта записват и името различно („ПЕТЯ ИЛИЕВА СТОЙКОВА" / „Петя Илиева
// Стойкова"), а SQLite сравнява кирилицата case-sensitive. Ключът за дубликат
// (дата + операция + контрагент + сума) не ги хващаше → всеки превод по два пъти.
//
// Еднакво записаните двойки НЕ са дубликат: импортът и без това ги спира, така
// че ако ги има, те са реални отделни преводи (наем + депозит в два превода).

const { normalizeName } = require('./tenantNameMatch');

const RATE = 1.95583;
const toEur = (amt, cur) =>
  (String(cur || 'BGN').toUpperCase() === 'BGN' ? Number(amt || 0) / RATE : Number(amt || 0));

// Един и същ платец ли е? Празен контрагент (стар парсер) минава за същия.
function sameCounterparty(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return true;
  return na === nb;
}

// Кой ред остава: с име > без; с имот > без; с категория > без; после по-новият.
function richness(t) {
  return (String(t.контрагент || '').trim() ? 4 : 0)
       + (t.property_id ? 2 : 0)
       + (t.категория && t.категория !== 'неизвестно' ? 1 : 0);
}

// rows: транзакции {id, дата, operation, контрагент, сума, currency, property_id, категория}
// → [{ keep, drop }] за всяка двойка „същата операция, различно записан контрагент".
function findDuplicatePairs(rows) {
  const groups = new Map();
  for (const t of rows || []) {
    if (!t.дата) continue;
    const key = `${t.дата}|${t.operation || ''}|${Math.round(toEur(t.сума, t.currency) * 100)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const pairs = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => richness(b) - richness(a) || (b.id || 0) - (a.id || 0));
    const kept = [];
    for (const t of g) {
      const raw = String(t.контрагент || '').trim();
      const twin = kept.find(k => String(k.контрагент || '').trim() !== raw && sameCounterparty(k.контрагент, t.контрагент));
      if (twin) pairs.push({ keep: twin, drop: t });
      else kept.push(t);
    }
  }
  return pairs;
}

module.exports = { sameCounterparty, findDuplicatePairs, richness, toEur };
