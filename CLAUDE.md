# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Skyrent is a rental-property management system for Bulgarian landlords, evolving into a **multi-tenant B2B SaaS**. It handles properties, tenants, rent invoices, contracts, expenses, bank-statement imports, a tenant self-service portal, Stripe payments, and side products (internet reselling). The UI and most DB columns are in **Bulgarian (Cyrillic)** — column names like `адрес`, `наем`, `наемател` are real and must be quoted exactly.

## Commands

**Backend** (`backend/`): `npm run dev` (nodemon) · `npm start` (prod) · `npm run seed` / `npm run seed:2026` (test data)
**Frontend** (`frontend/`): `npm run dev` (Vite :5173, proxies `/api` → :3002) · `npm run build` · `npm start` (serve dist/)

No test framework is configured. To validate changes: `node --check <file>` for backend syntax, `npm run build` for frontend (catches JSX/import errors). Ad-hoc logic is verified with standalone `node -e` scripts against an in-memory `better-sqlite3` DB (see this repo's history for the pattern).

## Workflow (important)

- **Always work on a feature branch + open a PR.** The user merges PRs himself — Railway deploys `main` directly to production, so never push to `main`.
- After a PR is merged, verify it actually landed: `git checkout main && git pull`, then `grep` for the changed symbol in `main` and check `curl -s -o /dev/null -w '%{http_code}' https://api.skycapital.pro/api/health` (expect 200). PRs have been silently dropped before.
- **Commit messages with Cyrillic fail via PowerShell here-strings** — use the Bash tool (`git commit -q -m "..."`) for any commit with Cyrillic text.
- `backend/scripts/*` are untracked one-off scripts that contain a **hardcoded admin JWT** — never `git add` them. They are also the easiest way to hit prod: `grep -oE 'eyJhbGciOi[A-Za-z0-9._-]+' scripts/apply_rent_matches.js | head -1` extracts a token to call `https://api.skycapital.pro`.

## Architecture

### Multi-tenancy (the part you must understand before touching the DB)

The DB engine is **`better-sqlite3`** (on-disk, WAL) — NOT sql.js (despite older comments). Tenancy is **database-per-organization**, wired in `backend/db/db.js`:

- `<DATA_DIR>/control.db` — `organizations`, `users`, `login_audit` (the platform).
- `<DATA_DIR>/orgs/<id>.db` — one DB per org with ALL tenant tables (properties, transactions, invoices, …).
- `<DATA_DIR>/portfolio.db` — pre-SaaS backup; bootstrap copies it → `orgs/1.db` (org 1 = the original Sky Capital data). Never deleted.

Request flow: `middleware/auth.js` verifies the JWT, then `als.run({ orgDb, orgId }, …)` (an `AsyncLocalStorage`). A **`dbProxy`** resolves the per-request org DB from the ALS store, so the ~660 existing queries (`db.prepare(...)`) needed no changes. Key facts:

- **`users` is a `TEMP VIEW`** in each org DB: the org connection `ATTACH`es control.db as `ctrl`, then `CREATE TEMP VIEW users AS SELECT * FROM ctrl.users WHERE organization_id=<id>`. So SELECTs/JOINs on `users` work unchanged and auto-filter by org. **Writes to users must go through `db.control`** (the control.db connection) with an explicit `organization_id` / `db.orgId` guard — see `lib/tenantOnboarding.js`, `routes/users.js`, `lib/createOrg.js`.
- Under `ATTACH`, **unqualified table names can resolve to `ctrl`** — qualify with `main.` when it matters (see `ensureUsersView`).
- **`foreign_keys = OFF` on org connections** (set in `openDb`). Required: `ensureUsersView` renames the legacy `users` table to `users_legacy`, and SQLite auto-rewrites FKs (`contracts.tenant_user_id`, `tenant_chat_messages.tenant_user_id`) to point at it — but tenant users live in control.db, so FK checks would fail with "FOREIGN KEY constraint failed". Integrity is maintained in code (manual cascades). The one org-schema `ON DELETE CASCADE` (`bulgar_dividends`) is org-1-only.
- **multer/streams lose the ALS context** (busboy finishes in a socket-root async context → "No org context"). Every route using `multer` MUST add the `orgContext` middleware (from `db/db.js`) **after** the upload middleware. 13 sites across 7 route files already do this.
- Cron jobs and the Stripe webhook run without a request/ALS context → they use a bound org-1 handle (`orgMain = getOrgDb(1)`).
- **`ORG1_ONLY`** paths — `/api/investments`, `/api/smart`, `/api/personal` — return 403 for org ≠ 1 (they use Sky Capital's env-level API keys: Trading 212, Tuya, gold price). Frontend hides these tabs by decoding `organization_id`/`is_superadmin` from the JWT.
- Billing enforcement middleware returns **402 `{billing:true}`** for expired-trial/suspended orgs (except `/api/billing` + `/api/auth`); org 1 + superadmin are exempt.

Migrations live in **`backend/db/migrations.js`**: `runControlMigrations(db)` (control.db) and `runTenantMigrations(db)` (runs on every org DB, idempotent `ALTER TABLE ... ADD COLUMN` in try/catch). **Do not call `seed()`/`patchMarketVal()` inside tenant migrations** — they would leak org-1's properties into every new org (caught by the E2E isolation test).

### Backend conventions

- **Express** on :3002. JWT auth (`middleware/auth.js`); all `/api/*` protected except `/api/auth/login` + `/signup` (gated by `SIGNUP_CODE` env; absent → signup disabled).
- **Email:** Resend HTTP API (Railway blocks SMTP). `RESEND_API_KEY` + `RESEND_FROM_EMAIL`.
- **PDF:** PDFKit with bundled `backend/fonts/arial*.ttf` (required for Cyrillic). Invoice generation core (`nextInvoiceNumber`, `generatePDF`, `createSimpleInvoice`) is in `routes/invoices.js` and **exported** for reuse (e.g. the internet auto-invoice in `routes/payments.js`).
- **Data-integrity engine:** `lib/integrityChecks.js` is a pure function `runChecks({transactions, properties, expenses, acks})` → findings, used by both the 🩺 dashboard (`routes/integrity.js` GET) and the import preview (`POST /check-batch`).

### Frontend conventions

- **React 18 + Vite + Tailwind.** All API calls go through `apiFetch()` (`src/api.js`), which injects the JWT from `localStorage.skyrent_token` and emits a `skyrent:billing-required` event on 402.
- `VITE_API_URL` is **baked at build time** from `frontend/.env.production` (the frontend Railway service has NO Variables). Production: `https://api.skycapital.pro`; frontend served at `https://app.skycapital.pro` (Cloudflare-proxied CNAMEs to Railway). Old `*.up.railway.app` URLs still work in parallel; the Stripe webhook intentionally stays on the old railway URL.
- **All tab views are `React.lazy(() => import(...))`.** There is an `ErrorBoundary` (`src/components/ErrorBoundary.jsx`) wrapping the Suspense boundaries: on a chunk-load failure (stale `index.html` after a deploy) it auto-reloads once via a `sessionStorage` guard. The PWA service worker (`public/sw.js`) is network-first for HTML, cache-first for hashed assets; bump `CACHE_NAME` when changing caching behavior.
- Tenant users (`role === 'tenant'`) render `TenantApp.jsx` instead of the admin shell (see `App.jsx`); superadmins additionally get the 🛸 Платформа tab.

### Contracts & documents (routes/contracts.js + contractScans.js)

- **Templates** (`contract_templates`, per-org): plain text with `{{ПЛЕЙСХОЛДЪРИ}}` — the full placeholder map is `buildFields()` in `routes/contracts.js` (~60 keys: НАЕМАТЕЛ_*, НАЕМОДАТЕЛ_* incl. `*_EN` latinized variants, ИМОТ_*, НАЕМ/ДЕПОЗИТ + `_ДУМИ`, СРОК_BG/EN, АБОНАТ_*, БРОЙ_КЛЮЧОВЕ_*). API: GET/POST `/templates`, PUT `/templates/:id` (multipart FormData, field `content`).
- **PDF renderer** (`generateContractPDF` → `renderLine`): `#`/`##`/`###` headings, `**whole-line bold**`, `---`, lines starting `Чл.`/`Art.` auto-bold, and **`BG ||| EN` → two parallel columns** (bilingual contracts). The "Приемо-предавателен протокол" template (id 3) is looked up **by exact name** and auto-generated alongside every contract.
- **EN side of bilingual contracts**: `issuer.name_en/mol_en/address_en` (settings) take precedence; otherwise official BG transliteration via `translit()`. Never let Cyrillic reach the EN column.
- **Contract creation** auto-upserts the tenant into `tenant_directory` (указател, API `/api/contracts/parties`), as does ID-card scanning (`/extract-id` — prompt requires verbatim transcription, NO transliteration of foreign documents). Data is saved even if the contract draft is abandoned.
- **Activation** (`POST /:id/activate`): updates the property, provisions the tenant portal user, and takes `issue_invoice: bool` in the body — `true` sets `invoice_enabled=1` on the property and issues the first invoice (overrides the `auto_invoice_on_activate` setting).
- **Pro-rata first month** (in `generateRentInvoice`, routes/invoices.js): if the active contract starts after the 1st, the invoice = `наем × 12 ÷ 365 × days-to-month-end` with the formula in notes.
- **Archive of existing contracts** (`routes/contractScans.js`): PDF/docx/images → Claude extracts fields (line-based prompt) → `/apply` creates the contract + updates property + upserts tenant_directory.
- Invoices auto-send to Controlisy (accounting) when `kontrolisi_auto` setting is on; PUT `/api/settings` is a per-key upsert so partial updates are safe.

### Expenses domain (routes/expenses.js)

- **AI invoice parser** (`/extract-ai`): XML first (e-invoice.bg), Claude fallback for PDF/images. **Dual-currency guard**: 2026+ Bulgarian invoices print both лв and €; if `no_vat + vat ≠ total` but matches via ×/÷1.95583, the amount is normalized and flagged in `ai_notes`. Keep this invariant when touching the parser.
- **Split across properties** (`POST /:id/split` `{parts:[{property_id, amount}]}`): first part updates the original row, the rest become copies; sum must equal the original (±0.01).
- **Line items** (`expense_invoice_items`): `POST /:id/extract-items` (Claude reads the invoice document → verbatim product rows with codes/prices), `GET /items/search?q=латекс` (global search with property attribution). Route order matters: `/items/search` is defined before `/:id/...`.
- **Renovation rollup** (`lib/renovationCosts.js`): SUM of `expense_category='ремонт'` invoices per property (BGN→EUR by 1.95583) is returned as `ремонт_фактури` on GET `/api/properties` and added to the manual `ремонт` column in ALL investment math (Portfolio cost, Analysis, metrics.js, metricsPortfolio.js, wealthSnapshot.js) via `renoTotal(p, map)`. The manual `ремонт` column itself is never mutated (would double-count on edit round-trips). `'ремонт д'` (personal) is excluded.

### Public site & marketing

- **Public pages** (checked by `pubPath` in App.jsx BEFORE auth): `/blog`, `/blog/sravnenie-softuer-naemi`, `/programa-za-upravlenie-na-imoti`, `/remonti`, `/dogovor-naem`, `/kalkulator-naem`, `/imoti`, `/usloviya`, `/poveritelnost`. Shared sticky nav: `PublicNav.jsx`. **`/?site=1` shows the landing even when authenticated** (the app-header logo links there). Brand: ink `#15151e`, brass `#c9a24b`/`#e0bd6e`, Playfair Display + Manrope; `SkyLogo` is exported from `LandingPage.jsx`.
- **New public page checklist**: route in App.jsx (lazy) → add to the dynamic sitemap (`backend/routes/public.js`) → link in footers → mention in `frontend/public/llms.txt` → Request Indexing (GSC + Bing).
- **SEO/GEO layer**: llms.txt + robots.txt (AI crawlers explicitly allowed) + JSON-LD `@graph` in `index.html`. Wording rule: "без банкова карта" (never "без карта").
- **Screenshots/video assets**: demo org 3 (`Демо Имоти ЕООД`, user `demo`) holds seeded fake data — NEVER screenshot org 1 (real tenant PII) for public materials. Blog screenshots live in `frontend/public/blog/`; finished videos + end-cards in `Skyrent/marketing/` (not a build artifact — keep). Generation scripts (puppeteer/sharp/HeyGen/ElevenLabs pipeline) are in `%TEMP%\skyrent-logo\`.

### Key data-model notes

- `settings` is a key-value store (`key`, `value`); JSON blobs under keys like `smtp`, `issuer`, `account_scope_map`.
- `transactions.currency`: `'BGN'` pre-2026-01-01, `'EUR'` after (Bulgaria adopted EUR; fixed rate **1.95583**). Monetary aggregations convert BGN via `÷1.95583` in SQL. The **bank-import dedup is currency-aware** — it compares EUR-normalized amounts so the same payment isn't double-imported once in BGN and once in EUR (`routes/import.js` `DEDUP_SQL`/`isDup`).
- `rent_invoices.product`: `'наем'` (default) | `'интернет'` — internet income is a separate product, not rent.
- `expense_invoices.expense_category` includes `'инвестиция'`/`'благородни метали'` etc. — excluded from operational expense totals (see Dashboard/Analysis); `payment_type` ∈ `фактура`/`в брой`/`касова бележка`/`банков_импорт`.
- **Cyrillic SQL comparisons are flaky** in some environments — avoid `WHERE col = 'кирилица'`; fetch rows and filter with JS `.toLowerCase().includes()`.

## Deployment (Railway)

Two services from `IVUSsky/Skyrent`: **backend** (Root = `backend`, `Dockerfile`, volume at `/data`) and **frontend** (Root = `frontend`, nixpacks — do not switch to Dockerfile, `serve` startup breaks).

Backend env: `DB_PATH=/data/portfolio.db` (DATA_DIR is its dirname → control.db + orgs/ live there), `JWT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `STRIPE_SECRET_KEY`, optional `SIGNUP_CODE`, `FRONTEND_URL`. Frontend env: `VITE_API_URL` (also in `.env.production`).

`browser confirm()/alert()` can be **blocked in PWA standalone mode** — regular browser tabs work (Contracts.jsx uses `window.confirm` successfully). For anything that must work installed-as-app, prefer inline React state confirm patterns (`confirmState ? <Да/Не> : <trigger>`).
