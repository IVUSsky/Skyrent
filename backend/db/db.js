/**
 * sql.js wrapper mimicking the better-sqlite3 synchronous API.
 * Supports: positional ? params, named @param params, and db.transaction().
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'portfolio.db');

function normalizeParams(args) {
  if (!args || args.length === 0) return null;

  // Single object → named params — add @ prefix to each key
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const obj = args[0];
    const named = {};
    for (const [k, v] of Object.entries(obj)) {
      named[/^[@:$]/.test(k) ? k : '@' + k] = v;
    }
    return named;
  }

  // Single array → positional
  if (args.length === 1 && Array.isArray(args[0])) {
    return args[0].length ? args[0] : null;
  }

  // Multiple primitives → positional array
  return Array.from(args);
}

class Statement {
  constructor(sql, sqlDb, dbInst) {
    this._sql = sql;
    this._sqlDb = sqlDb;
    this._db = dbInst;
  }

  _readRows(params) {
    const stmt = this._sqlDb.prepare(this._sql);
    try {
      if (params !== null) stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  all(...args) {
    return this._readRows(normalizeParams(args));
  }

  get(...args) {
    return this._readRows(normalizeParams(args))[0];
  }

  run(...args) {
    const params = normalizeParams(args);
    const stmt = this._sqlDb.prepare(this._sql);
    try {
      // sql.js stmt.run() accepts array or object or nothing
      if (params === null) stmt.run([]);
      else stmt.run(params);
    } finally {
      stmt.free();
    }
    const changes = this._sqlDb.getRowsModified();
    let lastInsertRowid = null;
    try {
      const r = this._sqlDb.exec('SELECT last_insert_rowid()');
      lastInsertRowid = r[0]?.values[0][0] ?? null;
    } catch (_) {}
    this._db._maybeSave();
    return { changes, lastInsertRowid };
  }
}

class DB {
  constructor(sqlDb) {
    this._sqlDb = sqlDb;
    this._inTx = false;
  }

  _maybeSave() {
    if (this._inTx) return;
    const data = this._sqlDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }

  prepare(sql) {
    return new Statement(sql, this._sqlDb, this);
  }

  exec(sql) {
    this._sqlDb.exec(sql);
    this._maybeSave();
  }

  pragma(str) {
    try { this._sqlDb.exec(`PRAGMA ${str};`); } catch (_) {}
  }

  transaction(fn) {
    const self = this;
    return function (...args) {
      self._inTx = true;
      self._sqlDb.exec('BEGIN');
      try {
        fn(...args);
        self._sqlDb.exec('COMMIT');
      } catch (e) {
        try { self._sqlDb.exec('ROLLBACK'); } catch (_) {}
        throw e;
      } finally {
        self._inTx = false;
      }
      self._maybeSave();
    };
  }
}

async function initDb() {
  const SQL = await initSqlJs();
  const buf = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  const sqlDb = buf ? new SQL.Database(buf) : new SQL.Database();
  return new DB(sqlDb);
}

module.exports = { initDb };
