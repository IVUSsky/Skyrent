const { allocateCommonOpex, opexWeight, isAncillary } = require('./opexAllocation');

const sum = (m) => [...m.values()].reduce((s, x) => s + x, 0);

describe('isAncillary', () => {
  it('познава прилежащите обекти', () => {
    ['Гараж', 'гараж', 'Паркомясто', 'паркомясто', 'Мазе', 'Склад', 'ПМ'].forEach(t => {
      expect(isAncillary(t), t).toBe(true);
    });
  });

  it('жилищата не са прилежащи', () => {
    ['2-стаен', '1-стаен', 'Апартамент', 'апартамент', 'Ателие', 'Къща'].forEach(t => {
      expect(isAncillary(t), t).toBe(false);
    });
  });

  it('празен или непознат тип минава за жилище', () => {
    // По-вероятно е да е апартамент, а и жилищата раждат общите разходи.
    expect(isAncillary('')).toBe(false);
    expect(isAncillary(null)).toBe(false);
    expect(isAncillary('Нещо ново')).toBe(false);
  });
});

describe('opexWeight', () => {
  it('извежда тежестта от типа', () => {
    expect(opexWeight({ 'тип': '2-стаен' })).toBe(1);
    expect(opexWeight({ 'тип': 'Гараж' })).toBe(0);
  });

  it('заведената стойност бие типа', () => {
    // Гараж, който все пак се чисти.
    expect(opexWeight({ 'тип': 'Гараж', opex_share: 0.5 })).toBe(0.5);
    // Апартамент, който не носи нищо (например празен по ремонт).
    expect(opexWeight({ 'тип': '2-стаен', opex_share: 0 })).toBe(0);
  });

  it('боклук в полето пада обратно на типа', () => {
    expect(opexWeight({ 'тип': 'Гараж', opex_share: 'абв' })).toBe(0);
    expect(opexWeight({ 'тип': '2-стаен', opex_share: -1 })).toBe(1);
    expect(opexWeight({ 'тип': '2-стаен', opex_share: '' })).toBe(1);
  });
});

describe('allocateCommonOpex', () => {
  const rows = [
    { id: 1, 'тип': '2-стаен', rent_annual: 6000 },
    { id: 2, 'тип': '2-стаен', rent_annual: 4000 },
    { id: 3, 'тип': 'Гараж',   rent_annual: 1200 },
    { id: 4, 'тип': 'Мазе',    rent_annual:  600 },
  ];

  it('гаражът и мазето не носят нищо', () => {
    const a = allocateCommonOpex(rows, 1000);
    expect(a.get(3)).toBe(0);
    expect(a.get(4)).toBe(0);
  });

  it('жилищата делят всичко по дял от наема си', () => {
    const a = allocateCommonOpex(rows, 1000);
    expect(a.get(1)).toBeCloseTo(600, 2);  // 6000 / 10000
    expect(a.get(2)).toBeCloseTo(400, 2);  // 4000 / 10000
  });

  it('сумата не се губи', () => {
    // Това е същественото: каквото гаражите не носят, пада върху жилищата.
    expect(sum(allocateCommonOpex(rows, 1000))).toBeCloseTo(1000, 2);
    expect(sum(allocateCommonOpex(rows, 38530.17))).toBeCloseTo(38530.17, 1);
  });

  it('портфейл само от гаражи пада обратно на дял от наема', () => {
    const only = [
      { id: 1, 'тип': 'Гараж', rent_annual: 1200 },
      { id: 2, 'тип': 'Мазе',  rent_annual:  600 },
    ];
    const a = allocateCommonOpex(only, 900);
    expect(a.get(1)).toBeCloseTo(600, 2);
    expect(a.get(2)).toBeCloseTo(300, 2);
    expect(sum(a)).toBeCloseTo(900, 2);
  });

  it('без наем — поравно, пак без да се губи сума', () => {
    const noRent = [
      { id: 1, 'тип': '2-стаен', rent_annual: 0 },
      { id: 2, 'тип': '2-стаен', rent_annual: 0 },
    ];
    const a = allocateCommonOpex(noRent, 500);
    expect(a.get(1)).toBeCloseTo(250, 2);
    expect(a.get(2)).toBeCloseTo(250, 2);
  });

  it('нула разходи дава нули, не дели на нула', () => {
    const a = allocateCommonOpex(rows, 0);
    expect(sum(a)).toBe(0);
    expect(a.get(1)).toBe(0);
  });

  it('празен списък не хвърля', () => {
    expect(sum(allocateCommonOpex([], 1000))).toBe(0);
    expect(sum(allocateCommonOpex(null, 1000))).toBe(0);
  });

  it('ръчната тежест се уважава при разпределението', () => {
    const custom = [
      { id: 1, 'тип': '2-стаен', rent_annual: 5000 },
      { id: 2, 'тип': 'Гараж',   rent_annual: 5000, opex_share: 1 },
    ];
    const a = allocateCommonOpex(custom, 1000);
    expect(a.get(1)).toBeCloseTo(500, 2);
    expect(a.get(2)).toBeCloseTo(500, 2);
  });
});
