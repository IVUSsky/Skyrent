// Self-contained assertion test for integrityChecks (no framework).
const assert = require('assert');
const { runChecks } = require('../lib/integrityChecks');

const properties = [
  { id: 1, адрес: 'A', наем: 500, наемател: 'Tenant A', rent_channel: 'this' },
  { id: 2, адрес: 'B', наем: 500, наемател: 'Tenant B', rent_channel: 'other' }, // rent elsewhere
  { id: 3, адрес: 'C', наем: 100, наемател: '— (WIP)', rent_channel: 'this' },    // not active
];
const tx = [
  // дубликат
  { id: 10, дата: '2026-02-01', сума: 500, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-02', контрагент: 'X', основание: '' },
  { id: 11, дата: '2026-02-01', сума: 500, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-02', контрагент: 'X', основание: '' },
  // удвоен месец (id12,13 в 2026-03)
  { id: 12, дата: '2026-03-01', сума: 500, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-03', контрагент: 'X', основание: '' },
  { id: 13, дата: '2026-03-28', сума: 500, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-03', контрагент: 'X', основание: '' },
  // spike (1tx > 1.7×)
  { id: 14, дата: '2026-04-01', сума: 1200, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-04', контрагент: 'X', основание: '' },
  // deposit_mix истински (> 1.25× наем + 'депозит')
  { id: 15, дата: '2026-05-01', сума: 900, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-05', контрагент: 'X', основание: 'наем и депозит' },
  // deposit_mix FALSE-positive: split sibling (основание 'ДЕПОЗИТ (split') → НЕ флагва
  { id: 16, дата: '2025-11-25', сума: 665, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2025-12', контрагент: 'X', основание: 'ДЕПОЗИТ (split от #99): X' },
  // deposit_mix FALSE-positive: депозит в текст но сума ≈ наем (Деница-стил) → НЕ флагва
  { id: 17, дата: '2026-06-01', сума: 490, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-06', контрагент: 'X', основание: 'наем юни половин депозит' },
  // некатегоризиран
  { id: 18, дата: '2026-01-09', сума: 50, currency: 'EUR', operation: 'Дт', категория: '', property_id: null, месец: '2026-01', контрагент: 'Y', основание: '' },
  // наем без имот
  { id: 19, дата: '2026-01-10', сума: 500, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: null, месец: '2026-01', контрагент: 'Z', основание: '' },
];

function run(acks = []) { return runChecks({ transactions: tx, properties, expenses: [], acks }); }
const f = run();
const has = (check, pred = () => true) => f.some(x => x.check === check && pred(x));

assert(has('duplicate'), 'duplicate not found');
assert(has('doubled_month', x => x.property_id === 1 && x.месец === '2026-03'), 'doubled_month 2026-03 missing');
assert(has('spike', x => x.property_id === 1 && x.месец === '2026-04'), 'spike 2026-04 missing');
assert(has('deposit_mix', x => x.tx_ids.includes(15)), 'real deposit_mix missing');
assert(!has('deposit_mix', x => x.tx_ids.includes(16)), 'split sibling wrongly flagged deposit_mix');
assert(!has('deposit_mix', x => x.tx_ids.includes(17)), 'rent-portion wrongly flagged deposit_mix');
assert(has('uncategorized', x => x.tx_ids.includes(18)), 'uncategorized missing');
assert(has('rent_no_property', x => x.tx_ids.includes(19)), 'rent_no_property missing');
assert(!has('active_no_rent', x => x.property_id === 2), 'active_no_rent should be suppressed for rent_channel=other');
assert(!has('active_no_rent', x => x.property_id === 1), 'active_no_rent false positive on prop 1');
assert(f.every(x => typeof x.signature === 'string' && x.signature.length), 'finding missing signature');
const oneSig = f.find(x => x.check === 'spike').signature;
const after = run([{ signature: oneSig, status: 'accepted' }]);
assert(!after.some(x => x.signature === oneSig), 'accepted finding not filtered');

console.log('✓ all integrity checks pass (' + f.length + ' findings on fixtures)');
