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
