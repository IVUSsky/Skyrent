# SaaS Phase 0 — sql.js → better-sqlite3 (Design)

**Date:** 2026-06-11
**Status:** Approved (intent-discovery), pending implementation
**Part of:** SaaS roadmap (B2B multi-tenant for small landlords + PM firms)

## Goal

Swap the in-memory `sql.js` engine for **better-sqlite3** (real on-disk SQLite, synchronous) with **functional parity**. This unblocks multi-tenancy (Phase 1: `organization_id`) and removes the current performance/durability problems — with near-zero refactor.

## Why better-sqlite3 (revised from "go straight to Postgres")

Code inventory: **661 `db.prepare()` calls** across 25 route files, **66 SQLite date-functions** (`julianday`/`datetime`), 14 `INSERT OR IGNORE`, 41 `AUTOINCREMENT`, 15 `db.transaction` blocks. A Postgres rewrite means async-converting all 661 calls + translating 66 date funcs + dialect + schema = large/risky.

**better-sqlite3 is near-drop-in:** the existing `db/db.js` wrapper was built to *mimic* better-sqlite3's API (`prepare/all/get/run/exec/pragma/transaction`, sync). Swapping the backing engine leaves all 661 queries and 15 transactions **unchanged**.

**Validated (2026-06-11):** `better-sqlite3` opens the existing sql.js-written `portfolio.db` directly — reads `properties`/`transactions`, Cyrillic columns (`адрес`, `наем`), and `@id` named params all work. sql.js exports standard SQLite format → **zero data migration**.

Target market is SMB landlords + PM firms (not hyperscale); one server with better-sqlite3 + `organization_id` scoping serves thousands of orgs. Later, if horizontal scale is needed, migrate to Turso/libSQL (SQLite-compatible, no dialect change) or Postgres.

## Changes (2 files + deploy)

### 1. `backend/db/db.js` — rewrite as thin better-sqlite3 wrapper
- Use `better-sqlite3` directly; keep the exact public surface so call sites are untouched.
- **Remove `_maybeSave`** (full in-memory export + file write on every write). better-sqlite3 persists each statement to disk natively. Enable **WAL** (`db.pragma('journal_mode = WAL')`) for concurrency + durability. This alone fixes the in-memory export bottleneck and the atomic-write EPERM issues.
- `normalizeParams`: pass the bare object for named params (better-sqlite3 expects `{id}` for `@id`, not `{'@id'}`); single array → spread as positional; multiple primitives → positional.
- `initDb()` keeps the same signature (returns the db) so `server.js` is untouched. It can stay `async` (returning a resolved value) to avoid changing `await initDb()` call.
- `prepare/get/all/run/exec/pragma/transaction` map 1:1 to better-sqlite3 (it provides them natively, sync, with `{changes, lastInsertRowid}` from `run`).

### 2. `backend/Dockerfile` — base image for native module
- better-sqlite3 is a native addon. `node:18-alpine` (musl) often needs build tools; switch to **`node:18-slim`** (Debian/glibc) so prebuilt binaries install cleanly. (Alternative: keep alpine + `apk add python3 make g++`, but slim is simpler.)
- Volume `/data` unchanged; WAL sidecar files (`.db-wal`, `.db-shm`) live beside `portfolio.db`.

## No data migration

Railway volume `/data/portfolio.db` is opened directly by better-sqlite3. Bidirectionally compatible with sql.js (both standard SQLite), so rollback is safe.

## Parity testing

- `node backend/scripts/test_integrity.js` (pure-function test) — unaffected, must still pass.
- Local smoke: boot server with better-sqlite3, hit key read endpoints (`/api/properties`, `/api/metrics`, `/api/import/transactions`, `/api/integrity`) and a write (`PATCH .../month`), confirm identical shapes.
- Post-deploy prod smoke: same endpoints + verify a write persists across a restart (durability).

## Rollback

Revert `db/db.js` to the sql.js wrapper + Dockerfile. The `.db` file remains standard SQLite, readable by sql.js. (Note: if WAL was used, run a `PRAGMA wal_checkpoint` / the file is auto-checkpointed on close.)

## Risks

- **Native build on Railway:** mitigated by `node:18-slim` + prebuilt binaries; verify the Docker build succeeds.
- **WAL on a network volume:** Railway volumes are local disk → WAL fine.
- **Concurrent writes:** better-sqlite3 is synchronous (serializes writes in-process) — correct by construction for single-process.

## Out of scope (next phases)

- Phase 1: `organizations` + `org_members` tables, `organization_id` on every table, query scoping, JWT org claim.
- Phase 2: org signup/onboarding. Phase 3: Stripe billing. Phase 4: white-label-lite.
