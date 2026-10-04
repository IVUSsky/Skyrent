const Database = require('better-sqlite3');
const { canTenantControl, devicesForTenant, assertTenantMayControl } = require('./tenantDeviceAccess');

const dev = (o = {}) => ({ id: 1, property_id: 26, name: 'Климатик', type: 'ac', enabled: 1, tenant_control: 1, ...o });

describe('кой какво може да управлява', () => {
  it('разрешен климатик → да', () => {
    expect(canTenantControl(dev())).toBe(true);
  });
  it('главният предпазител — НИКОГА, дори маркиран като разрешен', () => {
    expect(canTenantControl(dev({ type: 'breaker', tenant_control: 1 }))).toBe(false);
    expect(canTenantControl(dev({ type: 'main', tenant_control: 1 }))).toBe(false);
  });
  it('брава/портал — не', () => {
    expect(canTenantControl(dev({ type: 'lock', tenant_control: 1 }))).toBe(false);
  });
  it('без изрично разрешение — не', () => {
    expect(canTenantControl(dev({ tenant_control: 0 }))).toBe(false);
    expect(canTenantControl(dev({ tenant_control: null }))).toBe(false);
  });
  it('изключено устройство — не', () => {
    expect(canTenantControl(dev({ enabled: 0 }))).toBe(false);
  });
  it('непознат вид — не (бял списък, не черен)', () => {
    expect(canTenantControl(dev({ type: 'нещо' }))).toBe(false);
  });
  it('главни букви и интервали в вида не заобикалят правилото', () => {
    expect(canTenantControl(dev({ type: ' BREAKER ' }))).toBe(false);
    expect(canTenantControl(dev({ type: ' AC ' }))).toBe(true);
  });
});

describe('списък и проверка срещу база', () => {
  let db;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE smart_devices (id INTEGER PRIMARY KEY, property_id INTEGER, tuya_device_id TEXT,
             name TEXT, type TEXT, enabled INTEGER DEFAULT 1, tenant_control INTEGER DEFAULT 0);`);
    const ins = db.prepare('INSERT INTO smart_devices (id, property_id, tuya_device_id, name, type, enabled, tenant_control) VALUES (?,?,?,?,?,?,?)');
    ins.run(1, 26, 'tuya-aaa', 'Бушон 4А', 'breaker', 1, 0);
    ins.run(2, 26, 'tuya-bbb', 'Климатик спалня', 'ac', 1, 1);
    ins.run(3, 26, 'tuya-ccc', 'Бойлер', 'boiler', 1, 0);
    ins.run(4, 27, 'tuya-ddd', 'Климатик ап.5', 'ac', 1, 1);
    ins.run(5, 26, 'tuya-eee', 'Старо реле', 'socket', 0, 1);
  });

  it('вижда всички свои устройства, но управлява само разрешените', () => {
    const list = devicesForTenant(db, 26);
    expect(list.map(d => d.name)).toEqual(['Бушон 4А', 'Климатик спалня', 'Бойлер']);
    expect(list.map(d => d.controllable)).toEqual([false, true, false]);
  });
  it('tuya id-то не изтича към наемателя', () => {
    expect(JSON.stringify(devicesForTenant(db, 26))).not.toMatch(/tuya-/);
  });
  it('наемател без договор → празен списък', () => {
    expect(devicesForTenant(db, null)).toEqual([]);
  });
  it('чуждо устройство → 404, не 403 (не издава, че съществува)', () => {
    expect(assertTenantMayControl(db, 26, 4)).toMatchObject({ ok: false, status: 404 });
  });
  it('свое, но непозволено устройство → 403 с обяснение', () => {
    expect(assertTenantMayControl(db, 26, 1)).toMatchObject({ ok: false, status: 403 });
  });
  it('свое и позволено → ok + самото устройство (с tuya id за командата)', () => {
    const r = assertTenantMayControl(db, 26, 2);
    expect(r.ok).toBe(true);
    expect(r.device.tuya_device_id).toBe('tuya-bbb');
  });
  it('изключено устройство не се управлява', () => {
    expect(assertTenantMayControl(db, 26, 5)).toMatchObject({ ok: false, status: 403 });
  });
});
