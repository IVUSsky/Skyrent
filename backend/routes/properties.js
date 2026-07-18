const express = require('express');
const { orgContext } = require('../db/db');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { optimizeMany } = require('../lib/imageOptimize');
const { imagesOnly } = require('../lib/uploadFilter');
const { renovationByProperty } = require('../lib/renovationCosts');

const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, '../data');
const PHOTOS_DIR = path.join(DATA_DIR, 'property_photos');
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PHOTOS_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `prop_${req.params.id}_${Date.now()}${ext}`);
  },
});
const uploadPhoto = multer({ storage: photoStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imagesOnly });

// Финансови полета, скрити от роля „брокер" (недоверен лизинг агент). Той
// управлява описателните данни/обяви/наематели, но не вижда икономиката.
const BROKER_HIDDEN_FIELDS = ['покупна', 'ремонт', 'ремонт_фактури', 'market_val', 'owner_id'];
const isBroker = (req) => req.user?.role === 'broker';
const stripForBroker = (req, row) => {
  if (!isBroker(req) || !row) return row;
  const r = { ...row };
  for (const k of BROKER_HIDDEN_FIELDS) delete r[k];
  return r;
};

module.exports = function(db) {
  const router = express.Router();

  // ── Запитвания от публичния каталог (lead-ове) ─── ПРЕДИ /:id route-овете ──
  router.get('/inquiries', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT i.*, p.адрес AS property_address
        FROM listing_inquiries i LEFT JOIN properties p ON p.id = i.property_id
        ORDER BY i.handled ASC, i.created_at DESC
      `).all();
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.patch('/inquiries/:id', (req, res) => {
    try {
      db.prepare('UPDATE listing_inquiries SET handled=? WHERE id=?').run(req.body.handled ? 1 : 0, req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.delete('/inquiries/:id', (req, res) => {
    try { db.prepare('DELETE FROM listing_inquiries WHERE id=?').run(req.params.id); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM properties ORDER BY id').all();
    // Ремонтни фактури по имот — допълват колоната 'ремонт' в калкулациите
    const reno = renovationByProperty(db);
    const withReno = rows.map(r => ({ ...r, ремонт_фактури: reno[r.id] || 0 }));
    res.json(isBroker(req) ? withReno.map(r => stripForBroker(req, r)) : withReno);
  });

  // Обединяване на дубликати: source (премахва се) → target (запазва се).
  // Празните полета на target се допълват от source; всички връзки (актове,
  // договори, история, снимки, транзакции...) се преместват към target; source
  // се изтрива. Admin-only (обединяването е разрушително).
  router.post('/merge', (req, res) => {
    if (isBroker(req)) return res.status(403).json({ error: 'Само администратор може да обединява имоти' });
    try {
      const sourceId = Number(req.body.source_id), targetId = Number(req.body.target_id);
      if (!sourceId || !targetId || sourceId === targetId) return res.status(400).json({ error: 'Избери два различни имота' });
      const source = db.prepare('SELECT * FROM properties WHERE id=?').get(sourceId);
      const target = db.prepare('SELECT * FROM properties WHERE id=?').get(targetId);
      if (!source || !target) return res.status(404).json({ error: 'Имот не е намерен' });

      // 1) Допълни празните описателни полета на target от source
      const isEmpty = v => v === null || v === undefined || v === '' || v === 0;
      const COPYABLE = ['площ', 'тип', 'cadastral_id', 'район', 'адрес', 'наемател', 'абонат_ток', 'абонат_вода', 'абонат_тец', 'абонат_вход', 'абонат_газ', 'email', 'телефон'];
      const sets = [], vals = [], copied = [];
      for (const k of COPYABLE) {
        if (isEmpty(target[k]) && !isEmpty(source[k])) { sets.push(`"${k}"=?`); vals.push(source[k]); copied.push(k); }
      }
      if (sets.length) { vals.push(targetId); db.prepare(`UPDATE properties SET ${sets.join(',')} WHERE id=?`).run(...vals); }

      // 2) Премести всички връзки: всяка таблица с колона property_id
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('properties','sqlite_sequence')").all();
      const repointed = [];
      for (const t of tables) {
        const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all();
        if (!cols.some(c => c.name === 'property_id')) continue;
        try {
          const r = db.prepare(`UPDATE "${t.name}" SET property_id=? WHERE property_id=?`).run(targetId, sourceId);
          if (r.changes) repointed.push(`${t.name}:${r.changes}`);
        } catch (_) {
          // UNIQUE конфликт (target вече има реда) → премахни дубликата от source
          try { db.prepare(`DELETE FROM "${t.name}" WHERE property_id=?`).run(sourceId); } catch (_) {}
        }
      }

      // 3) Изтрий дубликата
      db.prepare('DELETE FROM properties WHERE id=?').run(sourceId);

      res.json({ ok: true, merged_into: targetId, copied_fields: copied, repointed });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Изтриване на имот + всичките му свързани данни (снимки, история, актове,
  // транзакции...). Admin-only (разрушително — брокерът няма достъп).
  router.delete('/:id', (req, res) => {
    if (isBroker(req)) return res.status(403).json({ error: 'Само администратор може да трие имоти' });
    try {
      const id = Number(req.params.id);
      const p = db.prepare('SELECT id FROM properties WHERE id=?').get(id);
      if (!p) return res.status(404).json({ error: 'Имотът не е намерен' });
      // Изчисти свързаните редове (всяка таблица с колона property_id)
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('properties','sqlite_sequence')").all();
      const removed = [];
      for (const t of tables) {
        const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all();
        if (!cols.some(c => c.name === 'property_id')) continue;
        try { const r = db.prepare(`DELETE FROM "${t.name}" WHERE property_id=?`).run(id); if (r.changes) removed.push(`${t.name}:${r.changes}`); } catch (_) {}
      }
      db.prepare('DELETE FROM properties WHERE id=?').run(id);
      res.json({ ok: true, deleted: id, removed });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Rent payment status for a given month
  router.get('/rent-status', (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const props = db.prepare(
      `SELECT * FROM properties WHERE статус = '✅' AND наемател IS NOT NULL AND наемател != '' ORDER BY адрес`
    ).all();

    // Bank-imported payments — aggregate + per-tx detail
    const bankPaid = db.prepare(
      `SELECT property_id,
              SUM(CASE WHEN UPPER(COALESCE(currency,'BGN'))='BGN' THEN сума/1.95583 ELSE сума END) as paid_amount,
              COUNT(*) as tx_count
       FROM transactions WHERE категория = 'наем' AND operation = 'Кт' AND месец = ?
       GROUP BY property_id`
    ).all(month);
    const bankMap = {};
    bankPaid.forEach(p => { bankMap[p.property_id] = p; });

    const bankTxRows = db.prepare(
      `SELECT id, property_id, дата, сума, контрагент
       FROM transactions
       WHERE категория = 'наем' AND месец = ? AND property_id IS NOT NULL
       ORDER BY дата ASC`
    ).all(month);
    const bankTxMap = {};
    bankTxRows.forEach(t => {
      (bankTxMap[t.property_id] = bankTxMap[t.property_id] || []).push({
        id: t.id, дата: t.дата, сума: t.сума, контрагент: t.контрагент,
      });
    });

    // Manual payments (cash / other bank)
    const manualPaid = db.prepare(
      `SELECT property_id, amount, payment_type, notes
       FROM manual_rent_payments WHERE month = ?`
    ).all(month);
    const manualMap = {};
    manualPaid.forEach(p => { manualMap[p.property_id] = p; });

    // Cumulative покритие (предплащане): платено до месеца vs дължим наем от началото.
    const cumRows = db.prepare(
      `SELECT property_id, SUM(CASE WHEN UPPER(COALESCE(currency,'BGN'))='BGN' THEN сума/1.95583 ELSE сума END) as paid
       FROM transactions WHERE категория='наем' AND operation='Кт' AND property_id IS NOT NULL
         AND COALESCE(месец,'') != '' AND месец <= ? GROUP BY property_id`
    ).all(month);
    const cumMap = {};
    cumRows.forEach(r => { cumMap[r.property_id] = r.paid; });
    db.prepare(`SELECT property_id, SUM(amount) as paid FROM manual_rent_payments WHERE month <= ? GROUP BY property_id`)
      .all(month).forEach(r => { cumMap[r.property_id] = (cumMap[r.property_id] || 0) + r.paid; });
    const startMap = {};
    db.prepare(`SELECT property_id, MIN(месец) as start FROM transactions
                WHERE категория='наем' AND operation='Кт' AND property_id IS NOT NULL AND COALESCE(месец,'') != ''
                GROUP BY property_id`).all().forEach(r => { startMap[r.property_id] = r.start; });
    const monthsIncl = (s, e) => { if (!s || !e || s > e) return 0; const [ys, ms] = s.split('-').map(Number), [ye, me] = e.split('-').map(Number); return (ye - ys) * 12 + (me - ms) + 1; };

    const result = props.map(p => {
      const bank   = bankMap[p.id];
      const manual = manualMap[p.id];
      const paid_amount = (bank ? bank.paid_amount : 0) + (manual ? manual.amount : 0);
      const rent = Number(p.наем) || 0;
      const due = rent > 0 ? monthsIncl(startMap[p.id], month) * rent : 0;
      const prepaid_covered = due > 0 && (cumMap[p.id] || 0) + 0.5 >= due;
      return {
        ...p,
        paid_amount,
        tx_count:      bank   ? bank.tx_count      : 0,
        bank_txs:      bankTxMap[p.id] || [],
        is_paid:       !!(bank || manual || prepaid_covered),
        prepaid:       !bank && !manual && prepaid_covered,
        manual_payment: manual || null,
      };
    });

    res.json({ month, properties: result });
  });

  // Rent diagnostics — възможни проблеми за избран месец
  router.get('/rent-diagnostics', (req, res) => {
    try {
      const month = req.query.month || new Date().toISOString().slice(0, 7);
      // Previous month string (YYYY-MM)
      const [y, m] = month.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

      const activeProps = db.prepare(
        `SELECT id, адрес, наем, наемател FROM properties
         WHERE статус = '✅' AND наемател IS NOT NULL AND наемател != ''`
      ).all();
      const propMap = {};
      activeProps.forEach(p => { propMap[p.id] = p; });

      // 1. Duplicates — ≥2 'наем' txs same property + month
      const dupRows = db.prepare(
        `SELECT property_id, COUNT(*) as cnt,
                SUM(CASE WHEN UPPER(COALESCE(currency,'BGN'))='BGN' THEN сума/1.95583 ELSE сума END) as total
         FROM transactions
         WHERE категория = 'наем' AND operation = 'Кт' AND месец = ? AND property_id IS NOT NULL
         GROUP BY property_id
         HAVING cnt >= 2`
      ).all(month);
      const dupTxsStmt = db.prepare(
        `SELECT id, дата, сума, контрагент, основание FROM transactions
         WHERE категория = 'наем' AND месец = ? AND property_id = ?
         ORDER BY дата ASC`
      );
      const duplicates = dupRows.map(r => {
        const prop = propMap[r.property_id];
        if (!prop) return null;
        return {
          property_id: r.property_id,
          адрес: prop.адрес,
          наемател: prop.наемател,
          expected: prop.наем,
          total: r.total,
          tx_count: r.cnt,
          over_expected: r.total > (prop.наем || 0) * 1.05,
          txs: dupTxsStmt.all(month, r.property_id),
        };
      }).filter(Boolean);

      // 2. Prepaid — unpaid this month, but has rent tx in PREVIOUS month matching expected amount
      const paidThisMonth = new Set(db.prepare(
        `SELECT DISTINCT property_id FROM transactions
         WHERE категория = 'наем' AND месец = ? AND property_id IS NOT NULL`
      ).all(month).map(r => r.property_id));
      const manualThisMonth = new Set(db.prepare(
        `SELECT property_id FROM manual_rent_payments WHERE month = ?`
      ).all(month).map(r => r.property_id));

      const prevTxs = db.prepare(
        `SELECT id, property_id, дата, сума, контрагент FROM transactions
         WHERE категория = 'наем' AND месец = ? AND property_id IS NOT NULL`
      ).all(prevMonth);

      const prepaid = [];
      for (const tx of prevTxs) {
        if (paidThisMonth.has(tx.property_id) || manualThisMonth.has(tx.property_id)) continue;
        const prop = propMap[tx.property_id];
        if (!prop) continue;
        const expected = prop.наем || 0;
        if (expected <= 0) continue;
        const diffPct = Math.abs(tx.сума - expected) / expected;
        if (diffPct <= 0.1) {
          prepaid.push({
            property_id: tx.property_id,
            адрес: prop.адрес,
            наемател: prop.наемател,
            expected,
            tx_id: tx.id, дата: tx.дата, сума: tx.сума, контрагент: tx.контрагент,
          });
        }
      }

      // 3. Unassigned 'наем' txs (no property_id) for the month
      const unassigned = db.prepare(
        `SELECT id, дата, сума, контрагент, основание FROM transactions
         WHERE категория = 'наем' AND месец = ? AND (property_id IS NULL)
         ORDER BY дата ASC`
      ).all(month);

      // 4. Mis-categorized — Кт tx categorized as приход_друг/друго from a counterparty whose name matches an active tenant
      const otherCredits = db.prepare(
        `SELECT id, дата, сума, контрагент, основание, категория FROM transactions
         WHERE operation = 'Кт' AND категория IN ('приход_друг','друго')
           AND месец = ? AND контрагент IS NOT NULL AND контрагент != ''`
      ).all(month);
      const tenantNames = activeProps
        .map(p => ({ id: p.id, адрес: p.адрес, name: (p.наемател || '').trim().toLowerCase() }))
        .filter(t => t.name.length >= 3);
      const miscategorized = [];
      for (const tx of otherCredits) {
        const kont = tx.контрагент.toLowerCase();
        const hit = tenantNames.find(t => kont.includes(t.name) || t.name.includes(kont));
        if (hit) miscategorized.push({
          tx_id: tx.id, дата: tx.дата, сума: tx.сума, контрагент: tx.контрагент,
          основание: tx.основание, категория: tx.категория,
          suggest_property_id: hit.id, suggest_адрес: hit.адрес,
        });
      }

      res.json({
        month, prevMonth,
        duplicates, prepaid, unassigned, miscategorized,
        summary: {
          duplicates_count: duplicates.length,
          prepaid_count: prepaid.length,
          unassigned_count: unassigned.length,
          miscategorized_count: miscategorized.length,
        },
      });
    } catch (err) {
      console.error('rent-diagnostics error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Rent matrix — годишен преглед: ред=имот × колона=месец
  router.get('/rent-matrix', (req, res) => {
    try {
      const year = String(req.query.year || new Date().getFullYear());
      const monthFrom = `${year}-01`;
      const monthTo   = `${year}-12`;

      const props = db.prepare(
        `SELECT id, адрес, район, наемател, наем
         FROM properties
         WHERE статус = '✅' AND наемател IS NOT NULL AND наемател != ''
         ORDER BY адрес`
      ).all();

      const bank = db.prepare(
        `SELECT property_id, месец,
                SUM(CASE WHEN UPPER(COALESCE(currency,'BGN'))='BGN' THEN сума/1.95583 ELSE сума END) as paid_amount,
                COUNT(*) as tx_count
         FROM transactions
         WHERE категория = 'наем' AND operation = 'Кт' AND property_id IS NOT NULL
           AND месец >= ? AND месец <= ?
         GROUP BY property_id, месец`
      ).all(monthFrom, monthTo);

      const manual = db.prepare(
        `SELECT property_id, month, amount, payment_type
         FROM manual_rent_payments
         WHERE month >= ? AND month <= ?`
      ).all(monthFrom, monthTo);

      // Index: key = `${property_id}-${YYYY-MM}`
      const cellMap = {};
      for (const r of bank) {
        cellMap[`${r.property_id}-${r.месец}`] = {
          bank_amount: r.paid_amount, tx_count: r.tx_count, manual_amount: 0,
        };
      }
      for (const r of manual) {
        const key = `${r.property_id}-${r.month}`;
        if (!cellMap[key]) cellMap[key] = { bank_amount: 0, tx_count: 0, manual_amount: 0 };
        cellMap[key].manual_amount = r.amount;
        cellMap[key].manual_type   = r.payment_type;
      }

      // Предплатен излишък от ПРЕДИ годината — за коректно пренасяне (напр. голяма
      // вноска в декември, покриваща следващи месеци). Само излишъкът се пренася.
      const beforeRows = db.prepare(
        `SELECT property_id,
                SUM(CASE WHEN UPPER(COALESCE(currency,'BGN'))='BGN' THEN сума/1.95583 ELSE сума END) as paid,
                MIN(месец) as start
         FROM transactions
         WHERE категория = 'наем' AND operation = 'Кт' AND property_id IS NOT NULL
           AND COALESCE(месец,'') != '' AND месец < ?
         GROUP BY property_id`
      ).all(monthFrom);
      const beforeMap = {};
      beforeRows.forEach(r => { beforeMap[r.property_id] = r; });
      const monthsInclusive = (start, end) => {
        if (!start || !end || start > end) return 0;
        const [ys, ms] = start.split('-').map(Number);
        const [ye, me] = end.split('-').map(Number);
        return (ye - ys) * 12 + (me - ms) + 1;
      };
      const prevDec = `${Number(year) - 1}-12`;

      // Build matrix — с „преходящ баланс": надплатеното покрива автоматично
      // следващите месеци (предплащане), без ръчно разпределяне.
      const now = new Date();
      const curYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const properties = props.map(p => {
        const rent = Number(p.наем) || 0;
        // начален кредит = излишък отпреди годината
        let credit = 0;
        const before = beforeMap[p.id];
        if (before && before.paid > 0 && rent > 0) {
          const dueBefore = monthsInclusive(before.start, prevDec) * rent;
          credit = Math.max(0, before.paid - dueBefore);
        }
        const cells = [];
        for (let m = 1; m <= 12; m++) {
          const ym = `${year}-${String(m).padStart(2, '0')}`;
          const cell = cellMap[`${p.id}-${ym}`];
          const paid_amount = cell ? (cell.bank_amount || 0) + (cell.manual_amount || 0) : 0;
          const is_future = ym > curYM;
          let is_paid = false, prepaid = false;
          if (!is_future) {
            if (rent > 0) {
              credit += paid_amount;
              if (credit + 0.5 >= rent) { is_paid = true; prepaid = paid_amount < rent - 0.5; credit -= rent; }
            } else {
              is_paid = paid_amount > 0; // няма зададен наем → fallback по наличие
            }
          }
          cells.push({
            месец: ym, paid_amount, tx_count: cell?.tx_count || 0,
            is_paid, prepaid, manual: !!cell?.manual_amount, is_future,
          });
        }
        const collected = cells.reduce((s, c) => s + c.paid_amount, 0);
        const monthsActive = cells.filter(c => !c.is_future).length;
        const expected = rent * monthsActive;
        return {
          id: p.id, адрес: p.адрес, район: p.район, наемател: p.наемател, наем: p.наем,
          cells, collected, expected,
          paid_months:   cells.filter(c => c.is_paid && !c.is_future).length,
          unpaid_months: cells.filter(c => !c.is_paid && !c.is_future).length,
        };
      });

      const totalExpected  = properties.reduce((s, p) => s + p.expected, 0);
      const totalCollected = properties.reduce((s, p) => s + p.collected, 0);
      const totalUnpaidCells = properties.reduce((s, p) => s + p.unpaid_months, 0);

      res.json({
        year: Number(year),
        currentMonth: curYM,
        properties,
        summary: {
          totalExpected,
          totalCollected,
          totalUnpaidCells,
          collectibility: totalExpected > 0 ? totalCollected / totalExpected : 0,
        },
      });
    } catch (err) {
      console.error('rent-matrix error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Mark rent as paid manually
  router.post('/:id/mark-paid', (req, res) => {
    try {
      const { month, amount, payment_type, notes } = req.body;
      if (!month) return res.status(400).json({ error: 'month е задължителен' });
      db.prepare(`
        INSERT INTO manual_rent_payments (property_id, month, amount, payment_type, notes)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(property_id, month) DO UPDATE SET amount=excluded.amount, payment_type=excluded.payment_type, notes=excluded.notes
      `).run(req.params.id, month, Number(amount) || 0, payment_type || 'брой', notes || null);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Unmark manual rent payment
  router.delete('/:id/mark-paid', (req, res) => {
    const month = req.query.month;
    if (!month) return res.status(400).json({ error: 'month е задължителен' });
    db.prepare('DELETE FROM manual_rent_payments WHERE property_id = ? AND month = ?').run(req.params.id, month);
    res.json({ ok: true });
  });

  router.post('/', (req, res) => {
    try {
      // Брокер не може да задава финансови полета → падат на default (0/null)
      if (isBroker(req)) for (const k of BROKER_HIDDEN_FIELDS) delete req.body[k];
      const { адрес, район, статус, наем, наемател, площ, тип, покупна, ремонт, market_val, email, телефон, owner_id } = req.body;
      if (!адрес) return res.status(400).json({ error: 'адрес е задължителен' });
      const r = db.prepare(`
        INSERT INTO properties (адрес, район, статус, наем, наемател, площ, тип, покупна, ремонт, market_val, email, телефон, owner_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        адрес, район || '', статус || '✅',
        Number(наем) || 0, наемател || '',
        площ ? Number(площ) : null, тип || 'друго',
        Number(покупна) || 0, Number(ремонт) || 0,
        market_val ? Number(market_val) : null,
        email || null, телефон || null,
        owner_id ? Number(owner_id) : null
      );
      const created = db.prepare('SELECT * FROM properties WHERE id = ?').get(r.lastInsertRowid);
      res.status(201).json(stripForBroker(req, created));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', (req, res) => {
    try {
      // Брокер не може да променя финансови полета → запазват текущите стойности
      if (isBroker(req)) for (const k of BROKER_HIDDEN_FIELDS) delete req.body[k];
      console.log('PUT body:', JSON.stringify(req.body));
      const cols = db.prepare('PRAGMA table_info(properties)').all();
      console.log('Columns:', cols.map(c => c.name));

      const id = parseInt(req.params.id);
      const body = req.body;

      // Вземи текущия запис първо
      const current = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
      if (!current) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Merge - ако ново поле липсва, пази старото
      const адрес      = body.адрес      !== undefined ? body.адрес      : current.адрес;
      const район      = body.район      !== undefined ? body.район      : current.район;
      const наем       = body.наем       !== undefined ? body.наем       : current.наем;
      const наемател   = body.наемател   !== undefined ? body.наемател   : current.наемател;
      const статус     = body.статус     !== undefined ? body.статус     : current.статус;
      const market_val = body.market_val !== undefined ? body.market_val : current.market_val;
      const тип        = body.тип        !== undefined ? body.тип        : current.тип;
      const площ       = body.площ       !== undefined ? body.площ       : current.площ;
      const покупна    = body.покупна    !== undefined ? body.покупна    : current.покупна;
      const ремонт     = body.ремонт     !== undefined ? body.ремонт     : current.ремонт;
      const email              = body.email              !== undefined ? body.email              : current.email;
      const телефон            = body.телефон            !== undefined ? body.телефон            : current.телефон;
      const invoice_enabled    = body.invoice_enabled    !== undefined ? body.invoice_enabled    : current.invoice_enabled;
      const invoice_recipient  = body.invoice_recipient  !== undefined ? body.invoice_recipient  : current.invoice_recipient;
      const vat_exempt         = body.vat_exempt         !== undefined ? body.vat_exempt         : current.vat_exempt;
      const stripe_enabled     = body.stripe_enabled     !== undefined ? (body.stripe_enabled ? 1 : 0) : (current.stripe_enabled ?? 1);
      const абонат_ток  = body.абонат_ток  !== undefined ? body.абонат_ток  : current.абонат_ток;
      const абонат_вода = body.абонат_вода !== undefined ? body.абонат_вода : current.абонат_вода;
      const абонат_тец  = body.абонат_тец  !== undefined ? body.абонат_тец  : current.абонат_тец;
      const абонат_вход = body.абонат_вход !== undefined ? body.абонат_вход : current.абонат_вход;
      const абонат_газ  = body.абонат_газ  !== undefined ? body.абонат_газ  : current.абонат_газ;
      const owner_id   = body.owner_id   !== undefined ? (body.owner_id ? Number(body.owner_id) : null) : current.owner_id;

      db.prepare(`
        UPDATE properties
        SET адрес=?, район=?, наем=?, наемател=?, статус=?, market_val=?, тип=?, площ=?, покупна=?, ремонт=?,
            email=?, телефон=?, invoice_enabled=?, invoice_recipient=?, vat_exempt=?, stripe_enabled=?,
            абонат_ток=?, абонат_вода=?, абонат_тец=?, абонат_вход=?, абонат_газ=?, owner_id=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(адрес, район, наем, наемател, статус, market_val, тип, площ, покупна, ремонт, email, телефон, invoice_enabled, invoice_recipient, vat_exempt, stripe_enabled, абонат_ток, абонат_вода, абонат_тец, абонат_вход, абонат_газ, owner_id, id);

      const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
      console.log('Saved тип:', updated.тип, '| покупна:', updated.покупна, '| ремонт:', updated.ремонт);

      res.json({ success: true, property: stripForBroker(req, updated) });
    } catch (err) {
      console.error('PUT error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Tenant history ────────────────────────────────────────────
  router.get('/:id/tenants', (req, res) => {
    const rows = db.prepare('SELECT * FROM tenant_history WHERE property_id = ? ORDER BY start_date DESC').all(req.params.id);
    res.json(rows);
  });

  router.post('/:id/tenants', (req, res) => {
    const { tenant_name, start_date, end_date, monthly_rent, deposit, conditions, notes } = req.body;
    if (!tenant_name) return res.status(400).json({ error: 'tenant_name е задължително' });
    // Auto-close previous open lease
    db.prepare("UPDATE tenant_history SET end_date = ? WHERE property_id = ? AND (end_date IS NULL OR end_date = '') AND id != -1")
      .run(start_date || new Date().toISOString().slice(0,10), req.params.id);
    const r = db.prepare(`
      INSERT INTO tenant_history (property_id, tenant_name, start_date, end_date, monthly_rent, deposit, conditions, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, tenant_name, start_date||null, end_date||null, Number(monthly_rent)||0, Number(deposit)||0, conditions||null, notes||null);
    // Also update current tenant in properties table
    db.prepare("UPDATE properties SET наемател=?, наем=? WHERE id=?").run(tenant_name, Number(monthly_rent)||0, req.params.id);
    res.status(201).json({ id: r.lastInsertRowid });
  });

  router.put('/tenants/:tid', (req, res) => {
    const { tenant_name, start_date, end_date, monthly_rent, deposit, conditions, notes } = req.body;
    db.prepare(`UPDATE tenant_history SET tenant_name=?, start_date=?, end_date=?, monthly_rent=?, deposit=?, conditions=?, notes=? WHERE id=?`)
      .run(tenant_name, start_date||null, end_date||null, Number(monthly_rent)||0, Number(deposit)||0, conditions||null, notes||null, req.params.tid);
    res.json({ ok: true });
  });

  router.delete('/tenants/:tid', (req, res) => {
    db.prepare('DELETE FROM tenant_history WHERE id = ?').run(req.params.tid);
    res.json({ ok: true });
  });

  // ── Monthly history per property ──────────────────────────────
  router.get('/:id/monthly', (req, res) => {
    const id = req.params.id;
    // Нормализираме всичко в EUR (фиксиран курс 1.95583). Сумите в transactions
    // и expense_invoices са в native валута (BGN преди EUR прехода, но някои
    // акаунти остават BGN-деноминирани и в 2026). Без конверсия BGN стойностите
    // изглеждат ~2× когато се показват с € етикет. + само Кт за наем (приход).
    const rentRows = db.prepare(`
      SELECT месец,
             SUM(CASE WHEN UPPER(COALESCE(currency,'BGN'))='BGN' THEN сума/1.95583 ELSE сума END) as наем_total,
             COUNT(*) as tx_count
      FROM transactions
      WHERE property_id = ? AND категория = 'наем' AND operation = 'Кт' AND месец IS NOT NULL
      GROUP BY месец ORDER BY месец
    `).all(id);

    const expRows = db.prepare(`
      SELECT месец,
             SUM(CASE WHEN UPPER(COALESCE(currency,'BGN'))='BGN' THEN amount/1.95583 ELSE amount END) as expense_total,
             COUNT(*) as exp_count
      FROM expense_invoices
      WHERE property_id = ? AND месец IS NOT NULL
      GROUP BY месец ORDER BY месец
    `).all(id);

    // Merge by month
    const monthMap = {};
    rentRows.forEach(r => {
      monthMap[r.месец] = { месец: r.месец, наем: r.наем_total || 0, разходи: 0 };
    });
    expRows.forEach(r => {
      if (!monthMap[r.месец]) monthMap[r.месец] = { месец: r.месец, наем: 0, разходи: 0 };
      monthMap[r.месец].разходи = r.expense_total || 0;
    });

    const result = Object.values(monthMap).sort((a, b) => a.месец.localeCompare(b.месец));
    res.json(result);
  });

  // ── Property photos ───────────────────────────────────────────
  router.get('/:id/photos', (req, res) => {
    const rows = db.prepare('SELECT * FROM property_photos WHERE property_id=? ORDER BY created_at').all(req.params.id);
    res.json(rows);
  });

  // Публикуване в каталога (toggle + описание)
  router.patch('/:id/publish', (req, res) => {
    try {
      const cur = db.prepare('SELECT id, listing_desc, listing_video FROM properties WHERE id=?').get(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Not found' });
      const published = req.body.published ? 1 : 0;
      const desc = req.body.listing_desc !== undefined ? req.body.listing_desc : cur.listing_desc;
      const video = req.body.listing_video !== undefined ? (req.body.listing_video || null) : cur.listing_video;
      db.prepare('UPDATE properties SET published=?, listing_desc=?, listing_video=? WHERE id=?')
        .run(published, desc, video, req.params.id);
      res.json({ ok: true, published });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/photos', uploadPhoto.array('photos', 20), orgContext, async (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Няма файлове' });
    // Компресирай/resize преди запис — спестява място (телефонни снимки ~2.5MB→~0.3MB)
    await optimizeMany(req.files.map(f => f.path));
    const inserted = req.files.map(f => {
      const caption = req.body.caption || '';
      const r = db.prepare('INSERT INTO property_photos (property_id, filename, caption) VALUES (?,?,?)').run(req.params.id, f.filename, caption);
      return { id: r.lastInsertRowid, filename: f.filename, caption };
    });
    res.status(201).json(inserted);
  });

  router.patch('/:id/photos/:photoId', (req, res) => {
    db.prepare('UPDATE property_photos SET caption=? WHERE id=? AND property_id=?').run(req.body.caption || '', req.params.photoId, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id/photos/:photoId', (req, res) => {
    const row = db.prepare('SELECT filename FROM property_photos WHERE id=? AND property_id=?').get(req.params.photoId, req.params.id);
    if (row) {
      const fp = path.join(PHOTOS_DIR, row.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      db.prepare('DELETE FROM property_photos WHERE id=?').run(req.params.photoId);
    }
    res.json({ ok: true });
  });

  // Serve photo file
  router.get('/:id/photos/:photoId/file', (req, res) => {
    const row = db.prepare('SELECT filename FROM property_photos WHERE id=? AND property_id=?').get(req.params.photoId, req.params.id);
    if (!row) return res.status(404).end();
    res.sendFile(path.join(PHOTOS_DIR, row.filename));
  });

  // ── Apartment knowledge base (Phase 1: AI tenant chat agent) ──
  // Admin/broker only — tenants cannot see or edit raw knowledge here
  // (Tenant access happens via the chat agent in Phase 2.)
  router.get('/:id/knowledge', (req, res) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Само за администратори' });
    const row = db.prepare('SELECT * FROM apartment_knowledge WHERE property_id = ?').get(req.params.id);
    if (!row) {
      return res.json({
        property_id: Number(req.params.id),
        wifi_ssid: '', wifi_password: '',
        internet_provider: '', internet_account: '',
        building_info: '', payment_instructions: '', free_faq: '',
        appliances: [], contacts: [],
        updated_at: null,
      });
    }
    let appliances = [];
    let contacts   = [];
    try { appliances = JSON.parse(row.appliances_json || '[]'); } catch(_) {}
    try { contacts   = JSON.parse(row.contacts_json   || '[]'); } catch(_) {}
    res.json({
      property_id: row.property_id,
      wifi_ssid: row.wifi_ssid || '',
      wifi_password: row.wifi_password || '',
      internet_provider: row.internet_provider || '',
      internet_account: row.internet_account || '',
      building_info: row.building_info || '',
      payment_instructions: row.payment_instructions || '',
      free_faq: row.free_faq || '',
      appliances,
      contacts,
      updated_at: row.updated_at,
    });
  });

  router.put('/:id/knowledge', (req, res) => {
    try {
      if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Само за администратори' });
      const propId = Number(req.params.id);
      const exists = db.prepare('SELECT id FROM properties WHERE id = ?').get(propId);
      if (!exists) return res.status(404).json({ error: 'Имотът не съществува' });

      const b = req.body || {};
      const wifi_ssid            = b.wifi_ssid            || '';
      const wifi_password        = b.wifi_password        || '';
      const internet_provider    = b.internet_provider    || '';
      const internet_account     = b.internet_account     || '';
      const building_info        = b.building_info        || '';
      const payment_instructions = b.payment_instructions || '';
      const free_faq             = b.free_faq             || '';
      const appliances_json      = JSON.stringify(Array.isArray(b.appliances) ? b.appliances : []);
      const contacts_json        = JSON.stringify(Array.isArray(b.contacts)   ? b.contacts   : []);

      const existing = db.prepare('SELECT id FROM apartment_knowledge WHERE property_id = ?').get(propId);
      if (existing) {
        db.prepare(`
          UPDATE apartment_knowledge
          SET wifi_ssid=?, wifi_password=?, internet_provider=?, internet_account=?,
              building_info=?, payment_instructions=?, free_faq=?,
              appliances_json=?, contacts_json=?,
              updated_at=CURRENT_TIMESTAMP
          WHERE property_id=?
        `).run(wifi_ssid, wifi_password, internet_provider, internet_account,
               building_info, payment_instructions, free_faq,
               appliances_json, contacts_json, propId);
      } else {
        db.prepare(`
          INSERT INTO apartment_knowledge
            (property_id, wifi_ssid, wifi_password, internet_provider, internet_account,
             building_info, payment_instructions, free_faq, appliances_json, contacts_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(propId, wifi_ssid, wifi_password, internet_provider, internet_account,
               building_info, payment_instructions, free_faq, appliances_json, contacts_json);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('PUT knowledge error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /:id/rent-channel — как се проследява наемът (this|other|cash).
  // 'other'/'cash' потискат integrity проверките active_no_rent + period_gap.
  router.patch('/:id/rent-channel', (req, res) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Forbidden' });
    const ch = req.body?.rent_channel;
    if (!['this', 'other', 'cash'].includes(ch)) return res.status(400).json({ error: 'rent_channel: this|other|cash' });
    db.prepare('UPDATE properties SET rent_channel=? WHERE id=?').run(ch, req.params.id);
    res.json({ ok: true });
  });

  return router;
};
