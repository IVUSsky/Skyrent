# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Skyrent is a rental property management system for Bulgarian landlords (Sky Capital OOD). It handles properties, tenants, rent invoices, contracts, expenses, bank imports, and email reminders. The UI and database fields are primarily in Bulgarian (Cyrillic).

## Commands

**Backend** (`backend/`):
```bash
npm run dev    # nodemon — auto-restart on changes
npm start      # production
```

**Frontend** (`frontend/`):
```bash
npm run dev    # Vite dev server (port 5173, proxies /api → localhost:3002)
npm run build  # production build to dist/
npm start      # serve dist/ with `serve` (used by Railway)
```

## Architecture

### Backend
- **Express.js** on port 3002 (or `process.env.PORT`)
- **Database:** sql.js (in-memory SQLite with file persistence). `DB_PATH` defaults to `backend/db/portfolio.db`, overridable via `DB_PATH` env var (set to `/data/portfolio.db` on Railway with a volume mounted at `/data`)
- **Auth:** JWT via `middleware/auth.js`. All `/api/*` routes are protected except `/api/auth/login`. Token is issued for 30 days. Credentials come from `APP_USERNAME` / `APP_PASSWORD` env vars. `JWT_SECRET` env var signs tokens.
- **Email:** Uses Resend API (not SMTP — Railway blocks SMTP ports). Requires `RESEND_API_KEY` env var. From address uses `smtp.user` from settings DB or falls back to `onboarding@resend.dev`.
- **PDF generation:** PDFKit with `backend/fonts/arial.ttf` and `backend/fonts/arialbd.ttf` (bundled, required for Cyrillic text in contracts/invoices)
- **Schema migrations** run idempotently at startup in `server.js` via `ALTER TABLE ... ADD COLUMN` wrapped in try/catch

### Frontend
- **React 18 + Vite + Tailwind CSS**
- All API calls use `apiFetch()` from `src/api.js` — this wrapper adds the JWT token from `localStorage` (`skyrent_token`) to every request
- `VITE_API_URL` must be set at **build time** (baked into the bundle). In production it's set via `frontend/.env.production` pointing to the Railway backend URL
- Login state is managed in `App.jsx` — checks `localStorage.skyrent_token` on load, shows `Login.jsx` if absent

### Route → Component mapping
| Backend route | Frontend component |
|---|---|
| `/api/properties` | Portfolio.jsx, List.jsx, Tenants.jsx |
| `/api/invoices` | Invoices.jsx |
| `/api/contracts` | Contracts.jsx |
| `/api/expenses`, `/api/counterparties` | Expenses.jsx |
| `/api/import` | Import.jsx |
| `/api/loans` | Loans.jsx |
| `/api/metrics` | Dashboard.jsx |
| `/api/email` | Settings.jsx, Tenants.jsx |
| `/api/settings` | Settings.jsx |

### Key data model notes
- `properties` table uses Cyrillic column names (`адрес`, `район`, `наем`, `наемател`, `тип`, `площ`, `покупна`, `ремонт`). Additional columns are added via migrations: `email`, `телефон`, `invoice_enabled`, `invoice_recipient`, `абонат_ток`, `абонат_вода`, `абонат_тец`, `абонат_вход`
- `settings` table is a key-value store (`key TEXT PRIMARY KEY, value TEXT`). SMTP config is stored as JSON under key `smtp`
- `rent_invoices` and `contracts` tables are created at startup in `server.js` (not in `schema.sql`)
- `tenant_history` tracks historical tenants per property

## Deployment (Railway)

Two separate Railway services from the same GitHub repo (`IVUSsky/Skyrent`):
- **Backend:** Root Directory = `backend`, needs volume at `/data`
- **Frontend:** Root Directory = `frontend`

Required Railway environment variables:
- Backend: `DB_PATH=/data/portfolio.db`, `APP_USERNAME`, `APP_PASSWORD`, `JWT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- Frontend: `VITE_API_URL=https://[backend-domain].up.railway.app` (must be set before build — also hardcoded in `frontend/.env.production`)
