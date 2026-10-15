const { clampTemp, normalizeMode, buildAcBody, parseAcStatus, TEMP_MIN, TEMP_MAX } = require('./tuyaIr');

describe('температура', () => {
  it('остава в границите на климатика', () => {
    expect(clampTemp(24)).toBe(24);
    expect(clampTemp(10)).toBe(TEMP_MIN);
    expect(clampTemp(35)).toBe(TEMP_MAX);
  });

  it('приема низ от формата', () => {
    expect(clampTemp('23')).toBe(23);
    expect(clampTemp('23.4')).toBe(23);
  });

  it('безсмислената стойност не се праща', () => {
    expect(clampTemp('топло')).toBe(null);
    expect(clampTemp(null)).toBe(null);
    expect(clampTemp('')).toBe(null);
  });
});

describe('режим', () => {
  it('приема номер', () => {
    expect(normalizeMode(0)).toBe(0);
    expect(normalizeMode(4)).toBe(4);
  });

  it('приема английска дума', () => {
    expect(normalizeMode('cool')).toBe(0);
    expect(normalizeMode('HEAT')).toBe(1);
    expect(normalizeMode('dry')).toBe(4);
  });

  it('приема и българската', () => {
    expect(normalizeMode('охлаждане')).toBe(0);
    expect(normalizeMode('отопление')).toBe(1);
  });

  it('непознатото → null, за да не се праща наужким', () => {
    expect(normalizeMode('турбо')).toBe(null);
    expect(normalizeMode(9)).toBe(null);
    expect(normalizeMode(null)).toBe(null);
  });
});

describe('тялото на командата', () => {
  it('праща САМО зададеното — не бута стойности, които никой не е искал', () => {
    expect(buildAcBody({ power: true })).toEqual({ power: 1 });
    expect(buildAcBody({ temp: 22 })).toEqual({ temp: 22 });
  });

  it('включване с температура и режим', () => {
    expect(buildAcBody({ power: true, temp: 24, mode: 'cool' })).toEqual({ power: 1, mode: 0, temp: 24 });
  });

  it('изключването е 0, не липсващо поле', () => {
    expect(buildAcBody({ power: false })).toEqual({ power: 0 });
  });

  it('извън границите се подрязва, не се отказва', () => {
    expect(buildAcBody({ temp: 40 })).toEqual({ temp: TEMP_MAX });
  });

  it('вентилаторът се приема само в своя обхват', () => {
    expect(buildAcBody({ wind: 2 })).toEqual({ wind: 2 });
    expect(buildAcBody({ wind: 7 })).toEqual({});
  });

  it('празното подаване не дава тяло', () => {
    expect(buildAcBody({})).toEqual({});
    expect(buildAcBody()).toEqual({});
  });
});

describe('състояние от Tuya', () => {
  it('низовете се превеждат в нормални типове', () => {
    expect(parseAcStatus({ power: '1', mode: '0', temp: '24', wind: '2' }))
      .toEqual({ on: true, mode: 0, mode_bg: 'охлаждане', temp: 24, wind: 2 });
  });

  it('изключен климатик', () => {
    expect(parseAcStatus({ power: '0', mode: '1', temp: '22', wind: '0' }).on).toBe(false);
  });

  it('липсващите полета не се измислят', () => {
    expect(parseAcStatus({})).toEqual({ on: null, mode: null, mode_bg: null, temp: null, wind: null });
    expect(parseAcStatus(null).on).toBe(null);
  });

  it('непознат режим не дава име', () => {
    expect(parseAcStatus({ mode: '9' }).mode_bg).toBe(null);
  });
});
