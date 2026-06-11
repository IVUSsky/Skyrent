# Data Integrity (health-check + import guard) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use godmode:task-runner to implement this plan task-by-task.

**Goal:** Add a server-side rule engine that surfaces data anomalies in an on-demand admin dashboard and flags suspicious rows at bank-import time, with persistent accept/ignore.

**Architecture:** A pure-function core (`backend/lib/integrityChecks.js`) takes plain arrays (transactions, properties, expenses, acks) and returns findings. A route (`backend/routes/integrity.js`) loads from the sql.js DB and calls the core; the same core runs on a staged import batch. A new `integrity_acks` table persists accept/ignore; a new `properties.rent_channel` column suppresses expected false-positives. Frontend `Integrity.jsx` renders findings with quick-fix (reusing existing mutation endpoints) and accept/ignore.

**Tech Stack:** Express, sql.js (in-memory SQLite, better-sqlite3-like wrapper), React 18 + Vite + Tailwind, Node ≥18. No test framework → a self-contained Node assertion script.

**Design doc:** `docs/plans/2026-06-11-data-integrity-design.md`

---

## Conventions

- Amounts normalized BGN→EUR via `÷1.95583`; bucket by `месец` (rent period), not pay date.
- Signature: `check + ':' + property_id + ':' + месец` (coarse, stable). Duplicates: `'duplicate:' + min(id) + ':' + max(id)`.
- Each task ends with a commit. Backend is fully testable locally (no prod dependency) via the fixture test.
- Verify backend with: `node --check <file>` and `node backend/scripts/test_integrity.js`.

---

### Task 1: Integrity check core (`integrityChecks.js`) — TDD

Follow `godmode:test-first`. The core is pure: no DB, no I/O.

**Files:**
- Create: `backend/lib/integrityChecks.js`
- Test: `backend/scripts/test_integrity.js`

**Step 1: Write the failing test with fixtures**

Create `backend/scripts/test_integrity.js`:

```js
// Self-contained assertion test for integrityChecks (no framework).
const assert = require('assert');
const { runChecks } = require('../lib/integrityChecks');

const RATE = 1.95583;
// minimal fixtures
const properties = [
  { id: 1, адрес: 'A', наем: 500, наемател: 'Tenant A', rent_channel: 'this' },
  { id: 2, адрес: 'B', наем: 500, наемател: 'Tenant B', rent_channel: 'other' }, // rent elsewhere
  { id: 3, адрес: 'C', наем: 100, наемател: '— (WIP)', rent_channel: 'this' },    // not active
];
const tx = [
  // дубликат
  { id: 10, дата: '2026-02-01', сума: 500, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-02', контрагент: 'X', основание: '' },
  { id: 11, дата: '2026-02-01', сума: 500, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-02', контрагент: 'X', основание: '' },
  // удвоен месец (id12,13 в 2026-03)
  { id: 12, дата: '2026-03-01', сума: 500, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-03', контрагент: 'X', основание: '' },
  { id: 13, дата: '2026-03-28', сума: 500, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-03', контрагент: 'X', основание: '' },
  // spike (1tx > 1.7×)
  { id: 14, дата: '2026-04-01', сума: 1200, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-04', контрагент: 'X', основание: '' },
  // deposit_mix истински (> 1.25× наем + 'депозит')
  { id: 15, дата: '2026-05-01', сума: 900, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-05', контрагент: 'X', основание: 'наем и депозит' },
  // deposit_mix FALSE-positive: split sibling (основание 'ДЕПОЗИТ (split') → НЕ флагва
  { id: 16, дата: '2025-11-25', сума: 665, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2025-12', контрагент: 'X', основание: 'ДЕПОЗИТ (split от #99): X' },
  // deposit_mix FALSE-positive: депозит в текст но сума ≈ наем (Деница-стил) → НЕ флагва
  { id: 17, дата: '2026-06-01', сума: 490, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: 1, месец: '2026-06', контрагент: 'X', основание: 'наем юни половин депозит' },
  // некатегоризиран
  { id: 18, дата: '2026-01-09', сума: 50, currency: 'EUR', operation: 'Дт', категория: '', property_id: null, месец: '2026-01', контрагент: 'Y', основание: '' },
  // наем без имот
  { id: 19, дата: '2026-01-10', сума: 500, currency: 'EUR', operation: 'Кт', категория: 'наем', property_id: null, месец: '2026-01', контрагент: 'Z', основание: '' },
];

function run(acks = []) { return runChecks({ transactions: tx, properties, expenses: [], acks }); }
const f = run();
const has = (check, pred = () => true) => f.some(x => x.check === check && pred(x));

assert(has('duplicate'), 'duplicate not found');
assert(has('doubled_month', x => x.property_id === 1 && x.месец === '2026-03'), 'doubled_month 2026-03 missing');
assert(has('spike', x => x.property_id === 1 && x.месец === '2026-04'), 'spike 2026-04 missing');
assert(has('deposit_mix', x => x.tx_ids.includes(15)), 'real deposit_mix missing');
assert(!has('deposit_mix', x => x.tx_ids.includes(16)), 'split sibling wrongly flagged deposit_mix');
assert(!has('deposit_mix', x => x.tx_ids.includes(17)), 'rent-portion wrongly flagged deposit_mix');
assert(has('uncategorized', x => x.tx_ids.includes(18)), 'uncategorized missing');
assert(has('rent_no_property', x => x.tx_ids.includes(19)), 'rent_no_property missing');
// property 2 rent_channel='other' → no active_no_rent / period_gap
assert(!has('active_no_rent', x => x.property_id === 2), 'active_no_rent should be suppressed for rent_channel=other');
// property 1 active with tx → no active_no_rent
assert(!has('active_no_rent', x => x.property_id === 1), 'active_no_rent false positive on prop 1');
// every finding has a signature
assert(f.every(x => typeof x.signature === 'string' && x.signature.length), 'finding missing signature');
// acknowledgment removes a finding
const oneSig = f.find(x => x.check === 'spike').signature;
const after = run([{ signature: oneSig, status: 'accepted' }]);
assert(!after.some(x => x.signature === oneSig), 'accepted finding not filtered');

console.log('✓ all integrity checks pass (' + f.length + ' findings on fixtures)');
```

**Step 2: Run to verify failure**

Run: `node backend/scripts/test_integrity.js`
Expected: FAIL — `Cannot find module '../lib/integrityChecks'`.

**Step 3: Implement `backend/lib/integrityChecks.js`**

```js
// Pure data-integrity rule engine. No DB/IO. Input = plain arrays.
const RATE = 1.95583;
const eur = t => String(t.currency).toUpperCase() === 'BGN' ? (Number(t.сума) / RATE) : Number(t.сума);
const mkey = d => (d || '').slice(0, 7);
const period = t => t.месец || mkey(t.дата);
const sig = (check, pid, m) => `${check}:${pid == null ? '' : pid}:${m || ''}`;

function runChecks({ transactions = [], properties = [], expenses = [], acks = [] }) {
  const ackSet = new Map(acks.map(a => [a.signature, a.status]));
  const pmap = {}; for (const p of properties) pmap[p.id] = p;
  const out = [];
  const push = (o) => { o.signature = o.signature || sig(o.check, o.property_id, o.месец); out.push(o); };

  // duplicate (exact)
  const seen = {};
  for (const t of transactions) {
    const k = [t.дата, Math.round(Number(t.сума) * 100), t.operation, (t.контрагент || '').trim().toUpperCase()].join('|');
    if (seen[k]) push({ check: 'duplicate', severity: 'high', property_id: t.property_id ?? null, месец: period(t),
      signature: `duplicate:${Math.min(seen[k], t.id)}:${Math.max(seen[k], t.id)}`,
      title: 'Дубликат транзакция', detail: `${t.дата} ${t.сума} ${t.operation} ${(t.контрагент || '').slice(0, 24)}`,
      tx_ids: [seen[k], t.id], fix: { type: 'delete', tx_id: t.id } });
    else seen[k] = t.id;
  }

  // uncategorized
  for (const t of transactions) if (!t.категория) push({ check: 'uncategorized', severity: 'med',
    property_id: t.property_id ?? null, месец: period(t), title: 'Без категория',
    detail: `${t.дата} ${t.сума} ${t.operation} ${(t.контрагент || '').slice(0, 24)}`,
    tx_ids: [t.id], fix: { type: 'category', tx_id: t.id } });

  // rent_no_property
  for (const t of transactions) if (t.категория === 'наем' && t.operation === 'Кт' && !t.property_id)
    push({ check: 'rent_no_property', severity: 'high', property_id: null, месец: period(t),
      signature: sig('rent_no_property', t.id, period(t)),
      title: 'Наем без имот', detail: `${t.дата} ${Math.round(eur(t))}€ ${(t.основание || '').slice(0, 28)}`,
      tx_ids: [t.id], fix: { type: 'category', tx_id: t.id } });

  // per-property rent grouping
  const byProp = {};
  for (const t of transactions) if (t.operation === 'Кт' && t.категория === 'наем' && t.property_id)
    (byProp[t.property_id] = byProp[t.property_id] || []).push(t);

  for (const p of properties) {
    const rents = (byProp[p.id] || []).slice().sort((a, b) => (a.дата || '').localeCompare(b.дата || ''));
    const rent = Number(p.наем) || 0;
    const months = {};
    for (const t of rents) { const m = period(t); (months[m] = months[m] || { sum: 0, ids: [] }); months[m].sum += eur(t); months[m].ids.push(t.id); }
    const mk = Object.keys(months).sort();

    for (const m of mk) if (months[m].ids.length >= 2) push({ check: 'doubled_month', severity: 'med',
      property_id: p.id, месец: m, title: `Удвоен месец — ${p.адрес}`,
      detail: `${m}: ${Math.round(months[m].sum)}€ (${months[m].ids.length} плащания)`, tx_ids: months[m].ids, fix: { type: 'month', tx_ids: months[m].ids } });

    for (const m of mk) if (rent > 0 && months[m].ids.length === 1 && months[m].sum > rent * 1.7)
      push({ check: 'spike', severity: 'med', property_id: p.id, месец: m, title: `Висока сума — ${p.адрес}`,
        detail: `${m}: ${Math.round(months[m].sum)}€ (наем ${rent}€)`, tx_ids: months[m].ids, fix: { type: 'split', tx_id: months[m].ids[0] } });

    for (const t of rents) {
      const osn = t.основание || '';
      if (/^ДЕПОЗИТ \(split/i.test(osn)) continue;                 // мой split-sibling
      if (!/ДЕПОЗИТ|DEPOSIT|ГАРАНЦ/i.test(osn)) continue;
      if (!(rent > 0 && eur(t) > rent * 1.25)) continue;           // вече разделена наемна част → пропусни
      push({ check: 'deposit_mix', severity: 'med', property_id: p.id, месец: period(t),
        signature: sig('deposit_mix', t.id, period(t)),
        title: `Наем+депозит в едно — ${p.адрес}`, detail: `${t.дата} ${Math.round(eur(t))}€ | ${osn.slice(0, 30)}`,
        tx_ids: [t.id], fix: { type: 'split', tx_id: t.id } });
    }

    const active = p.наемател && !/^—|WIP|строи|DUPLICATE/i.test(p.наемател) && rent > 0;
    const tracked = (p.rent_channel || 'this') === 'this';

    if (active && tracked && !rents.length) push({ check: 'active_no_rent', severity: 'low', property_id: p.id, месец: null,
      title: `Активен без наем — ${p.адрес}`, detail: `нает. ${p.наемател}, наем ${rent}€ — 0 наемни транзакции`,
      tx_ids: [], fix: { type: 'rent_channel', property_id: p.id } });

    if (tracked && mk.length >= 3) {
      const [fy, fm] = mk[0].split('-').map(Number); const [ly, lm] = mk[mk.length - 1].split('-').map(Number);
      const gaps = [];
      for (let y = fy, mo = fm; (y < ly) || (y === ly && mo <= lm); ) { const key = `${y}-${String(mo).padStart(2, '0')}`; if (!months[key]) gaps.push(key); mo++; if (mo > 12) { mo = 1; y++; } }
      if (gaps.length) push({ check: 'period_gap', severity: 'low', property_id: p.id, месец: gaps[0],
        signature: sig('period_gap', p.id, gaps.join(',')),
        title: `Липсващ месец — ${p.адрес}`, detail: `липсват: ${gaps.join(', ')}`, tx_ids: [], fix: { type: 'rent_channel', property_id: p.id } });
    }

    if (rents.length) {
      const sums = rents.map(eur).sort((a, b) => a - b); const med = sums[Math.floor(sums.length / 2)];
      if (rent > 0 && Math.abs(med - rent) / rent > 0.25) push({ check: 'rent_vs_record', severity: 'low', property_id: p.id, месец: null,
        title: `Наем ≠ запис — ${p.адрес}`, detail: `медиана плащане ${Math.round(med)}€ vs запис ${rent}€`, tx_ids: [], fix: null });
    }
  }

  // filter acknowledged
  return out.filter(o => !ackSet.has(o.signature));
}

module.exports = { runChecks, _eur: eur, _RATE: RATE };
```

**Step 4: Run test to verify pass**

Run: `node backend/scripts/test_integrity.js`
Expected: `✓ all integrity checks pass (N findings on fixtures)`

**Step 5: Commit**

```bash
git add backend/lib/integrityChecks.js backend/scripts/test_integrity.js
git commit -m "feat(integrity): pure rule-engine core + fixture regression test"
```

---

### Task 2: DB migration — `integrity_acks` table + `properties.rent_channel`

**Files:**
- Modify: `backend/server.js` (startup migrations block, near other `CREATE TABLE`/`ALTER TABLE`)

**Step 1: Add table + column (idempotent)**

Find the startup migration area (where `rent_invoices`/`contracts` tables are created and `ALTER TABLE ... ADD COLUMN` calls live). Add:

```js
// integrity acknowledgments (accept/ignore findings)
db.exec(`CREATE TABLE IF NOT EXISTS integrity_acks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signature TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted',
  note TEXT,
  acked_at TEXT
)`);
try { db.exec("ALTER TABLE properties ADD COLUMN rent_channel TEXT DEFAULT 'this'"); } catch (_) {}
console.log('integrity tables ready');
```

**Step 2: Verify the server still boots**

Run: `node --check backend/server.js` → Expected: no output (OK).
Run (local boot smoke): `node -e "require('./backend/server.js')"` then Ctrl-C after you see `integrity tables ready` and `Backend running on port`.
Expected: log line `integrity tables ready`.

**Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat(integrity): integrity_acks table + properties.rent_channel migration"
```

---

### Task 3: API route `routes/integrity.js` + mount + rent-channel setter

**Files:**
- Create: `backend/routes/integrity.js`
- Modify: `backend/server.js` (mount, after other `app.use('/api/...')`)
- Modify: `backend/routes/properties.js` (add `PATCH /:id/rent-channel`)

**Step 1: Create the route**

`backend/routes/integrity.js`:

```js
const express = require('express');
const { runChecks } = require('../lib/integrityChecks');

module.exports = (db) => {
  const router = express.Router();
  const block = (req, res) => { if (req.user?.role === 'tenant') { res.status(403).json({ error: 'Forbidden' }); return true; } return false; };

  const load = () => ({
    transactions: db.prepare('SELECT * FROM transactions').all(),
    properties: db.prepare('SELECT * FROM properties').all(),
    expenses: db.prepare('SELECT * FROM expense_invoices').all(),
    acks: db.prepare('SELECT signature, status FROM integrity_acks').all(),
  });

  router.get('/', (req, res) => {
    if (block(req, res)) return;
    try {
      const data = load();
      const findings = req.query.all === '1'
        ? runChecks({ ...data, acks: [] })
        : runChecks(data);
      const summary = {};
      for (const f of findings) summary[f.check] = (summary[f.check] || 0) + 1;
      res.json({ generated_at: new Date().toISOString(), summary, findings });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/ack', (req, res) => {
    if (block(req, res)) return;
    try {
      const { signature, status = 'accepted', note } = req.body || {};
      if (!signature) return res.status(400).json({ error: 'signature required' });
      const exist = db.prepare('SELECT id FROM integrity_acks WHERE signature=?').get(signature);
      if (exist) db.prepare('UPDATE integrity_acks SET status=?, note=?, acked_at=? WHERE signature=?')
        .run(status, note || null, new Date().toISOString(), signature);
      else db.prepare('INSERT INTO integrity_acks (signature, status, note, acked_at) VALUES (?,?,?,?)')
        .run(signature, status, note || null, new Date().toISOString());
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/ack/:signature', (req, res) => {
    if (block(req, res)) return;
    try { const r = db.prepare('DELETE FROM integrity_acks WHERE signature=?').run(req.params.signature); res.json({ ok: true, deleted: r.changes }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // staged import batch — rows: [{дата,сума,currency,operation,категория,property_id,месец,контрагент,основание}]
  router.post('/check-batch', (req, res) => {
    if (block(req, res)) return;
    try {
      const rows = (req.body?.rows || []).map((r, i) => ({ id: 'new' + i, ...r }));
      const existing = db.prepare('SELECT дата, сума, operation, контрагент FROM transactions').all();
      const dupKeys = new Set(existing.map(t => [t.дата, Math.round(Number(t.сума) * 100), t.operation, (t.контрагент || '').trim().toUpperCase()].join('|')));
      const properties = db.prepare('SELECT * FROM properties').all();
      const findings = runChecks({ transactions: rows, properties, expenses: [], acks: [] });
      // допълнително: дубликат СПРЯМО съществуващите
      for (const r of rows) {
        const k = [r.дата, Math.round(Number(r.сума) * 100), r.operation, (r.контрагент || '').trim().toUpperCase()].join('|');
        if (dupKeys.has(k)) findings.push({ check: 'duplicate_existing', severity: 'high', property_id: r.property_id ?? null,
          месец: r.месец || (r.дата || '').slice(0, 7), title: 'Вече съществува в базата',
          detail: `${r.дата} ${r.сума} ${r.operation} ${(r.контрагент || '').slice(0, 24)}`, tx_ids: [r.id], fix: null });
      }
      const byRow = {};
      for (const f of findings) for (const id of f.tx_ids) (byRow[id] = byRow[id] || []).push({ check: f.check, severity: f.severity, title: f.title });
      res.json({ ok: true, byRow });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
```

**Step 2: Mount in `server.js`**

After the other `app.use('/api/...')` lines:

```js
app.use('/api/integrity', require('./routes/integrity')(db));
```

**Step 3: Add `PATCH /:id/rent-channel` in `backend/routes/properties.js`**

Near the existing property update endpoints:

```js
router.patch('/:id/rent-channel', (req, res) => {
  if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Forbidden' });
  const ch = req.body?.rent_channel;
  if (!['this', 'other', 'cash'].includes(ch)) return res.status(400).json({ error: "rent_channel: this|other|cash" });
  db.prepare('UPDATE properties SET rent_channel=? WHERE id=?').run(ch, req.params.id);
  res.json({ ok: true });
});
```

**Step 4: Verify**

Run: `node --check backend/routes/integrity.js && node --check backend/server.js && node --check backend/routes/properties.js`
Expected: no errors.

**Step 5: Commit**

```bash
git add backend/routes/integrity.js backend/server.js backend/routes/properties.js
git commit -m "feat(integrity): API route (findings/ack/check-batch) + rent_channel setter"
```

---

### Task 4: Frontend dashboard `Integrity.jsx` + tab wiring

**Files:**
- Create: `frontend/src/components/Integrity.jsx`
- Modify: `frontend/src/App.jsx` (register tab + nav button, admin/broker only)

**Step 1: Build the component**

`frontend/src/components/Integrity.jsx` (skeleton — adopt `.fin-surface`, follow Dashboard.jsx patterns for `apiFetch`):

```jsx
import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
const API = import.meta.env.VITE_API_URL || ''
const SEV = { high: { c: 'text-red-700 bg-red-50', l: '🔴' }, med: { c: 'text-amber-700 bg-amber-50', l: '🟠' }, low: { c: 'text-gray-600 bg-gray-50', l: '🟡' }, info: { c: 'text-blue-700 bg-blue-50', l: 'ⓘ' } }

export default function Integrity() {
  const [data, setData] = useState(null)
  const [showAcked, setShowAcked] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = () => { setBusy(true); apiFetch(`${API}/api/integrity${showAcked ? '?all=1' : ''}`).then(r => r.json()).then(setData).finally(() => setBusy(false)) }
  useEffect(load, [showAcked])

  const ack = (signature, status) => apiFetch(`${API}/api/integrity/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature, status }) }).then(load)

  if (!data) return <div className="p-8 text-gray-400">Зарежда…</div>
  const groups = {}
  for (const f of data.findings) (groups[f.check] = groups[f.check] || []).push(f)

  return (
    <div className="fin-surface p-6 max-w-5xl mx-auto">
      <div className="iv-mast mb-6">
        <div><div className="iv-mast-eyebrow">Качество на данните</div><h1 className="iv-mast-title">🩺 Интегритет</h1></div>
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={showAcked} onChange={e => setShowAcked(e.target.checked)} /> покажи приети</label>
      </div>
      <div className="flex gap-3 mb-6 flex-wrap">
        {Object.entries(data.summary).map(([k, n]) => <div key={k} className="kpi-card px-4 py-2"><div className="kpi-label">{k}</div><div className="kpi-value">{n}</div></div>)}
        {!data.findings.length && <div className="text-green-700">✓ Няма активни findings</div>}
      </div>
      {Object.entries(groups).map(([check, items]) => (
        <section key={check} className="mb-6">
          <h2 className="iv-section-h">{check} <span className="text-gray-400 text-sm">({items.length})</span></h2>
          <div className="space-y-2">
            {items.map(f => (
              <div key={f.signature} className={`rounded-lg border border-gray-200 p-3 flex items-start justify-between gap-3 ${SEV[f.severity]?.c || ''}`}>
                <div><div className="font-medium">{SEV[f.severity]?.l} {f.title}</div><div className="text-sm opacity-80">{f.detail}</div>{f.tx_ids?.length ? <div className="text-xs opacity-60">tx: {f.tx_ids.join(', ')}</div> : null}</div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => ack(f.signature, 'accepted')} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">Приеми</button>
                  <button onClick={() => ack(f.signature, 'ignored')} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">Игнорирай</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {busy && <div className="text-gray-400 text-sm">…</div>}
    </div>
  )
}
```

> Quick-fix buttons (`[Поправи ▾]`) reuse existing endpoints; start with accept/ignore + tx links, add per-fix actions incrementally (out of scope for MVP task; can be a follow-up). `rent_channel` quick-set may be added on `active_no_rent` findings as a `<select>` calling `PATCH /api/properties/:id/rent-channel`.

**Step 2: Wire the tab in `App.jsx`**

Add to the view registry/nav (admin/broker only, matching how other tabs gate). Add nav button `🩺 Интегритет` and render `<Integrity />` for the matching view key. Follow the existing tab pattern exactly.

**Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: `✓ built in …` with no errors.

**Step 4: Commit**

```bash
git add frontend/src/components/Integrity.jsx frontend/src/App.jsx
git commit -m "feat(integrity): admin Integrity dashboard tab"
```

---

### Task 5: Import-time flags in `Import.jsx`

**Files:**
- Modify: `frontend/src/components/Import.jsx` (after `/parse` preview, before `/save`)

**Step 1: Call check-batch on the staged rows**

After the parsed rows are in state (the preview list), add an effect/handler that POSTs the staged rows to `/api/integrity/check-batch` and stores `byRow` (keyed by `new<index>`). Render a 🟠 badge with the warning titles next to any flagged preview row.

```jsx
// after rows are parsed into `rows` state:
const [warn, setWarn] = useState({})
useEffect(() => {
  if (!rows?.length) { setWarn({}); return }
  apiFetch(`${API}/api/integrity/check-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: rows.map(r => ({ дата: r.дата, сума: r.сума, currency: r.currency, operation: r.operation, категория: r.категория, property_id: r.property_id, месец: r.месец, контрагент: r.контрагент, основание: r.основание })) }) })
    .then(r => r.json()).then(d => setWarn(d.byRow || {})).catch(() => {})
}, [rows])
// in the row render, index i:
// {warn['new'+i]?.length ? <span title={warn['new'+i].map(w=>w.title).join('; ')} className="text-amber-600">🟠</span> : null}
```

(Adapt key names to Import.jsx's actual row field names; map the `new<index>` keys to the preview list order.)

**Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: success.

**Step 3: Commit**

```bash
git add frontend/src/components/Import.jsx
git commit -m "feat(integrity): import-time flags on staged rows"
```

---

### Task 6: Final verification + PR

**Step 1: Re-run the core test**

Run: `node backend/scripts/test_integrity.js`
Expected: `✓ all integrity checks pass`.

**Step 2: Full frontend build**

Run: `cd frontend && npm run build` → success.

**Step 3: Push + open PR (user merges)**

```bash
git push -u origin feature/data-integrity
```
Then provide the PR URL. After merge + Railway deploy: smoke-test `GET /api/integrity` against prod and confirm summary matches the audit (minus refined false-positives).

---

## Post-merge smoke test (prod)

```
GET /api/integrity            → summary; expect deposit_mix to EXCLUDE Деница (id4676/4697/4719) + id4818
POST /api/integrity/ack       → accept one period_gap; re-GET → it disappears
PATCH /api/properties/5/rent-channel {other} → re-GET → ID5 active_no_rent disappears
```
