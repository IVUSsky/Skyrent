# SaaS Phase 1 — Multi-tenancy ядро (Design)

**Date:** 2026-06-11
**Status:** Approved (intent-discovery), pending implementation
**Approach:** B — database-per-organization + AsyncLocalStorage proxy
**Builds on:** Phase 0 (better-sqlite3, PR #40)

## Goal

Изолирани организации (дребни наемодатели + PM фирми) без промяна по 661-те съществуващи заявки. Всяка org = собствен SQLite файл; платформените неща (users, organizations) в отделен control.db.

## Защо B (а не organization_id колона)

Подход A (shared DB + organization_id WHERE на всяка заявка) изисква редакция на 661 заявки; един пропуснат филтър = данни на чужд клиент (security breach). Подход B прави изолацията **архитектурна**: connection-ът на заявката физически вижда само 1 организация. Доказан SQLite-SaaS патърн (Turso промотира db-per-tenant). Per-org backup/export/delete тривиални. GDPR friendly.

## Файлова структура

```
/data/control.db      → organizations, users (organization_id, is_superadmin), login_audit
/data/orgs/1.db       → org 1 "Sky Capital" — копие на portfolio.db (всички tenant таблици)
/data/orgs/<id>.db    → следващи организации
/data/portfolio.db    → НЕ се трие; остава като pre-migration backup
```

## db.js (нови части)

- `initControlDb()` — отваря control.db (WAL) + контролни миграции.
- `getOrgDb(orgId)` — отваря/кешира `orgs/<id>.db` (Map cache); при първо отваряне пуска tenant миграции.
- `db` proxy — `prepare/exec/pragma/transaction/_sqlDb` делегират към `als.getStore().orgDb`; ако няма ALS store → throw ясна грешка ("no org context").
- `als` (AsyncLocalStorage) + helper `runWithOrg(orgId, fn)` за cron jobs.

## Миграции — разделяне (от server.js)

- `runControlMigrations(cdb)`: users (+organization_id, is_superadmin колони), organizations, login_audit.
- `runTenantMigrations(odb)`: всички останали CREATE TABLE/ALTER (~25 таблици) — изпълнява се върху ВСЯКА org база (idempotent, какъвто е стилът сега).
- server.js: при boot → initControlDb → bootstrap → за всяка org: getOrgDb (пуска tenant миграции).

## Bootstrap (idempotent, при startup)

1. Ако няма `orgs/1.db` и има `portfolio.db` → **копирай** (не местй) → orgs/1.db.
2. control.db: ако няма org 1 → INSERT "Sky Capital".
3. Ако control.users е празна → копирай users редовете от orgs/1.db (organization_id=1; твоят admin → is_superadmin=1).
4. (users таблицата в org базите остава — игнорира се; не я трием за rollback safety.)

## Auth промени

- `routes/auth.js` приема **controlDb** (login/2FA/audit четат от там).
- JWT payload: `{id, username, role, organization_id}`.
- authMiddleware: verify → ако липсва organization_id (стар токен) → **fallback org 1**; `req.user.organization_id` → `getOrgDb()` → `als.run({orgDb}, next)`.
- Tenant role: без промяна (същият containment guard, но scoped до org базата си).

## Провизиране на нова организация

- `createOrg({name, ownerUsername, ownerPassword, ownerEmail})` helper: INSERT org → създай orgs/<id>.db + tenant миграции → owner user в control (role='admin', organization_id=<id>).
- `POST /api/platform/orgs` — **само is_superadmin** (ти). Списък: `GET /api/platform/orgs`.
- Публичен signup → Фаза 2.

## ⚠️ Cron/scheduled jobs

Фонови задачи (daily backup, smart отчет, investments crons, contract expiry…) работят извън заявка → няма ALS контекст. Всяка се обвива в `runWithOrg(1, fn)` (org-1 = твоят бизнес). При Фаза 2+ — итерация по всички org-и където е приложимо.

## Тестове

1. Integrity тест (pure) — минава.
2. Boot: org 1 работи идентично (parity на ключови endpoint-и).
3. Изолация: createOrg(2) → login org-2 owner → празни properties; добавяне в org 2 не пипа org 1.

## Rollback

Revert на кода → portfolio.db е непокътнат → старият single-db режим. orgs/ директорията остава странична (без ефект).

## Out of scope

Фаза 2: публичен signup/onboarding/покани. Фаза 3: Stripe billing. Фаза 4: white-label.
