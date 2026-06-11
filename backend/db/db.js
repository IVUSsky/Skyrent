/**
 * Multi-tenant DB слой (SaaS Phase 1).
 *
 * Архитектура: database-per-organization.
 *   <DATA_DIR>/control.db   — organizations, users, login_audit (платформа)
 *   <DATA_DIR>/orgs/<id>.db — всички tenant таблици (имоти, транзакции, ...)
 *   <DATA_DIR>/portfolio.db — pre-migration backup (НЕ се трие; копира се → orgs/1.db)
 *
 * Route-овете получават dbProxy: prepare/exec/... се resolve-ват per-request
 * през AsyncLocalStorage (попълван от authMiddleware) → физическа изолация,
 * нула промени по съществуващите заявки. Cron jobs получават bound org handle
 * (getOrgDb(1)) или ползват runWithOrg().
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'portfolio.db');
const DATA_DIR = path.dirname(DB_PATH);
const CONTROL_PATH = path.join(DATA_DIR, 'control.db');
const ORGS_DIR = path.join(DATA_DIR, 'orgs');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ORGS_DIR)) fs.mkdirSync(ORGS_DIR, { recursive: true });

const als = new AsyncLocalStorage();

// Normalize call-site args to what better-sqlite3 expects:
//  - single array   → spread as positional
//  - single object  → named params (passed through)
//  - multiple values → positional
function normalizeArgs(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

let controlDb = null;          // DB instance (control)
let tenantMigrator = null;     // fn(db) — пуска tenant миграциите (инжектира се от server.js)
const orgCache = new Map();    // orgId → DB instance

class DB {
  constructor(bdb, filePath, orgId = null) {
    this._db = bdb;
    this._path = filePath;
    this.orgId = orgId;
    // compat shim за код ползващ стария sql.js handle (backup + vacuum)
    this._sqlDb = {
      export: () => { try { bdb.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) {} return fs.readFileSync(filePath); },
      exec: (sql) => bdb.exec(sql),
    };
  }
  get control() { return controlDb; }
  prepare(sql) {
    const stmt = this._db.prepare(sql);
    return {
      all: (...a) => stmt.all(...normalizeArgs(a)),
      get: (...a) => stmt.get(...normalizeArgs(a)),
      run: (...a) => stmt.run(...normalizeArgs(a)),
    };
  }
  exec(sql) { this._db.exec(sql); }
  pragma(str) { try { this._db.pragma(str); } catch (_) {} }
  transaction(fn) { return this._db.transaction(fn); }
  _maybeSave() { /* no-op: better-sqlite3 persists natively */ }
}

function openDb(filePath, orgId = null) {
  const bdb = new Database(filePath);
  bdb.pragma('journal_mode = WAL');
  return new DB(bdb, filePath, orgId);
}

function initControlDb() {
  if (!controlDb) controlDb = openDb(CONTROL_PATH);
  return controlDb;
}

function setTenantMigrator(fn) { tenantMigrator = fn; }

function getOrgDb(orgId) {
  const id = Number(orgId);
  if (!id || id < 1) throw new Error('getOrgDb: невалиден orgId: ' + orgId);
  if (orgCache.has(id)) return orgCache.get(id);
  const file = path.join(ORGS_DIR, id + '.db');
  const db = openDb(file, id);
  if (tenantMigrator) tenantMigrator(db);
  orgCache.set(id, db);
  return db;
}

function runWithOrg(orgId, fn) {
  const orgDb = getOrgDb(orgId);
  return als.run({ orgDb, orgId: Number(orgId) }, fn);
}

// per-request resolver: authMiddleware прави als.run({orgDb, orgId}, next)
function currentOrgDb() {
  const store = als.getStore();
  if (!store || !store.orgDb) {
    throw new Error('No org context — заявката не е минала през authMiddleware/runWithOrg');
  }
  return store.orgDb;
}

// dbProxy — подава се на route-овете вместо конкретна база.
const dbProxy = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'control') return controlDb;
    if (prop === 'orgId') { const s = als.getStore(); return s ? s.orgId : undefined; }
    const db = currentOrgDb();
    const v = db[prop];
    return typeof v === 'function' ? v.bind(db) : v;
  },
});

/**
 * Bootstrap (idempotent, при startup, СЛЕД control миграциите):
 * 1. portfolio.db → orgs/1.db (checkpoint + copy, ако orgs/1.db липсва)
 * 2. org 1 "Sky Capital" в control.organizations
 * 3. users от orgs/1.db → control.users (organization_id=1; първият admin → superadmin)
 */
function bootstrap() {
  const org1File = path.join(ORGS_DIR, '1.db');
  if (!fs.existsSync(org1File) && fs.existsSync(DB_PATH)) {
    // checkpoint-ни WAL-а на стария файл преди copy (иначе губим незаписани页ове)
    const tmp = new Database(DB_PATH);
    try { tmp.pragma('wal_checkpoint(TRUNCATE)'); } finally { tmp.close(); }
    fs.copyFileSync(DB_PATH, org1File);
    console.log('[bootstrap] portfolio.db → orgs/1.db (' + Math.round(fs.statSync(org1File).size / 1024) + ' KB)');
  }

  const cdb = initControlDb();
  if (!cdb.prepare('SELECT id FROM organizations WHERE id=1').get()) {
    cdb.prepare("INSERT INTO organizations (id, name, status) VALUES (1, 'Sky Capital', 'active')").run();
    console.log('[bootstrap] organization 1 "Sky Capital" created');
  }

  const userCount = cdb.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount === 0 && fs.existsSync(org1File)) {
    const src = new Database(org1File, { readonly: true });
    let rows = [];
    try { rows = src.prepare('SELECT * FROM users').all(); } catch (_) {} finally { src.close(); }
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      const ins = cdb.prepare(
        'INSERT INTO users (' + cols.join(',') + ', organization_id, is_superadmin) VALUES (' +
        cols.map(() => '?').join(',') + ', 1, ?)'
      );
      let firstAdminSeen = false;
      for (const r of rows) {
        const isSuper = (!firstAdminSeen && r.role === 'admin') ? 1 : 0;
        if (isSuper) firstAdminSeen = true;
        ins.run(...cols.map(c => r[c]), isSuper);
      }
      console.log('[bootstrap] ' + rows.length + ' users копирани → control.db (superadmin: първият admin)');
    }
  }
}

// legacy: единична база (вече не се ползва от server.js, пазим за скриптове)
async function initDb() {
  return openDb(DB_PATH);
}

module.exports = {
  initDb, initControlDb, getOrgDb, setTenantMigrator, bootstrap,
  dbProxy, runWithOrg, als,
  DATA_DIR, ORGS_DIR, CONTROL_PATH, DB_PATH,
};
