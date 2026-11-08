// Pure data-integrity rule engine. No DB/IO. Input = plain arrays.
const RATE = 1.95583;
const eur = t => String(t.currency).toUpperCase() === 'BGN' ? (Number(t.сума) / RATE) : Number(t.сума);
const mkey = d => (d || '').slice(0, 7);
const period = t => t.месец || mkey(t.дата);
const sig = (check, pid, m) => `${check}:${pid == null ? '' : pid}:${m || ''}`;

function runChecks({ transactions = [], properties = [], expenses = [], acks = [], contracts = [], today = new Date().toISOString().slice(0, 10) }) {
  const ackSet = new Map(acks.map(a => [a.signature, a.status]));
  const out = [];
  const push = (o) => { o.signature = o.signature || sig(o.check, o.property_id, o.месец); out.push(o); };

  // duplicate (exact)
  const seen = {};
  for (const t of transactions) {
    const k = [t.дата, Math.round(Number(t.сума) * 100), t.operation, (t.контрагент || '').trim().toUpperCase()].join('|');
    if (seen[k]) push({ check: 'duplicate', severity: 'high', property_id: t.property_id ?? null, месец: period(t),
      signature: `duplicate:${Math.min(seen[k], t.id)}:${Math.max(seen[k], t.id)}`,
      title: 'Дубликат транзакция', detail: `${t.дата} ${t.сума} ${t.operation} ${(t.контрагент || '').slice(0, 24)}`,
      tx_ids: [seen[k], t.id], fix: { type: 'delete', tx_id: t.id } });
    else seen[k] = t.id;
  }

  // uncategorized
  for (const t of transactions) if (!t.категория) push({ check: 'uncategorized', severity: 'med',
    property_id: t.property_id ?? null, месец: period(t),
    signature: sig('uncategorized', t.id, period(t)),
    title: 'Без категория', detail: `${t.дата} ${t.сума} ${t.operation} ${(t.контрагент || '').slice(0, 24)}`,
    tx_ids: [t.id], fix: { type: 'category', tx_id: t.id } });

  // rent_no_property
  for (const t of transactions) if (t.категория === 'наем' && t.operation === 'Кт' && !t.property_id)
    push({ check: 'rent_no_property', severity: 'high', property_id: null, месец: period(t),
      signature: sig('rent_no_property', t.id, period(t)),
      title: 'Наем без имот', detail: `${t.дата} ${Math.round(eur(t))}€ ${(t.основание || '').slice(0, 28)}`,
      tx_ids: [t.id], fix: { type: 'category', tx_id: t.id } });

  // unassigned_rent — „приход_друг" Кт без имот, който наподобява наем
  // (платецът съвпада с наемател по име, или сумата = наема на имот).
  // Предлага имот за присвояване. Не пипа явно ненаемни преводи.
  const NONRENT = /покупк|дивидент|връщан|данъчн|погасяван|заплат|заем|комисион|лихва|abonament|такса/i;
  const STOP = new Set(['еоод', 'оод', 'ад', 'ет', 'ltd', 'llc', 'invest', 'инвест', 'ивиси', 'адвокат', 'превод', 'наем', 'захранване', 'сметка']);
  const toks = s => new Set(String(s || '').toUpperCase().replace(/[^A-ZА-Я0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w.toLowerCase())));
  const activeProps = properties.filter(p => Number(p.наем) > 0);
  for (const t of transactions) {
    if (t.operation !== 'Кт' || t.property_id) continue;
    if (t.категория !== 'приход_друг') continue;
    if (NONRENT.test((t.основание || '') + ' ' + (t.контрагент || ''))) continue;
    const e = eur(t);
    if (!(e >= 30 && e < 2000)) continue;

    const hay = toks((t.контрагент || '') + ' ' + (t.основание || ''));
    // name-match изисква И близка сума (иначе обща фамилия лъже — напр. „Муса")
    let nameMatch = null;
    for (const p of activeProps) {
      if (Math.abs(Number(p.наем) - e) > Math.max(8, Number(p.наем) * 0.15)) continue;
      const pt = toks(p.наемател); for (const w of pt) if (hay.has(w)) { nameMatch = p; break; }
      if (nameMatch) break;
    }
    const amtCands = activeProps.filter(p => Math.abs(Number(p.наем) - e) <= Math.max(5, Number(p.наем) * 0.03));

    let best = null, sev = 'med', candidates = [];
    if (nameMatch) { best = nameMatch; sev = 'high'; }
    else if (amtCands.length === 1) { best = amtCands[0]; }
    else if (amtCands.length > 1) { candidates = amtCands; }
    else continue;

    push({
      check: 'unassigned_rent', severity: sev, property_id: null, месец: period(t),
      signature: sig('unassigned_rent', t.id, period(t)),
      title: 'Възможен неприсвоен наем',
      detail: `${t.дата} ${Math.round(e)}€ — ${(t.контрагент || t.основание || '').slice(0, 26)}` + (best ? ` → ${best.адрес}` : ` → ${candidates.length} възможни`),
      tx_ids: [t.id],
      fix: { type: 'assign', tx_id: t.id, property_id: best ? best.id : null,
             candidates: (best ? [best] : candidates).map(p => ({ id: p.id, адрес: p.адрес, наем: p.наем })) },
    });
  }

  // per-property rent grouping
  const byProp = {};
  for (const t of transactions) if (t.operation === 'Кт' && t.категория === 'наем' && t.property_id)
    (byProp[t.property_id] = byProp[t.property_id] || []).push(t);

  for (const p of properties) {
    const rents = (byProp[p.id] || []).slice().sort((a, b) => (a.дата || '').localeCompare(b.дата || ''));
    const rent = Number(p.наем) || 0;
    const months = {};
    for (const t of rents) { const m = period(t); (months[m] = months[m] || { sum: 0, ids: [] }); months[m].sum += eur(t); months[m].ids.push(t.id); }
    const mk = Object.keys(months).sort();

    for (const m of mk) if (months[m].ids.length >= 2) push({ check: 'doubled_month', severity: 'med',
      property_id: p.id, месец: m, title: `Удвоен месец — ${p.адрес}`,
      detail: `${m}: ${Math.round(months[m].sum)}€ (${months[m].ids.length} плащания)`, tx_ids: months[m].ids, fix: { type: 'month', tx_ids: months[m].ids } });

    for (const m of mk) if (rent > 0 && months[m].ids.length === 1 && months[m].sum > rent * 1.7)
      push({ check: 'spike', severity: 'med', property_id: p.id, месец: m, title: `Висока сума — ${p.адрес}`,
        detail: `${m}: ${Math.round(months[m].sum)}€ (наем ${rent}€)`, tx_ids: months[m].ids, fix: { type: 'split', tx_id: months[m].ids[0] } });

    for (const t of rents) {
      const osn = t.основание || '';
      if (/^ДЕПОЗИТ \(split/i.test(osn)) continue;                 // мой split-sibling
      if (!/ДЕПОЗИТ|DEPOSIT|ГАРАНЦ/i.test(osn)) continue;
      if (!(rent > 0 && eur(t) > rent * 1.25)) continue;           // вече разделена наемна част → пропусни
      push({ check: 'deposit_mix', severity: 'med', property_id: p.id, месец: period(t),
        signature: sig('deposit_mix', t.id, period(t)),
        title: `Наем+депозит в едно — ${p.адрес}`, detail: `${t.дата} ${Math.round(eur(t))}€ | ${osn.slice(0, 30)}`,
        tx_ids: [t.id], fix: { type: 'split', tx_id: t.id } });
    }

    const active = p.наемател && !/^—|WIP|строи|DUPLICATE/i.test(p.наемател) && rent > 0;
    const tracked = (p.rent_channel || 'this') === 'this';

    if (active && tracked && !rents.length) push({ check: 'active_no_rent', severity: 'low', property_id: p.id, месец: null,
      title: `Активен без наем — ${p.адрес}`, detail: `нает. ${p.наемател}, наем ${rent}€ — 0 наемни транзакции`,
      tx_ids: [], fix: { type: 'rent_channel', property_id: p.id } });

    if (tracked && mk.length >= 3) {
      const [fy, fm] = mk[0].split('-').map(Number); const [ly, lm] = mk[mk.length - 1].split('-').map(Number);
      const gaps = [];
      for (let y = fy, mo = fm; (y < ly) || (y === ly && mo <= lm); ) { const key = `${y}-${String(mo).padStart(2, '0')}`; if (!months[key]) gaps.push(key); mo++; if (mo > 12) { mo = 1; y++; } }
      if (gaps.length) push({ check: 'period_gap', severity: 'low', property_id: p.id, месец: gaps[0],
        signature: sig('period_gap', p.id, gaps.join(',')),
        title: `Липсващ месец — ${p.адрес}`, detail: `липсват: ${gaps.join(', ')}`, tx_ids: [], fix: { type: 'rent_channel', property_id: p.id } });
    }

    if (rents.length) {
      const sums = rents.map(eur).sort((a, b) => a - b); const med = sums[Math.floor(sums.length / 2)];
      if (rent > 0 && Math.abs(med - rent) / rent > 0.25) push({ check: 'rent_vs_record', severity: 'low', property_id: p.id, месец: null,
        title: `Наем ≠ запис — ${p.адрес}`, detail: `медиана плащане ${Math.round(med)}€ vs запис ${rent}€`, tx_ids: [], fix: null });
    }
  }

  // Два действащи договора на един имот с ЗАСТЪПВАЩИ СЕ периоди.
  // Тиха грешка: нищо не я показва, а наемът, фактурите и напомнянията се
  // водят по ИМОТ. Излиза наяве чак когато някой „не си плати" или когато
  // прекратяването освободи жилището на друг наемател.
  // Намерена на 08.11.2026 на два имота в ПРОД базата.
  // Групира се по имот И ПО ВИД. Наемен договор и интернет абонамент за един
  // и същ човек на един имот са нормални и съжителстват нарочно — интернет
  // препродажбата работи точно така. Първата версия на това правило ги
  // сравняваше само по име и обяви Иширков 24 ап.9 за „вписан два пъти";
  // Иво щеше да обедини два редовни договора заради моя фалшив сигнал.
  const kindOf = (c) => String(c.kind || 'наем').toLowerCase();
  const activeByProp = {};
  for (const c of contracts) {
    if (String(c.status || '').toLowerCase() !== 'active') continue;
    if (!c.property_id) continue;
    const key = `${c.property_id}|${kindOf(c)}`;
    (activeByProp[key] = activeByProp[key] || []).push(c);
  }
  const periodsOverlap = (a, b) => {
    const as = a.start_date || '', ae = a.end_date || '9999-12-31';
    const bs = b.start_date || '', be = b.end_date || '9999-12-31';
    return as <= be && bs <= ae;
  };
  const contractTenant = (c) => String(c.tenant_name || '').trim() || '(без име)';
  const addrOf = (pid) => (properties.find(x => String(x.id) === String(pid)) || {}).адрес || ('имот ' + pid);

  for (const [key, arr] of Object.entries(activeByProp)) {
    if (arr.length < 2) continue;
    const pid = key.split('|')[0];
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      if (!periodsOverlap(arr[i], arr[j])) continue;
      const ids = [arr[i].id, arr[j].id].sort((x, y) => x - y);
      const same = contractTenant(arr[i]) === contractTenant(arr[j]);
      push({
        check: same ? 'duplicate_contract' : 'overlapping_contracts',
        severity: 'high', property_id: Number(pid), месец: null,
        signature: `overlap:${ids[0]}:${ids[1]}`,
        title: same ? `Един договор, вписан два пъти — ${addrOf(pid)}`
                    : `Два действащи договора на един имот — ${addrOf(pid)}`,
        detail: `${contractTenant(arr[i])} (${arr[i].start_date || '?'}–${arr[i].end_date || 'безсрочен'}) и `
              + `${contractTenant(arr[j])} (${arr[j].start_date || '?'}–${arr[j].end_date || 'безсрочен'})`,
        tx_ids: [], contract_ids: ids, fix: null,
      });
    }
  }

  // Изтекъл договор, който още се води действащ — наемателят отдавна си е
  // тръгнал, а имотът стои зает и не влиза в обявите.
  for (const c of contracts) {
    if (String(c.status || '').toLowerCase() !== 'active') continue;
    if (!c.end_date || c.end_date >= today) continue;
    push({ check: 'expired_still_active', severity: 'med', property_id: c.property_id ?? null, месец: null,
      signature: `expired:${c.id}`,
      title: `Изтекъл договор, още „действащ" — ${addrOf(c.property_id)}`,
      detail: `${contractTenant(c)} · изтекъл на ${c.end_date}`,
      tx_ids: [], contract_ids: [c.id], fix: null });
  }

  // filter acknowledged
  return out.filter(o => !ackSet.has(o.signature));
}

module.exports = { runChecks, _eur: eur, _RATE: RATE };
