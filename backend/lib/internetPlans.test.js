// Плановете за интернет по имот: празно = всички с рутер, иначе само изброените.
// Поводът: Конджа (ап.46) видя и купи плана на ап.9 за 15 € вместо своя за 25,98 €.
const { planAllowedForProperty, parsePlanPropertyIds } = require('./internetService');

describe('planAllowedForProperty', () => {
  it('план без имоти важи за всеки имот', () => {
    expect(planAllowedForProperty({ property_ids: null }, 58)).toBe(true);
    expect(planAllowedForProperty({ property_ids: '' }, 58)).toBe(true);
  });
  it('план за ап.9 не се вижда от ап.46', () => {
    expect(planAllowedForProperty({ property_ids: '2' }, 58)).toBe(false);
    expect(planAllowedForProperty({ property_ids: '2' }, 2)).toBe(true);
  });
  it('план за няколко имота (CSV)', () => {
    expect(planAllowedForProperty({ property_ids: '41,58' }, 58)).toBe(true);
    expect(planAllowedForProperty({ property_ids: '41, 58' }, 41)).toBe(true);
    expect(planAllowedForProperty({ property_ids: '41,58' }, 2)).toBe(false);
  });
  it('низ срещу число не бърка', () => {
    expect(planAllowedForProperty({ property_ids: '58' }, '58')).toBe(true);
  });
});

describe('parsePlanPropertyIds', () => {
  it('приема масив и CSV, чисти боклук', () => {
    expect(parsePlanPropertyIds([58, '41', 0, 'x'])).toEqual([58, 41]);
    expect(parsePlanPropertyIds('58, 41,,abc')).toEqual([58, 41]);
    expect(parsePlanPropertyIds(null)).toEqual([]);
  });
});
