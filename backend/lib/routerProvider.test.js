// Flat режим + poll: routers.desired_access е това, което рутерът дърпа на всеки
// 2 мин. Кронът при изтичане и webhook-ът при плащане викат disableUser/ensureUser
// с директен push към рутера — ако не запишат и desired_access, следващият poll
// връща старото състояние (спрян при изтичане → 2 мин по-късно пак пуснат).
// Проверява се през MockProvider (същият код път за flat, без реален рутер).
const Database = require('better-sqlite3');

let db, provider;

beforeEach(() => {
  delete process.env.ROUTER_PROVIDER;

  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE routers (id INTEGER PRIMARY KEY, property_id INTEGER, host TEXT, mode TEXT, desired_access INTEGER DEFAULT 1, lan_interface TEXT);
    INSERT INTO routers (id, property_id, host, mode, desired_access) VALUES (4, 58, 'x.sn.mynetname.net', 'flat', 1);
    INSERT INTO routers (id, property_id, host, mode, desired_access) VALUES (5, 59, '10.0.0.1', 'hotspot', 1);
  `);
  provider = require('./routerProvider').getRouterProvider();
});
afterEach(() => db.close());


const desired = (id) => db.prepare('SELECT desired_access FROM routers WHERE id=?').get(id).desired_access;
const acc = (property_id) => ({ username: 'user-1-abcd', password: 'pw', mac_address: null, property_id });

describe('flat режим държи desired_access в крак с push-а', () => {
  it('изтичане (disableUser) записва 0 → poll-ът няма да пусне пак нета', async () => {
    await provider.disableUser(db, acc(58));
    expect(desired(4)).toBe(0);
  });

  it('плащане (ensureUser) записва 1 → poll-ът пуска, дори ⏸ да е било натиснато преди', async () => {
    db.prepare('UPDATE routers SET desired_access=0 WHERE id=4').run();
    await provider.ensureUser(db, acc(58));
    expect(desired(4)).toBe(1);
  });

  it('ръчно ▶/⏸ (setPropertyAccess) също записва', async () => {
    await provider.setPropertyAccess(db, 4, false);
    expect(desired(4)).toBe(0);
    await provider.setPropertyAccess(db, 4, true);
    expect(desired(4)).toBe(1);
  });

  it('hotspot рутер не се пипа — там достъпът е per-user, не poll', async () => {
    await provider.disableUser(db, acc(59));
    expect(desired(5)).toBe(1);
  });

  it('имот без рутер не гърми', async () => {
    await expect(provider.disableUser(db, acc(999))).resolves.toBeTruthy();
  });
});
