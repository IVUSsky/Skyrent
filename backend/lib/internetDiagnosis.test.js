const Database = require('better-sqlite3');
const { diagnoseInternet, minutesSince } = require('./internetDiagnosis');

const NOW = new Date('2026-10-06T10:00:00Z');
const ago = (min) => new Date(NOW.getTime() - min * 60000).toISOString().slice(0, 19).replace('T', ' ');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE contracts (id INTEGER PRIMARY KEY, tenant_user_id INTEGER, property_id INTEGER, status TEXT, created_at TEXT);
    CREATE TABLE internet_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, property_id INTEGER, status TEXT, valid_until TEXT);
    CREATE TABLE routers (id INTEGER PRIMARY KEY AUTOINCREMENT, property_id INTEGER, mode TEXT, desired_access INTEGER,
                          enforce_cutoff INTEGER, poll_seen_at TEXT, status TEXT);
    INSERT INTO contracts (id, tenant_user_id, property_id, status, created_at) VALUES (1, 7, 58, 'active', '2026-09-01');
  `);
});
const acc = (o = {}) => db.prepare('INSERT INTO internet_accounts (property_id, status, valid_until) VALUES (?,?,?)')
  .run(o.property_id ?? 58, o.status ?? 'active', o.valid_until ?? '2026-10-17T08:41:15.645Z');
const rtr = (o = {}) => db.prepare('INSERT INTO routers (property_id, mode, desired_access, enforce_cutoff, poll_seen_at, status) VALUES (?,?,?,?,?,?)')
  .run(o.property_id ?? 58, 'flat', o.desired_access ?? 1, o.enforce_cutoff ?? 1, ('poll_seen_at' in o ? o.poll_seen_at : ago(1)), o.status ?? 'online');

describe('възраст на последното обаждане', () => {
  it('чете и двата формата на дата', () => {
    expect(minutesSince(new Date(Date.now() - 5 * 60000).toISOString())).toBe(5);
    expect(minutesSince(null)).toBeNull();
    expect(minutesSince('глупости')).toBeNull();
  });
});

describe('диагностика', () => {
  it('без активен договор', () => {
    db.prepare("UPDATE contracts SET status='terminated'").run();
    expect(diagnoseInternet(db, 7, NOW)).toMatchObject({ has_service: false, likely_cause: 'no_contract' });
  });

  it('имот без интернет услуга', () => {
    expect(diagnoseInternet(db, 7, NOW)).toMatchObject({ has_service: false, likely_cause: 'no_service' });
  });

  it('изтекъл пакет → казва да купи нов, не праща да проверява кабели', () => {
    acc({ status: 'expired', valid_until: '2026-10-01T00:00:00Z' }); rtr();
    const d = diagnoseInternet(db, 7, NOW);
    expect(d.likely_cause).toBe('expired_package');
    expect(d.account.paid).toBe(false);
    expect(d.steps.join(' ')).toMatch(/Интернет/);
  });

  it('казусът Конджа: платено, рутерът мълчи от часове → кабелът в първия порт', () => {
    acc(); rtr({ poll_seen_at: ago(19 * 60) });
    const d = diagnoseInternet(db, 7, NOW);
    expect(d.likely_cause).toBe('router_offline');
    expect(d.router.online).toBe(false);
    expect(d.router.silent_for_minutes).toBe(19 * 60);
    expect(d.steps.join(' ')).toMatch(/ПЪРВИЯ порт \(ether1\)/);
    expect(d.steps.join(' ')).toMatch(/19 часа/);
  });

  it('рутер, който се е обадил преди 3 минути, минава за онлайн', () => {
    acc(); rtr({ poll_seen_at: ago(3) });
    expect(diagnoseInternet(db, 7, NOW).router.online).toBe(true);
  });

  it('рутерът е онлайн, пакетът е платен → проблемът е в устройството', () => {
    acc(); rtr();
    const d = diagnoseInternet(db, 7, NOW);
    expect(d.likely_cause).toBe('device_side');
    expect(d.account.days_left).toBe(11);
    expect(d.steps.join(' ')).toMatch(/Wi-Fi/);
  });

  it('платено, рутерът е онлайн, но системата държи спряно → изчакай 5 мин', () => {
    acc(); rtr({ desired_access: 0 });
    expect(diagnoseInternet(db, 7, NOW).likely_cause).toBe('blocked_by_system');
  });

  it('рутер, който никога не се е обаждал, се води офлайн', () => {
    acc(); rtr({ poll_seen_at: null });
    const d = diagnoseInternet(db, 7, NOW);
    expect(d.likely_cause).toBe('router_offline');
    expect(d.router.silent_for_minutes).toBeNull();
  });

  it('гледа само своя имот', () => {
    acc({ property_id: 99, status: 'expired', valid_until: '2026-01-01T00:00:00Z' });
    rtr({ property_id: 99, poll_seen_at: ago(999) });
    expect(diagnoseInternet(db, 7, NOW)).toMatchObject({ has_service: false, likely_cause: 'no_service' });
  });
});
