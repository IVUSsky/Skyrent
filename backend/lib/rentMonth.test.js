const { rentMonthFromReason } = require('./rentMonth');

describe('месецът за наема от основанието', () => {
  it('латиница: NAEM MESEC SEPTEMVRI 2026 на 31.08 → 2026-09 (Козовски)', () => {
    expect(rentMonthFromReason('NAEM MESEC SEPTEMVRI 2026;NAEM MESEC SEP', '2026-08-31')).toBe('2026-09');
  });
  it('кирилица с година и без', () => {
    expect(rentMonthFromReason('НАЕМ М.СЕПТЕМВРИ 2026', '2026-09-02')).toBe('2026-09');
    expect(rentMonthFromReason('НАЕМ СЕПТЕМВРИ', '2026-09-05')).toBe('2026-09');
    expect(rentMonthFromReason('НАЕМ НА МАЗЕ Н.8 СЕПТ 2026', '2026-08-31')).toBe('2026-09');
  });
  it('английски', () => {
    expect(rentMonthFromReason('RENT GABRIETA SEPTEMBER 2026', '2026-09-01')).toBe('2026-09');
    expect(rentMonthFromReason('RENT GABRIETA AUGUST 2026', '2026-08-03')).toBe('2026-08');
  });
  it('числово „09 26" и „08.2026"', () => {
    expect(rentMonthFromReason('НАЕМ ПО ДОГОВОР 09 26', '2026-09-03')).toBe('2026-09');
    expect(rentMonthFromReason('НАЕМ ГАРАЖ 09', '2026-08-19')).toBeNull(); // „09" без година не е месец
    expect(rentMonthFromReason('наем 08.2026', '2026-08-01')).toBe('2026-08');
  });
  it('без месец → null; далечен месец (шум) → null', () => {
    expect(rentMonthFromReason('ПЛАЩАНЕ ПО ДОГОВОР ГАРАЖ 34', '2026-09-09')).toBeNull();
    expect(rentMonthFromReason('НАЕМ ЯНУАРИ', '2026-09-09')).toBeNull();
    expect(rentMonthFromReason('', '2026-09-09')).toBeNull();
  });
  it('дата в основанието не се бърка с месец (14.09.2026 → само ако е месец)', () => {
    expect(rentMonthFromReason('NAEM MAZE .16 - FONTANI', '2026-09-18')).toBeNull();
  });
});
