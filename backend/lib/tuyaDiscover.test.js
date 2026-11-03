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

describe('двата пътя до списъка', () => {
  const { listAllDevicesAnyWay } = require('./tuyaDiscover');

  // Проектът може да държи устройствата или в самия облак, или на свързан
  // Smart Life акаунт. Празен отговор от единия не значи „няма устройства".
  it('празен облачен списък → пробва свързания акаунт', async () => {
    const seen = [];
    const req = async (m, p) => {
      seen.push(p);
      if (p.includes('/v2.0/cloud/thing/device')) return { success: true, result: { list: [] } };
      return { success: true, result: { devices: [{ id: 'bf-a', name: 'Клапан', category: 'tdq' }], has_more: false } };
    };
    expect((await listAllDevicesAnyWay({}, req)).map(d => d.id)).toEqual(['bf-a']);
    expect(seen.some(p => p.includes('associated-users'))).toBe(true);
  });

  it('грешка от първия също води до втория', async () => {
    const req = async (m, p) => p.includes('cloud/thing')
      ? { success: false, msg: 'no permission' }
      : { success: true, result: { devices: [{ id: 'bf-b' }], has_more: false } };
    expect((await listAllDevicesAnyWay({}, req)).map(d => d.id)).toEqual(['bf-b']);
  });

  it('работи ли първият — вторият не се вика', async () => {
    const seen = [];
    const req = async (m, p) => { seen.push(p); return { success: true, result: { list: [{ id: 'bf-c' }] } }; };
    await listAllDevicesAnyWay({}, req);
    expect(seen.some(p => p.includes('associated-users'))).toBe(false);
  });

  it('и двата мълчат → грешката на първия, а не празен списък', async () => {
    const req = async () => ({ success: false, msg: 'sign invalid' });
    await expect(listAllDevicesAnyWay({}, req)).rejects.toThrow(/sign invalid/);
  });
});
