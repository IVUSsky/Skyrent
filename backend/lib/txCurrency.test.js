const { txCurrency, txEur, BGN_RATE } = require('./txCurrency');

describe('txCurrency', () => {
  it('колоната бие датата', () => {
    // Същината на поправката: левово движение от 2026 г. се чете като лева,
    // а не като евро само защото датата е след приемането на еврото.
    expect(txCurrency('BGN', '2026-02-24')).toBe('BGN');
    expect(txCurrency('EUR', '2025-04-22')).toBe('EUR');
  });

  it('не се подвежда от регистър и празни места', () => {
    expect(txCurrency(' bgn ', '2026-05-01')).toBe('BGN');
    expect(txCurrency('eur', '2025-01-01')).toBe('EUR');
  });

  it('празна колона → резерва по датата', () => {
    expect(txCurrency(null, '2025-12-31')).toBe('BGN');
    expect(txCurrency(null, '2026-01-01')).toBe('EUR');
    expect(txCurrency('', '2025-06-15')).toBe('BGN');
  });

  it('непозната валута се държи като празна', () => {
    expect(txCurrency('USD', '2025-06-15')).toBe('BGN');
    expect(txCurrency('xyz', '2026-06-15')).toBe('EUR');
  });

  it('без дата и без колона приема евро', () => {
    expect(txCurrency(null, null)).toBe('EUR');
  });

  it('границата 01.01.2026 е включително евро', () => {
    expect(txCurrency(null, '2025-12-31')).toBe('BGN');
    expect(txCurrency(null, '2026-01-01')).toBe('EUR');
  });
});

describe('txEur', () => {
  it('левовете се делят на фиксинга', () => {
    expect(txEur(1955.83, 'BGN', '2026-03-01')).toBeCloseTo(1000, 2);
  });

  it('еврата минават непроменени', () => {
    expect(txEur(1000, 'EUR', '2025-03-01')).toBe(1000);
  });

  it('реалният случай: 52 200 лв от февруари 2026', () => {
    // НА № 96 задава транша в лева; усвояването по ПроКредит е 26 689,44 €.
    expect(txEur(52200, 'BGN', '2026-02-24')).toBeCloseTo(26689.44, 2);
    // Преди поправката същият ред се четеше като 52 200 € — двойно.
    expect(txEur(52200, null, '2026-02-24')).toBe(52200);
  });

  it('нула и боклук не чупят', () => {
    expect(txEur(0, 'BGN', '2026-01-01')).toBe(0);
    expect(txEur(null, 'EUR', '2026-01-01')).toBe(0);
    expect(txEur('абв', 'EUR', '2026-01-01')).toBe(0);
  });

  it('фиксингът е законният', () => {
    expect(BGN_RATE).toBe(1.95583);
  });
});
