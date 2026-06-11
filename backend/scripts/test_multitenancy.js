// Unit тест на multi-tenant db слоя (Phase 1). Самостоятелен, временна директория.
// Пускане: node scripts/test_multitenancy.js   (сам си задава DB_PATH)
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skyrent-mt-'));
process.env.DB_PATH = path.join(tmp, 'portfolio.db');

const { initControlDb, getOrgDb, setTenantMigrator, dbProxy, runWithOrg, bootstrap } = require('../db/db');

// минимални control миграции (реалните идват в Task 2)
const cdb = initControlDb();
cdb.exec(`CREATE TABLE IF NOT EXISTS organizations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
cdb.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, role TEXT, organization_id INTEGER DEFAULT 1, is_superadmin INTEGER DEFAULT 0)`);

// tenant миграции: тестова таблица
let migratedOrgs = [];
setTenantMigrator(db => { migratedOrgs.push(db.orgId); db.exec('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, val TEXT)'); });

// bootstrap без portfolio.db → само org 1 ред
bootstrap();
assert(cdb.prepare('SELECT id FROM organizations WHERE id=1').get(), 'org 1 missing after bootstrap');

// org бази + миграции
const db1 = getOrgDb(1);
const db2 = getOrgDb(2);
assert.deepStrictEqual(migratedOrgs, [1, 2], 'tenant migrator не се изпълни за двете org бази');

// изолация
db1.prepare('INSERT INTO items (val) VALUES (?)').run('org1-secret');
assert.strictEqual(db1.prepare('SELECT COUNT(*) n FROM items').get().n, 1);
assert.strictEqual(db2.prepare('SELECT COUNT(*) n FROM items').get().n, 0, 'ИЗТИЧАНЕ: org2 вижда org1 данни!');

// два отделни файла
assert(fs.existsSync(path.join(tmp, 'orgs', '1.db')) && fs.existsSync(path.join(tmp, 'orgs', '2.db')), 'org файловете липсват');

// proxy: без контекст → throw
assert.throws(() => dbProxy.prepare('SELECT 1'), /No org context/, 'proxy не хвърля без ALS контекст');

// proxy: в runWithOrg → resolve-ва правилната база
runWithOrg(2, () => {
  assert.strictEqual(dbProxy.orgId, 2);
  dbProxy.prepare('INSERT INTO items (val) VALUES (?)').run('org2-item');
  assert.strictEqual(dbProxy.prepare('SELECT COUNT(*) n FROM items').get().n, 1);
});
runWithOrg(1, () => {
  assert.strictEqual(dbProxy.prepare('SELECT COUNT(*) n FROM items').get().n, 1, 'org1 трябва да има само своя 1 запис');
  assert.strictEqual(dbProxy.prepare('SELECT val FROM items').get().val, 'org1-secret');
});

// proxy: .control достъпен отвсякъде
assert(dbProxy.control === cdb, 'dbProxy.control != controlDb');

// кеш: повторно getOrgDb връща същия инстанс
assert(getOrgDb(1) === db1, 'org cache не работи');

// users VIEW: org връзката вижда САМО своите users (auto-filter по organization_id)
cdb.prepare("INSERT INTO users (username, role, organization_id) VALUES ('ivo','admin',1)").run();
cdb.prepare("INSERT INTO users (username, role, organization_id) VALUES ('client','admin',2)").run();
assert.strictEqual(db1.prepare('SELECT COUNT(*) n FROM users').get().n, 1, 'org1 view трябва да вижда 1 user');
assert.strictEqual(db1.prepare('SELECT username FROM users').get().username, 'ivo');
assert.strictEqual(db2.prepare('SELECT username FROM users').get().username, 'client', 'org2 view грешен');
// JOIN срещу view работи (както в route-овете)
db1.exec('CREATE TABLE IF NOT EXISTS tix (id INTEGER PRIMARY KEY, user_id INTEGER)');
db1.prepare('INSERT INTO tix (user_id) VALUES (?)').run(cdb.prepare("SELECT id FROM users WHERE username='ivo'").get().id);
const joined = db1.prepare('SELECT t.id, u.username FROM tix t LEFT JOIN users u ON u.id = t.user_id').get();
assert.strictEqual(joined.username, 'ivo', 'JOIN през users view не работи');

console.log('✓ multi-tenancy db слой: изолация, proxy, ALS, bootstrap, кеш — всичко OK');
