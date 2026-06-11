/**
 * better-sqlite3 wrapper preserving the previous sql.js-mimicking API.
 * Synchronous, on-disk, WAL. Drop-in for all existing call sites.
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'portfolio.db');
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// Normalize call-site args to what better-sqlite3 expects:
//  - single array   → spread as positional
//  - single object  → named params (passed through)
//  - multiple values → positional
function normalizeArgs(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

class DB {
  constructor(bdb) {
    this._db = bdb;
    // compat shim for code that used the old sql.js handle (backup + vacuum endpoints)
    this._sqlDb = {
      export: () => { try { bdb.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) {} return fs.readFileSync(DB_PATH); },
      exec: (sql) => bdb.exec(sql),
    };
  }
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

async function initDb() {
  const bdb = new Database(DB_PATH);
  bdb.pragma('journal_mode = WAL');
  return new DB(bdb);
}

module.exports = { initDb };
