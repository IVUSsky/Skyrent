// Unit tests for the data-integrity rule engine (lib/integrityChecks.js).
// The module is pure: no DB / IO, input is plain arrays, output is a list of
// finding objects. These tests pin the behaviour of every rule + the shared
// helpers (eur conversion, period derivation, signature-based ack suppression).
const { runChecks, _eur, _RATE } = require('./integrityChecks');

// --- fixtures ---------------------------------------------------------------
// Minimal valid transaction. Override per-test with the `over` object.
const tx = (over = {}) => ({
  id: 1,
  дата: '2026-03-10',
  сума: '500',
  currency: 'EUR',
  operation: 'Кт',
  контрагент: '',
  категория: undefined,
  ...over,
});

const prop = (over = {}) => ({
  id: 1,
  адрес: 'ул. Тест 1',
  наем: 500,
  наемател: 'Иван Петров',
  rent_channel: 'this',
  ...over,
});

// Convenience: filter runChecks output by check name.
const only = (out, check) => out.filter(o => o.check === check);
const first = (out, check) => out.find(o => o.check === check);

// ---------------------------------------------------------------------------
describe('eur helper (BGN->EUR normalization)', () => {
  test('uses the fixed Bulgarian conversion rate 1.95583', () => {
    expect(_RATE).toBe(1.95583);
    expect(_eur({ currency: 'BGN', сума: '1955.83' })).toBeCloseTo(1000, 2);
  });

  test('passes EUR amounts through unchanged', () => {
    expect(_eur({ currency: 'EUR', сума: '500' })).toBe(500);
  });

  test('is case-insensitive for the currency code', () => {
    expect(_eur({ currency: 'bgn', сума: '19.5583' })).toBeCloseTo(10, 2);
  });
});

describe('runChecks — general shape', () => {
  test('empty input produces no findings', () => {
    expect(runChecks({})).toEqual([]);
  });

  test('every finding carries a stable, unique signature', () => {
    const out = runChecks({ transactions: [tx({ id: 1, категория: 'наем', operation: 'Кт' })] });
    for (const o of out) expect(typeof o.signature).toBe('string');
    expect(new Set(out.map(o => o.signature)).size).toBe(out.length);
  });
});

describe('runChecks — duplicate', () => {
  test('flags an exact duplicate and proposes deleting the later one', () => {
    const out = runChecks({
      transactions: [
        tx({ id: 1, дата: '2026-03-10', сума: '500', operation: 'Кт', контрагент: 'Иван' }),
        tx({ id: 2, дата: '2026-03-10', сума: '500', operation: 'Кт', контрагент: 'Иван' }),
      ],
    });
    const dup = first(out, 'duplicate');
    expect(dup).toBeTruthy();
    expect(dup.severity).toBe('high');
    expect(dup.tx_ids).toEqual([1, 2]); // min/max id ordering
    expect(dup.fix).toEqual({ type: 'delete', tx_id: 2 }); // delete the 2nd occurrence
  });

  test('does not flag transactions that differ in amount', () => {
    const out = runChecks({
      transactions: [tx({ id: 1, сума: '500' }), tx({ id: 2, сума: '499' })],
    });
    expect(only(out, 'duplicate')).toHaveLength(0);
  });

  test('treats counterparty as case/whitespace-insensitive', () => {
    const out = runChecks({
      transactions: [tx({ id: 1, контрагент: ' иван ' }), tx({ id: 2, контрагент: 'ИВАН' })],
    });
    expect(only(out, 'duplicate')).toHaveLength(1);
  });
});

describe('runChecks — uncategorized', () => {
  test('flags a transaction with no category', () => {
    const out = runChecks({ transactions: [tx({ id: 7 })] });
    const u = first(out, 'uncategorized');
    expect(u).toBeTruthy();
    expect(u.severity).toBe('med');
    expect(u.fix).toEqual({ type: 'category', tx_id: 7 });
  });

  test('leaves categorized transactions alone', () => {
    const out = runChecks({ transactions: [tx({ id: 7, категория: 'наем' })] });
    expect(only(out, 'uncategorized')).toHaveLength(0);
  });

  test('derives the month (месец) from дата via the YYYY-MM prefix', () => {
    const out = runChecks({ transactions: [tx({ id: 1, дата: '2026-03-10' })] });
    expect(first(out, 'uncategorized').месец).toBe('2026-03');
  });
});

describe('runChecks — rent_no_property', () => {
  test('flags incoming rent (наем / Кт) that has no property', () => {
    const out = runChecks({ transactions: [tx({ id: 1, категория: 'наем', operation: 'Кт' })] });
    const r = first(out, 'rent_no_property');
    expect(r.severity).toBe('high');
    expect(r.fix.type).toBe('category');
  });

  test('does not flag rent that already has a property', () => {
    const out = runChecks({ transactions: [tx({ id: 1, категория: 'наем', operation: 'Кт', property_id: 5 })] });
    expect(only(out, 'rent_no_property')).toHaveLength(0);
  });

  test('ignores outgoing (Дт) rent lines', () => {
    const out = runChecks({ transactions: [tx({ id: 1, категория: 'наем', operation: 'Дт' })] });
    expect(only(out, 'rent_no_property')).toHaveLength(0);
  });
});

describe('runChecks — unassigned_rent', () => {
  test('name + amount match proposes the property at high severity', () => {
    const p = prop({ id: 5, наем: 500, наемател: 'Иван Петров' });
    const t = tx({
      id: 1, категория: 'приход_друг', operation: 'Кт', сума: '500', currency: 'EUR',
      контрагент: 'Иван Петров', property_id: null,
    });
    const out = runChecks({ transactions: [t], properties: [p] });
    const u = first(out, 'unassigned_rent');
    expect(u).toBeTruthy();
    expect(u.severity).toBe('high');
    expect(u.fix.type).toBe('assign');
    expect(u.fix.property_id).toBe(5);
  });

  test('skips obviously non-rent transfers (NONRENT keywords)', () => {
    const p = prop({ id: 5, наем: 500, наемател: 'Иван Петров' });
    const t = tx({
      id: 1, категория: 'приход_друг', operation: 'Кт', сума: '500', currency: 'EUR',
      контрагент: 'Иван Петров', основание: 'дивиденти март',
    });
    const out = runChecks({ transactions: [t], properties: [p] });
    expect(only(out, 'unassigned_rent')).toHaveLength(0);
  });
});

describe('runChecks — doubled_month', () => {
  test('flags two rent payments for the same property + month', () => {
    const p = prop({ id: 1, наем: 500 });
    const out = runChecks({
      properties: [p],
      transactions: [
        tx({ id: 10, категория: 'наем', operation: 'Кт', property_id: 1, дата: '2026-03-05', сума: '500', currency: 'EUR' }),
        tx({ id: 11, категория: 'наем', operation: 'Кт', property_id: 1, дата: '2026-03-20', сума: '500', currency: 'EUR' }),
      ],
    });
    const d = first(out, 'doubled_month');
    expect(d).toBeTruthy();
    expect(d.tx_ids).toEqual([10, 11]);
    expect(d.fix.type).toBe('month');
  });
});

describe('runChecks — spike', () => {
  test('flags a single monthly payment above 1.7x the recorded rent', () => {
    const p = prop({ id: 1, наем: 500 });
    const out = runChecks({
      properties: [p],
      transactions: [tx({ id: 10, категория: 'наем', operation: 'Кт', property_id: 1, дата: '2026-03-05', сума: '1000', currency: 'EUR' })],
    });
    const s = first(out, 'spike');
    expect(s).toBeTruthy();
    expect(s.fix.type).toBe('split');
  });
});

describe('runChecks — deposit_mix', () => {
  test('flags rent + deposit combined in one payment', () => {
    const p = prop({ id: 1, наем: 500 });
    const out = runChecks({
      properties: [p],
      transactions: [tx({
        id: 10, категория: 'наем', operation: 'Кт', property_id: 1, дата: '2026-03-05',
        сума: '1000', currency: 'EUR', основание: 'ДЕПОЗИТ + наем март',
      })],
    });
    const d = first(out, 'deposit_mix');
    expect(d).toBeTruthy();
    expect(d.fix.type).toBe('split');
  });
});

describe('runChecks — active_no_rent', () => {
  test('flags an active property with zero rent transactions', () => {
    const out = runChecks({ transactions: [], properties: [prop({ id: 1 })] });
    const a = first(out, 'active_no_rent');
    expect(a).toBeTruthy();
    expect(a.severity).toBe('low');
    expect(a.fix.type).toBe('rent_channel');
  });

  test('excludes placeholder tenants (WIP / DUPLICATE)', () => {
    const out = runChecks({ transactions: [], properties: [prop({ id: 1, наемател: 'WIP' })] });
    expect(only(out, 'active_no_rent')).toHaveLength(0);
  });

  test('excludes properties tracked off-platform', () => {
    const out = runChecks({ transactions: [], properties: [prop({ id: 1, rent_channel: 'external' })] });
    expect(only(out, 'active_no_rent')).toHaveLength(0);
  });
});

describe('runChecks — period_gap', () => {
  test('reports the missing month in a 3+ month sequence', () => {
    const p = prop({ id: 1, наем: 500 });
    const out = runChecks({
      properties: [p],
      transactions: [
        tx({ id: 1, категория: 'наем', operation: 'Кт', property_id: 1, месец: '2026-01', сума: '500', currency: 'EUR' }),
        tx({ id: 2, категория: 'наем', operation: 'Кт', property_id: 1, месец: '2026-02', сума: '500', currency: 'EUR' }),
        tx({ id: 3, категория: 'наем', operation: 'Кт', property_id: 1, месец: '2026-04', сума: '500', currency: 'EUR' }),
      ],
    });
    const g = first(out, 'period_gap');
    expect(g).toBeTruthy();
    expect(g.detail).toContain('2026-03');
  });
});

describe('runChecks — rent_vs_record', () => {
  test('flags when the median payment diverges >25% from recorded rent', () => {
    const p = prop({ id: 1, наем: 500 });
    const out = runChecks({
      properties: [p],
      transactions: [
        tx({ id: 1, категория: 'наем', operation: 'Кт', property_id: 1, дата: '2026-01-05', сума: '700', currency: 'EUR' }),
        tx({ id: 2, категория: 'наем', operation: 'Кт', property_id: 1, дата: '2026-02-05', сума: '700', currency: 'EUR' }),
      ],
    });
    const r = first(out, 'rent_vs_record');
    expect(r).toBeTruthy();
    expect(r.fix).toBeNull(); // informational only, no automatic fix
  });
});

describe('runChecks — ack suppression', () => {
  test('a finding whose signature is acknowledged is filtered out', () => {
    const t = tx({ id: 1, категория: 'наем', operation: 'Кт' }); // triggers rent_no_property

    // First run: capture the exact signature the engine assigns.
    const { signature } = first(runChecks({ transactions: [t] }), 'rent_no_property');

    // Second run: acknowledge that signature -> it disappears.
    const out = runChecks({ transactions: [t], acks: [{ signature, status: 'ignored' }] });
    expect(only(out, 'rent_no_property')).toHaveLength(0);
  });

  test('unrelated acknowledgements do not suppress other findings', () => {
    const t = tx({ id: 1, категория: 'наем', operation: 'Кт' });
    const out = runChecks({ transactions: [t], acks: [{ signature: 'bogus:does:not-match', status: 'ignored' }] });
    expect(first(out, 'rent_no_property')).toBeTruthy();
  });
});
