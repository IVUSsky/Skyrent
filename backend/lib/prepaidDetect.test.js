const { detectPrepaid, isEndOfMonth } = require('./prepaidDetect');

const propMap = {
  11: { 'адрес': 'Мал.Долина 46Б', 'наемател': 'Витали Руснак', 'наем': 576 },
  1:  { 'адрес': 'Иширков 24, ап.1', 'наемател': 'Хабип Муса', 'наем': 667 },
  21: { 'адрес': 'Пз. Болнична 7, ап.Б', 'наемател': 'Горкем', 'наем': 333 },
};
const run = (prevTxs, opts = {}) => detectPrepaid({
  prevTxs, prevMonth: '2026-09', propMap,
  isPaidThisMonth: opts.isPaidThisMonth || (() => false),
  paidPrevExcluding: opts.paidPrevExcluding || (() => 0),
});

describe('край на месеца', () => {
  it('последните 7 дни броят, началото — не', () => {
    expect(isEndOfMonth('2026-09-30', '2026-09')).toBe(true);
    expect(isEndOfMonth('2026-09-28', '2026-09')).toBe(true);
    expect(isEndOfMonth('2026-09-23', '2026-09')).toBe(false);
    expect(isEndOfMonth('2026-09-02', '2026-09')).toBe(false);
    expect(isEndOfMonth('2026-02-26', '2026-02')).toBe(true); // 28-дневен месец
  });
});

describe('кой наистина е платил предварително', () => {
  it('казусът 07.10: наем за септември, платен на 2 септември → НЕ е предплащане', () => {
    const r = run([{ id: 5324, property_id: 11, 'дата': '2026-09-02', 'сума': 576, 'контрагент': 'VITALII RUSNAK' }]);
    expect(r).toEqual([]);
  });

  it('същото за 06.09, 11.09, 15.09 — редовни плащания, не предплащане', () => {
    const r = run([
      { id: 1, property_id: 1, 'дата': '2026-09-06', 'сума': 667, 'контрагент': 'ХАБИП' },
      { id: 2, property_id: 21, 'дата': '2026-09-11', 'сума': 332, 'контрагент': 'ГЬОРКЕМ' },
    ]);
    expect(r).toEqual([]);
  });

  it('превод на 30.09, когато септември вече е платен → ДА, предплащане', () => {
    const r = run(
      [{ id: 5388, property_id: 11, 'дата': '2026-09-30', 'сума': 576, 'контрагент': 'ВИТАЛИЙ РУСНАК' }],
      { paidPrevExcluding: () => 576 },
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ property_id: 11, tx_id: 5388, 'дата': '2026-09-30' });
  });

  it('превод на 30.09, но септември НЕ е платен → това е наемът за септември, не предплащане', () => {
    const r = run(
      [{ id: 9, property_id: 11, 'дата': '2026-09-30', 'сума': 576, 'контрагент': 'ВИТАЛИЙ' }],
      { paidPrevExcluding: () => 0 },
    );
    expect(r).toEqual([]);
  });

  it('вече платен този месец → не се показва', () => {
    const r = run(
      [{ id: 10, property_id: 11, 'дата': '2026-09-30', 'сума': 576 }],
      { paidPrevExcluding: () => 576, isPaidThisMonth: (id) => id === 11 },
    );
    expect(r).toEqual([]);
  });

  it('сума, различна от наема с над 10% → не е наем за месеца', () => {
    const r = run(
      [{ id: 11, property_id: 11, 'дата': '2026-09-29', 'сума': 200 }],
      { paidPrevExcluding: () => 576 },
    );
    expect(r).toEqual([]);
  });

  it('±10% разлика минава (332 при наем 333)', () => {
    const r = run(
      [{ id: 12, property_id: 21, 'дата': '2026-09-29', 'сума': 332 }],
      { paidPrevExcluding: () => 333 },
    );
    expect(r).toHaveLength(1);
  });

  it('два превода за един имот → един ред, не два', () => {
    const r = run(
      [
        { id: 13, property_id: 11, 'дата': '2026-09-28', 'сума': 576 },
        { id: 14, property_id: 11, 'дата': '2026-09-30', 'сума': 576 },
      ],
      { paidPrevExcluding: () => 576 },
    );
    expect(r).toHaveLength(1);
  });

  it('имот без наем или непознат имот се прескача', () => {
    const r = run([
      { id: 15, property_id: 999, 'дата': '2026-09-30', 'сума': 500 },
    ], { paidPrevExcluding: () => 500 });
    expect(r).toEqual([]);
  });
});
