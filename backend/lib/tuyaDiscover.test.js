const { suggestType, describeDevices } = require('./tuyaDiscover');

describe('познаване на вида', () => {
  it('по категорията на Tuya', () => {
    expect(suggestType('kt')).toBe('ac');
    expect(suggestType('wnykq')).toBe('ir_ac');
    expect(suggestType('cz')).toBe('socket');
    expect(suggestType('dlq')).toBe('breaker');
    expect(suggestType('ms')).toBe('lock');
    expect(suggestType('clkg')).toBe('curtain');
    expect(suggestType('sfkzq')).toBe('water_valve');
  });

  it('регистърът на категорията няма значение', () => {
    expect(suggestType('KT')).toBe('ac');
    expect(suggestType(' cz ')).toBe('socket');
  });

  it('по името, когато категорията не помага', () => {
    expect(suggestType('zzz', 'Климатик спалня')).toBe('ac');
    expect(suggestType(null, 'Бойлер баня')).toBe('boiler');
    expect(suggestType('', 'Щори хол')).toBe('curtain');
    expect(suggestType(null, 'Кран за водата')).toBe('water_valve');
    expect(suggestType(null, 'Bushon 4A')).toBe(null);          // латиница без съвпадение
    expect(suggestType(null, 'Бушон ап.4А')).toBe('breaker');
  });

  it('категорията има превес пред името', () => {
    expect(suggestType('cz', 'Климатик')).toBe('socket');
  });

  it('непознатото НЕ се гадае', () => {
    expect(suggestType('qqq', 'Нещо си')).toBe(null);
    expect(suggestType(null, null)).toBe(null);
    expect(suggestType()).toBe(null);
  });
});

describe('подреждане на намереното', () => {
  const raw = [
    { id: 'aaa111', customName: 'Климатик хол', category: 'kt', isOnline: true, productName: 'Smart AC' },
    { id: 'bbb222', name: 'Бушон ап. 4а', category: 'dlq', isOnline: false },
    { id: 'ccc333', customName: '', category: 'zzz', isOnline: true },
  ];

  it('изважда номер, име, състояние и предложен вид', () => {
    const d = describeDevices(raw)[0];
    expect(d.tuya_device_id).toBe('aaa111');
    expect(d.name).toBe('Климатик хол');
    expect(d.online).toBe(true);
    expect(d.suggested_type).toBe('ac');
  });

  it('безименното устройство се показва с номера си', () => {
    expect(describeDevices(raw)[2].name).toBe('ccc333');
  });

  it('вече вписаните се отбелязват, за да не се дублират', () => {
    const list = describeDevices(raw, ['bbb222']);
    expect(list.map(d => d.already_added)).toEqual([false, true, false]);
  });

  it('празният вход не чупи', () => {
    expect(describeDevices(null)).toEqual([]);
    expect(describeDevices([])).toEqual([]);
  });

  it('запис без номер се изхвърля', () => {
    expect(describeDevices([{ name: 'без номер' }])).toEqual([]);
  });

  it('приема и другите имена на полетата, които Tuya връща', () => {
    const d = describeDevices([{ device_id: 'ddd444', custom_name: 'Кран', online: false }])[0];
    expect(d.tuya_device_id).toBe('ddd444');
    expect(d.name).toBe('Кран');
    expect(d.online).toBe(false);
    expect(d.suggested_type).toBe('water_valve');
  });
});
