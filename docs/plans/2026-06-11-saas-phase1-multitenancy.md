# SaaS Phase 1 — Multi-tenancy (db-per-org) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use godmode:task-runner to implement this plan task-by-task.

**Goal:** Изолирани организации чрез database-per-org + ALS proxy; org 1 = Sky Capital (текущите данни); superadmin провизиране на нови org-и; нула промени по 661-те tenant заявки.

**Architecture:** `control.db` (organizations/users/login_audit) + `orgs/<id>.db` (всички tenant таблици). `db` е Proxy → AsyncLocalStorage store {orgDb, orgId}, попълван от authMiddleware. Crons получават bound org-1 handle. Модулите, пипащи users (9 файла), минават на `db.control`.

**Tech Stack:** better-sqlite3, AsyncLocalStorage (node:async_hooks), Express, JWT.

**Design doc:** `docs/plans/2026-06-11-saas-phase1-multitenancy-design.md`

---

## Гранични условия (открити при проучването)

- Route-овете получават `db` при mount (closure) → подаваме им proxy-то; всичките `db.prepare()` се resolve-ват при изпълнение.
- `users` таблица се ползва в: routes/auth.js (15), payments.js (11), users.js (8), tenant.js (7), contracts.js (1), server.js (2), lib/autopayCron.js, lib/investmentsCron.js, lib/tenantOnboarding.js → тези минават на `db.control.prepare(...)` за users заявки.
- Crons в server.js: expiry check, investments cron, daily backup, chat-learner, SEPA autopay, internet reconcile → получават `getOrgDb(1)` (bound handle, не proxy).
- `/api/auth` е mount-нат ПРЕДИ глобалния authMiddleware → login е публичен; auth.js получава (controlDb, getOrgDb) явно.
- ⚠️ WAL: преди копиране portfolio.db → orgs/1.db: отвори, `wal_checkpoint(TRUNCATE)`, затвори, после copy.
- Стар JWT без organization_id → fallback org 1 (текущата ти сесия не се чупи).

---

### Task 1: db.js — control/org инфраструктура + ALS proxy

**Files:** Modify `backend/db/db.js`

Добавя: `DATA_DIR` (= dirname(DB_PATH)), `initControlDb()`, `getOrgDb(id)` (Map cache + tenant migrations hook), `als` + `runWithOrg(orgId, fn)`, `createDbProxy()` — Proxy с get-trap: `prepare/exec/pragma/transaction/_sqlDb/_maybeSave` → `als.getStore().orgDb`; `control` → controlDb; `orgId` → store.orgId; липсва store → throw 'No org context'. `bootstrap()`: checkpoint+copy portfolio.db→orgs/1.db (ако липсва), org 1 INSERT, users копие → control (+organization_id=1, IVUS→is_superadmin=1). Експортира: `{ initDb (legacy), initControlDb, getOrgDb, dbProxy, runWithOrg, bootstrap, setTenantMigrator }`.

Verify: unit скрипт с временна директория (создава 2 org бази, проверява изолация + proxy throw без контекст). Commit.

### Task 2: миграции — извличане в db/migrations.js

**Files:** Create `backend/db/migrations.js`; Modify `backend/server.js`

- `runControlMigrations(cdb)`: organizations (id, name, created_at, status), users (вербатим CREATE + ALTER-ите от server.js + organization_id INTEGER DEFAULT 1 + is_superadmin INTEGER DEFAULT 0), login_audit.
- `runTenantMigrations(db)`: вербатим преместване на целия миграционен блок от server.js main() (schema.sql exec, seed, patchMarketVal, всички CREATE TABLE/ALTER/UPDATE-и) БЕЗ users/login_audit блоковете.
- server.js main(): initControlDb → runControlMigrations → bootstrap → setTenantMigrator(runTenantMigrations) → getOrgDb за всяка org от control → mount-ове получават dbProxy; crons получават getOrgDb(1); auth получава (controlDb, getOrgDb).

Verify: boot smoke локално (orgs/1.db създаден, таблиците там, логове чисти). Commit.

### Task 3: auth — control users + JWT org claim + ALS middleware

**Files:** Modify `backend/routes/auth.js`, `backend/middleware/auth.js`, `backend/server.js` (mount)

- auth.js: signature `(controlDb, getOrgDb)`; всички users/login_audit заявки → controlDb; getIssuer → getOrgDb(user.organization_id); jwt.sign добавя organization_id.
- middleware/auth.js: след verify → `org = payload.organization_id || 1` → `als.run({orgDb:getOrgDb(org), orgId:org}, next)`.

Verify: login → token съдържа organization_id; защитен endpoint работи. Commit.

### Task 4: users-зависими модули → db.control

**Files:** Modify routes/users.js, payments.js, tenant.js, contracts.js, lib/tenantOnboarding.js, lib/autopayCron.js, lib/investmentsCron.js, server.js (2 места)

- Всяка `db.prepare('...users...')` → `db.control.prepare(...)`; INSERT INTO users добавя organization_id (= `db.orgId`).
- Crons: bound handle org1 носи `.control` и `.orgId=1` (зададени в getOrgDb връщания обект).

Verify: grep остатъчни `FROM users` без .control = 0 (без auth.js, който е пренаписан); integrity тест. Commit.

### Task 5: платформени route-ове (superadmin)

**Files:** Create `backend/routes/platform.js`; Modify server.js (mount след authMiddleware)

- Guard: `req.user.is_superadmin` (claim в JWT при login) → иначе 403.
- `GET /api/platform/orgs` (списък + брой users), `POST /api/platform/orgs` {name, owner_username, owner_password, owner_email} → createOrg helper (org INSERT → getOrgDb(нов id) → owner в control users, role admin).

Verify: с твоя token създай тестова org 2, login като owner-а ѝ → /api/properties = []. Commit.

### Task 6: E2E локално + PR + prod проверка

- Локален boot: org1 parity (properties/metrics/integrity идентични), org2 изолация (празна; писане в org2 не пипа org1), integrity тест.
- Push + PR. След merge: prod smoke (org1 parity, superadmin платформа, стар token fallback).
- Rollback: revert; portfolio.db непокътнат.
