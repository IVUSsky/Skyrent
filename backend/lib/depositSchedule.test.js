// Разсрочен депозит. Двете неща, които не бива да се чупят: заварените
// договори да продължат да работят като преди, и Чл.13 да не обещава сума,
// различна от сбора на фактурите.
const {
  depositSchedule, validateDepositSplit, depositPlaceholders, rentMonth,
} = require('./depositSchedule');

const base = { deposit: 700, start_date: '2026-05-10' };

describe('график на депозита', () => {
  it('заварен договор без разбивка — всичко при подписване', () => {
    const s = depositSchedule(base);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ part: 1, amount: 700, when: 'signing' });
  });

  it('две вноски с наема — месеците идват от началната дата, не са „януари/февруари"', () => {
    const s = depositSchedule({ ...base, deposit_at_signing: 0, deposit_part_1: 350, deposit_part_2: 350 });
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ part: 2, amount: 350, month: '2026-05', monthName: 'май' });
    expect(s[1]).toMatchObject({ part: 3, amount: 350, month: '2026-06', monthName: 'юни' });
  });

  it('трите части на Чл.13 едновременно', () => {
    const s = depositSchedule({ ...base, deposit_at_signing: 300, deposit_part_1: 200, deposit_part_2: 200 });
    expect(s.map(x => [x.part, x.amount])).toEqual([[1, 300], [2, 200], [3, 200]]);
  });

  it('нулевите вноски не влизат в графика', () => {
    const s = depositSchedule({ ...base, deposit_at_signing: 700, deposit_part_1: 0, deposit_part_2: 0 });
    expect(s).toHaveLength(1);
  });

  it('декемврийски договор прехвърля в следващата година', () => {
    const s = depositSchedule({
      deposit: 600, start_date: '2026-12-01',
      deposit_at_signing: 0, deposit_part_1: 300, deposit_part_2: 300,
    });
    expect(s[0]).toMatchObject({ month: '2026-12', monthName: 'декември' });
    expect(s[1]).toMatchObject({ month: '2027-01', monthName: 'януари' });
  });

  it('без начална дата вноската пак се води, но без месец', () => {
    const s = depositSchedule({ deposit: 400, deposit_at_signing: 0, deposit_part_1: 400, deposit_part_2: 0 });
    expect(s[0]).toMatchObject({ part: 2, amount: 400, month: null, label: 'с наема' });
  });

  it('договор без депозит няма график', () => {
    expect(depositSchedule({ deposit: 0, start_date: '2026-05-10' })).toEqual([]);
  });
});

describe('проверка на разбивката', () => {
  it('сборът трябва да дава депозита', () => {
    expect(validateDepositSplit({ deposit: 700, deposit_at_signing: 300, deposit_part_1: 200, deposit_part_2: 200 }).ok).toBe(true);
  });

  it('несъответствие се отказва и казва и двете суми', () => {
    const r = validateDepositSplit({ deposit: 700, deposit_at_signing: 300, deposit_part_1: 200, deposit_part_2: 100 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('600,00');
    expect(r.error).toContain('700,00');
  });

  it('стотинките не трупат грешка — 166.67+166.67+166.66 = 500', () => {
    expect(validateDepositSplit({ deposit: 500, deposit_at_signing: 166.67, deposit_part_1: 166.67, deposit_part_2: 166.66 }).ok).toBe(true);
  });

  it('празна разбивка е валидна — заварените договори не се чупят', () => {
    expect(validateDepositSplit({ deposit: 700 }).ok).toBe(true);
  });

  it('отрицателна вноска се отказва', () => {
    expect(validateDepositSplit({ deposit: 700, deposit_at_signing: 900, deposit_part_1: -200, deposit_part_2: 0 }).ok).toBe(false);
  });

  // Полето „Депозит" е `number` без долна граница и стрелката го вкарва под
  // нулата. Дотук -2 минаваше, стига вноските да дават -2.
  it('отрицателен депозит се отказва, дори вноските да дават точно него', () => {
    const r = validateDepositSplit({ deposit: -2, deposit_at_signing: -2, deposit_part_1: 0, deposit_part_2: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('отрицателен');
  });

  it('отрицателен депозит се отказва и без разбивка', () => {
    expect(validateDepositSplit({ deposit: -2 }).ok).toBe(false);
  });

  it('нулев депозит минава — договор без депозит е нормален', () => {
    expect(validateDepositSplit({ deposit: 0 }).ok).toBe(true);
  });
});

describe('плейсхолдърите в Чл.13', () => {
  it('пълнят трите суми и двата месеца', () => {
    const p = depositPlaceholders({ ...base, deposit_at_signing: 300, deposit_part_1: 200, deposit_part_2: 200 });
    expect(p['ДЕПОЗИТ_ПРИ_ПОДПИС']).toBe('300,00');
    expect(p['ДЕПОЗИТ_ВНОСКА_1']).toBe('200,00');
    expect(p['ДЕПОЗИТ_ВНОСКА_2']).toBe('200,00');
    expect(p['ДЕПОЗИТ_МЕСЕЦ_1']).toBe('май');
    expect(p['ДЕПОЗИТ_МЕСЕЦ_2']).toBe('юни');
  });

  it('липсваща вноска се изписва 0,00, а не празно', () => {
    const p = depositPlaceholders(base);
    expect(p['ДЕПОЗИТ_ПРИ_ПОДПИС']).toBe('700,00');
    expect(p['ДЕПОЗИТ_ВНОСКА_1']).toBe('0,00');
    expect(p['ДЕПОЗИТ_ВНОСКА_2']).toBe('0,00');
  });
});

describe('месец на наема', () => {
  it('отмества и сменя годината', () => {
    expect(rentMonth('2026-11-15', 1)).toEqual({ ym: '2026-12', name: 'декември' });
    expect(rentMonth('2026-12-15', 1)).toEqual({ ym: '2027-01', name: 'януари' });
  });
  it('без дата връща null', () => {
    expect(rentMonth(null, 0)).toBeNull();
    expect(rentMonth('боклук', 0)).toBeNull();
  });
});
