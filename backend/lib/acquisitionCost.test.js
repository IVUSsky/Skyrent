const { acquisitionCost, acquisitionPct, DEFAULT_ACQ_PCT } = require('./acquisitionCost');

// Малък фалшив db, колкото да върне един ред от settings.
const fakeDb = (value) => ({
  prepare: () => ({ get: () => (value === undefined ? undefined : { value }) }),
});

describe('acquisitionCost', () => {
  it('смята процент от брутната цена, когато нищо не е заведено', () => {
    // Гараж 62 по НА: 34 000 € с ДДС × 4,75% = 1 615 €
    expect(acquisitionCost({}, 34000, 0.0475)).toBeCloseTo(1615, 2);
  });

  it('заведената сума бие процента', () => {
    expect(acquisitionCost({ acquisition_costs: 2400 }, 34000, 0.0475)).toBe(2400);
  });

  it('нула значи „няма такива разходи", не „смятай ги"', () => {
    // Това е разликата между 0 и NULL — заради нея колоната е nullable.
    expect(acquisitionCost({ acquisition_costs: 0 }, 34000, 0.0475)).toBe(0);
  });

  it('празен низ се държи като незаведено', () => {
    expect(acquisitionCost({ acquisition_costs: '' }, 34000, 0.0475)).toBeCloseTo(1615, 2);
  });

  it('без цена няма и разходи по придобиване', () => {
    expect(acquisitionCost({}, 0, 0.0475)).toBe(0);
    expect(acquisitionCost({}, null, 0.0475)).toBe(0);
  });

  it('нулев процент изключва начисляването', () => {
    expect(acquisitionCost({}, 34000, 0)).toBe(0);
  });

  it('боклук в полето не събаря сметката', () => {
    expect(acquisitionCost({ acquisition_costs: 'абв' }, 34000, 0.0475)).toBe(0);
    expect(acquisitionCost({ acquisition_costs: -500 }, 34000, 0.0475)).toBe(0);
  });

  it('липсващ имот не хвърля', () => {
    expect(acquisitionCost(null, 34000, 0.0475)).toBeCloseTo(1615, 2);
  });
});

describe('acquisitionPct', () => {
  it('връща дял, не проценти', () => {
    expect(acquisitionPct(fakeDb('5'))).toBeCloseTo(0.05, 6);
  });

  it('пада на подразбирането, когато в настройките няма ред', () => {
    expect(acquisitionPct(fakeDb(undefined))).toBeCloseTo(DEFAULT_ACQ_PCT / 100, 6);
  });

  it('пада на подразбирането при нечисло', () => {
    expect(acquisitionPct(fakeDb('горе-долу пет'))).toBeCloseTo(DEFAULT_ACQ_PCT / 100, 6);
  });

  it('нула се уважава — изключва начисляването', () => {
    expect(acquisitionPct(fakeDb('0'))).toBe(0);
  });

  it('отрицателна стойност не минава', () => {
    expect(acquisitionPct(fakeDb('-3'))).toBeCloseTo(DEFAULT_ACQ_PCT / 100, 6);
  });
});
