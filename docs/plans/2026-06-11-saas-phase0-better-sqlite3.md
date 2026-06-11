# SaaS Phase 0 — better-sqlite3 Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use godmode:task-runner to implement this plan task-by-task.

**Goal:** Replace the in-memory sql.js engine with on-disk better-sqlite3 at functional parity, removing the export-on-write bottleneck and unblocking multi-tenancy.

**Architecture:** Rewrite `backend/db/db.js` as a thin synchronous wrapper over better-sqlite3 that preserves the exact public surface (`prepare/all/get/run/exec/pragma/transaction/initDb` + compat `_sqlDb`/`_maybeSave`). All 661 query call sites and 15 transactions are untouched. Same `.db` file (zero data migration). Dockerfile base → `node:18-slim` for native prebuilds.

**Tech Stack:** better-sqlite3, Node ≥18, Express, Railway (Docker + volume at /data).

**Design doc:** `docs/plans/2026-06-11-saas-phase0-better-sqlite3-design.md`

---

### Task 1: Rewrite `db/db.js` over better-sqlite3 + parity

**Files:**
- Modify: `backend/db/db.js` (full rewrite)
- Modify: `backend/package.json` (better-sqlite3 dep — already installed)
- Test: `backend/scripts/test_integrity.js` (must still pass)

**Step 1: Replace `backend/db/db.js` with:**

```js
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
//  - single array  → spread as positional
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
```

**Step 2: Run the integrity regression**

Run: `node backend/scripts/test_integrity.js`
Expected: `✓ all integrity checks pass` (pure functions, engine-independent).

**Step 3: Boot smoke (local) — confirm identical behavior**

Run: boot the server briefly and confirm tables init + a read works.
`cd backend && (node server.js & sleep 4; kill $!)` and look for `integrity tables ready` / `Backend running` with no DB errors.
Expected: server boots; no `_sqlDb`/`prepare` errors. (Local DB may have little data — that's fine.)

**Step 4: Verify the existing file is read by better-sqlite3**

Run:
```
node -e "const{initDb}=require('./backend/db/db');initDb().then(db=>{console.log('props',db.prepare('SELECT COUNT(*) n FROM properties').get().n);process.exit(0)})"
```
Expected: prints a property count (no error).

**Step 5: Commit**

```bash
git add backend/db/db.js backend/package.json backend/package-lock.json
git commit -m "feat(db): swap sql.js → better-sqlite3 (on-disk, WAL, parity)"
```

---

### Task 2: Dockerfile base image for native prebuilds

**Files:**
- Modify: `backend/Dockerfile`

**Step 1: Change base image alpine → slim**

Replace `FROM node:18-alpine` with `FROM node:18-slim`. Keep the rest. (Debian/glibc → better-sqlite3 prebuilt binary installs without build tools.)

If `npm ci` still tries to build, add before it:
```dockerfile
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
```
(Only if the prebuilt binary is unavailable; try without first.)

**Step 2: Verify Dockerfile syntax**

Run: `cat backend/Dockerfile` and confirm the base image line changed.
(Docker build is verified at deploy on Railway; if Docker is available locally: `docker build -t skyrent-be backend/` should succeed.)

**Step 3: Commit**

```bash
git add backend/Dockerfile
git commit -m "build: node:18-slim base for better-sqlite3 native prebuilds"
```

---

### Task 3: PR + post-merge prod verification

**Step 1: Push + open PR**

```bash
git push -u origin feature/db-better-sqlite3
```
Provide the PR URL; user merges.

**Step 2: Post-merge prod smoke (after Railway deploy)**

- `GET /api/health` → 200.
- `GET /api/properties`, `GET /api/metrics`, `GET /api/integrity` → identical shapes to before.
- A write that persists across restart: `PATCH /api/import/transactions/:id/month` then re-GET → change present. (Durability — the real win.)
- Confirm Railway Docker build succeeded (native module). If build fails on native compile, apply the `apt-get install python3 make g++` line from Task 2.

**Step 3: Watch for issues**

- If `/data/portfolio.db` WAL files cause any read issue, `PRAGMA wal_checkpoint(TRUNCATE)` via the vacuum endpoint.
- Rollback: revert the two commits; sql.js re-reads the same file.

---

## Definition of done

- Integrity test passes; server boots on better-sqlite3 locally.
- Railway deploy succeeds (native build) and all key endpoints behave identically.
- Writes persist across a container restart (no more in-memory-only risk).
- Ready for Phase 1 (`organization_id`).
