# SaaS Phase 2 — Публичен signup (закрита бета) — Design

**Date:** 2026-06-11 · **Status:** Approved · **Builds on:** Phase 1 (db-per-org, PR #41)

## Goal
Самостоятелна регистрация на нови организации (наемодател/PM фирма) с invite код
(закрита бета), auto-login и празно изолирано работно пространство. Екипни акаунти
се създават от org admin през Settings → Users (работи от Phase 1).

## Backend
- `POST /api/auth/signup` (публичен, loginLimiter-подобен rate limit):
  Body: `{ signup_code, org_name, username, password, email?, name? }`
  - Проверки: SIGNUP_CODE env (изключен ако env липсва → 403 "закрита бета"),
    username глобално свободен, парола ≥8 знака, org_name непразно.
  - Действия: INSERT organizations (plan='trial', trial_ends_at=+30d) →
    getOrgDb(id) (празна структура, без seed — гарантирано от Phase 1 fix) →
    owner user в control (role='admin', is_superadmin=0) → JWT (org claims) →
    `{ token, role, name, organization_id }` (същия shape като /login).
  - Welcome email през Resend (ако RESEND_API_KEY; не блокира при грешка).
- Migration: `organizations` + `plan TEXT DEFAULT 'trial'`, `trial_ends_at DATETIME`.
- createOrg логиката се споделя с platform.js (екстракт в lib/createOrg.js).

## Frontend
- Login.jsx: линк „Нямаш акаунт? Регистрация" ↔ signup форма (код, фирма,
  username, парола, имейл) в същата bespoke визия; submit → token → същия
  onLogin flow като login.
- Празна org: Portfolio/Dashboard показват съществуващите си празни състояния;
  лек hint „Добави първия си имот" където има empty state.

## Сигурност
- Rate limit: 5 опита/15 мин per IP (като login).
- SIGNUP_CODE в Railway env (сменяем/премахваем без deploy на код).
- Никакви данни на org 1 не са достъпни (Phase 1 изолация + E2E тестове).

## Тестове
- E2E разширение: signup с грешен код → 403; с верен код → 201 + token →
  /api/properties = 0; org 1 unchanged.

## Out of scope
Имейл покани с token (екипът се създава от Settings → Users), email
verification, billing (Phase 3).
