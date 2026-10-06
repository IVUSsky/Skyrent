// Връзката инструмент → изпълнител. Без този тест едно разминаване в името
// („diagnose_internet" срещу „diagnoseInternet") се вижда чак когато наемател
// зададе въпроса и моделът получи празен резултат.
const Database = require('better-sqlite3');
const { TOOLS, CUSTOM_TOOL_NAMES, runTool } = require('./tenantAgent');

describe('инструменти на чата', () => {
  it('всеки клиентски инструмент е описан към модела', () => {
    const described = new Set(TOOLS.filter(t => !t.type).map(t => t.name));
    for (const name of CUSTOM_TOOL_NAMES) expect(described.has(name)).toBe(true);
  });

  it('диагностиката на интернета е сред инструментите', () => {
    const t = TOOLS.find(x => x.name === 'diagnose_internet');
    expect(t).toBeTruthy();
    expect(t.description).toMatch(/няма интернет/i);
  });
});

describe('изпълнение на diagnose_internet', () => {
  let db;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE contracts (id INTEGER PRIMARY KEY, tenant_user_id INTEGER, property_id INTEGER, status TEXT, created_at TEXT);
      CREATE TABLE internet_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, property_id INTEGER, status TEXT, valid_until TEXT);
      CREATE TABLE routers (id INTEGER PRIMARY KEY AUTOINCREMENT, property_id INTEGER, mode TEXT, desired_access INTEGER,
                            enforce_cutoff INTEGER, poll_seen_at TEXT, status TEXT);
      INSERT INTO contracts (id, tenant_user_id, property_id, status, created_at) VALUES (1, 7, 58, 'active', '2026-09-01');
      INSERT INTO internet_accounts (property_id, status, valid_until) VALUES (58, 'active', '2099-01-01T00:00:00Z');
      INSERT INTO routers (property_id, mode, desired_access, enforce_cutoff, poll_seen_at, status)
        VALUES (58, 'flat', 1, 1, '2020-01-01 00:00:00', 'error');
    `);
  });

  it('извикването по име връща диагнозата (рутер, който мълчи от години → офлайн)', () => {
    const r = runTool(db, 7, 'diagnose_internet');
    expect(r.likely_cause).toBe('router_offline');
    expect(r.steps.join(' ')).toMatch(/ПЪРВИЯ порт/);
  });
});

describe("интернет достъп и контакти", () => {
  let db;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE contracts (id INTEGER PRIMARY KEY, tenant_user_id INTEGER, property_id INTEGER, status TEXT, created_at TEXT);
      CREATE TABLE internet_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, property_id INTEGER, username TEXT, password TEXT, status TEXT, valid_until TEXT);
      CREATE TABLE routers (id INTEGER PRIMARY KEY AUTOINCREMENT, property_id INTEGER, mode TEXT);
      CREATE TABLE apartment_knowledge (id INTEGER PRIMARY KEY AUTOINCREMENT, property_id INTEGER, wifi_ssid TEXT, wifi_password TEXT, contacts_json TEXT);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO contracts (id, tenant_user_id, property_id, status, created_at) VALUES (1, 7, 58, 'active', '2026-09-01');
      INSERT INTO settings (key, value) VALUES ('issuer', '{"name":"Скай Кепитъл ЕООД","email":"info@skycapital.pro","phone":"+359888123456"}');
    `);
  });

  it("връща Wi-Fi и срока, когато са записани", () => {
    db.prepare("INSERT INTO apartment_knowledge (property_id, wifi_ssid, wifi_password) VALUES (58, 'Sky rent ap.46', 'tajna123')").run();
    db.prepare("INSERT INTO internet_accounts (property_id, username, password, status, valid_until) VALUES (58, 'user-27-8b65', 'pass', 'active', '2026-10-17T08:41:15Z')").run();
    db.prepare("INSERT INTO routers (property_id, mode) VALUES (58, 'flat')").run();
    const r = runTool(db, 7, "get_internet_access");
    expect(r).toMatchObject({ has_service: true, wifi_ssid: "Sky rent ap.46", wifi_password: "tajna123", login_required: false });
    expect(r.valid_until).toMatch(/2026-10-17/);
  });

  it("без записана Wi-Fi парола казва честно какво липсва", () => {
    db.prepare("INSERT INTO internet_accounts (property_id, username, password, status, valid_until) VALUES (58, 'u', 'p', 'active', '2026-10-17T08:41:15Z')").run();
    const r = runTool(db, 7, "get_internet_access");
    expect(r.wifi_password).toBeNull();
    expect(r.note).toMatch(/Поддръжка/);
  });

  it("имот без интернет данни → няма услуга", () => {
    expect(runTool(db, 7, "get_internet_access")).toMatchObject({ has_service: false });
  });

  it("контактите идват от издателя и от имота", () => {
    db.prepare("INSERT INTO apartment_knowledge (property_id, contacts_json) VALUES (58, '[{\"role\":\"домоуправител\",\"name\":\"Иван\",\"phone\":\"0888\"}]')").run();
    const r = runTool(db, 7, "get_contacts");
    expect(r.landlord).toMatchObject({ email: "info@skycapital.pro", phone: "+359888123456" });
    expect(r.property_contacts[0]).toMatchObject({ role: "домоуправител" });
  });

  it("счупен contacts_json не чупи отговора", () => {
    db.prepare("INSERT INTO apartment_knowledge (property_id, contacts_json) VALUES (58, 'не-json')").run();
    expect(runTool(db, 7, "get_contacts").property_contacts).toEqual([]);
  });
});
