# Skyrent — Data Integrity (health-check + import guard)

**Date:** 2026-06-11
**Status:** Approved (intent-discovery), pending implementation
**Approach:** A+ (server-side rule engine + acknowledgments + thin per-property `rent_channel` flag)

## Goal

Two things, sharing one rule core:
1. **Health-check dashboard** — on-demand scan of existing data; surface anomalies grouped by class, with quick-fix and accept/ignore.
2. **Import-time flags** — same rules run on a staged bank import (preview) to warn before saving.

## Why (grounding audit, 2026-06-11)

1572 tx / 40 properties. After the manual rent fixes, remaining classes (bucketed by `месец`):
`doubled_month`×2, `spike`×6, `deposit_mix`×7 (3 false-pos), `period_gap`×7 (real non-payment / other-account), `rent_vs_record`×1 (tenant change), `active_no_rent`×9 (rent via other accounts/cash), duplicates/uncategorized/rent-no-property = **0**.

**Key insight:** most remaining anomalies are *expected* or *false-positive*. Therefore the dashboard's defining feature is **acknowledgment** (accept/ignore persists), and a per-property `rent_channel` flag that suppresses the 9 biggest false-positives (`active_no_rent` + `period_gap` when rent is tracked elsewhere).

## Architecture

```
backend/
  lib/integrityChecks.js   pure functions, one per anomaly class (the DRY core)
  routes/integrity.js      GET /api/integrity, POST /ack, DELETE /ack, POST /check-batch
frontend/
  components/Integrity.jsx  dashboard (new tab 🩺, admin/broker only)
```

The same `integrityChecks.js` functions run both in the dashboard and in the import preview.

## Data model

- **New table `integrity_acks`** (idempotent create at startup, like other tables):
  `id, signature TEXT UNIQUE, status TEXT('accepted'|'ignored'), note TEXT, acked_at TEXT`.
- **New column `properties.rent_channel`** (`ALTER TABLE ... ADD COLUMN`, try/catch migration):
  values `'this'|'other'|'cash'`, default `'this'`. When `!= 'this'`, suppress `active_no_rent` and `period_gap` for that property.
- **Signature:** `check + ':' + property_id + ':' + месец` (coarse → acceptance stable across data refresh). Duplicates (no месец) use the tx-pair ids.

## Check catalog (severity + false-positive refinement)

| check | sev | rule / refinement |
|---|---|---|
| `duplicate` | high | exact (дата+сума+operation+контрагент) tx pair |
| `rent_no_property` | high | категория='наем' Кт, no property_id |
| `uncategorized` | med | Кт/Дт, empty категория |
| `doubled_month` | med | ≥2 наем Кт in same `месец` for a property |
| `spike` | med | 1 наем Кт > 1.7× property `наем` |
| `deposit_mix` | med | наем with депозит/гаранц in основание **AND** eur>1.25×наем **AND** основание not starting `ДЕПОЗИТ (split` (kills Деница + my split-sibling false-pos) |
| `period_gap` | low | missing `месец` within [first,last] tx range; **only if rent_channel='this'** |
| `rent_vs_record` | low | median payment differs >25% from property `наем` (tenant change — informational) |
| `active_no_rent` | low | tenant set + наем>0 + 0 rent tx; **only if rent_channel='this'** |
| `currency_2026_bgn` | info | 2026 наем tagged BGN (informational; confirm ÷1.95583 correct) |

All amounts normalized BGN→EUR (÷1.95583) and bucketed by `месец` (not pay date).

## API (admin/broker; tenant blocked by existing guard)

| endpoint | behavior |
|---|---|
| `GET /api/integrity` | run all checks → `{generated_at, summary{check:count}, findings[]}` minus accepted/ignored |
| `GET /api/integrity?all=1` | include acked (review) |
| `POST /api/integrity/ack` `{signature,status,note}` | upsert ack |
| `DELETE /api/integrity/ack/:signature` | un-ack |
| `POST /api/integrity/check-batch` `{rows}` | check a staged import batch (dup vs existing, missing property/месец, unusual amount vs property rent) |
| `PATCH /api/properties/:id/rent-channel` `{rent_channel}` | set channel |

Each `finding` carries `{check, severity, property_id, месец, signature, title, detail, tx_ids, fix}`. `fix` is a hint mapping to **existing** mutating endpoints (reclassify / month / split-deposit / category / delete) — **no new mutation primitives**.

## Frontend `Integrity.jsx` (new tab 🩺 Интегритет, admin/broker)

- Top: severity summary cards (🔴🟠🟡) with counts.
- Grouped by check; each finding: title, detail, tx links, `[Поправи ▾]` (context actions → existing endpoints) + `[Приеми]` `[Игнорирай]`.
- Toggle "show accepted"; filter by property/severity.
- `rent_channel` quick-select inline on `active_no_rent` findings.
- Adopts `.fin-surface` theming layer (consistent with redesign).

## Import-time flags

In `Import.jsx`, after `/parse` preview, call `POST /api/integrity/check-batch` with staged rows → inline 🟠 badge on suspicious rows **before** `/save`. Same rules = consistency.

## Testing (no test framework in repo)

- `scripts/test_integrity.js` — lightweight regression: asserts known findings (expects ID13 `spike`, 0 `duplicate`, Деница NOT `deposit_mix` after refine), exits 1 on mismatch.
- Manual verification via `scripts/audit_integrity.js`.

## Execution mode

**Delegated Execution** (sequential with review gates) — not parallelizable; all parts share the `integrityChecks.js` core. Order: lib core → routes + table/column → import hook → frontend → test script.

## Out of scope (later)

- Full per-property "expected config" (lease_start/end, expected_rent) and health score (Approach C full).
- ап.8 1150€ cosmetic 2-month split (known, self-corrects).

## Rollback

Feature-branched; additive (new table/column/route/component). Revert = drop branch + (if deployed) `DROP TABLE integrity_acks` / column stays harmless.
