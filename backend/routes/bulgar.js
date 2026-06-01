// /api/investments/bulgar — Bulgar Capital дялов фонд.
//
// Позиция = един влог (главница + годишна доходност + период на дивиденти).
// Транзакции по позиция: влог / теглене / дивидент / такса.
// Дивидентите се изплащат в кеш → допълнително се записват в personal_income
// (тип 'лихва_болгар') за да се появят в личния бюджет.

const express = require('express');

const BGN_EUR_RATE = 1.95583;
const TX_TYPES = ['влог', 'теглене', 'дивидент', 'такса'];

module.exports = function(db) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Само за администратори' });
    next();
  });

  function toEur(amount, currency) {
    return currency === 'BGN' ? amount / BGN_EUR_RATE : amount;
  }

  function computePositionState(pos) {
    const txs = db.prepare(`
      SELECT * FROM bulgar_transactions
      WHERE position_id = ?
      ORDER BY дата ASC, id ASC
    `).all(pos.id);

    let inflows = pos.главница_eur;   // главница се брои като initial inflow
    let outflows = 0;
    let dividendsReceived = 0;
    let lastDividendDate = pos.дата_влог;

    for (const t of txs) {
      const eur = toEur(Number(t.сума), t.валута);
      if (t.тип === 'влог')         inflows  += eur;
      else if (t.тип === 'теглене') outflows += eur;
      else if (t.тип === 'дивидент') {
        dividendsReceived += eur;
        if (t.дата > lastDividendDate) lastDividendDate = t.дата;
      }
      // 'такса' не променя главницата
    }

    const principal = inflows - outflows;
    const today = new Date().toISOString().slice(0, 10);
    const daysSinceLastDividend = Math.max(0, daysBetween(lastDividendDate, today));

    // Accrued от последен дивидент при фиксирана годишна доходност
    let accrued = 0;
    if (pos.лихва_pct) {
      accrued = principal * (pos.лихва_pct / 100) * (daysSinceLastDividend / 365);
    }

    // Очаквана дата на следващ дивидент (последен + период_месеци)
    const periodMonths = pos.период_месеци || 3;
    const lastDivD = new Date(lastDividendDate);
    const nextDivD = new Date(lastDivD);
    nextDivD.setMonth(nextDivD.getMonth() + periodMonths);
    const nextDividendDate = nextDivD.toISOString().slice(0, 10);

    // Очакван дивидент = главница * (годишен % / (12/период_месеци))
    const expectedNext = pos.лихва_pct
      ? principal * (pos.лихва_pct / 100) * (periodMonths / 12)
      : null;

    return {
      ...pos,
      главница_текуща_eur: Number(principal.toFixed(2)),
      натрупана_лихва_eur: Number(accrued.toFixed(2)),
      текуща_стойност_eur: Number((principal + accrued).toFixed(2)),
      дивиденти_получени_eur: Number(dividendsReceived.toFixed(2)),
      последен_дивидент: lastDividendDate === pos.дата_влог ? null : lastDividendDate,
      следващ_дивидент_дата: nextDividendDate,
      очакван_дивидент_eur: expectedNext !== null ? Number(expectedNext.toFixed(2)) : null,
      брой_сделки: txs.length,
    };
  }

  function daysBetween(d1, d2) {
    return Math.floor((new Date(d2) - new Date(d1)) / 86400000);
  }

  // ── Positions CRUD ───────────────────────────────────────────────────────
  router.get('/positions', (req, res) => {
    const positions = db.prepare('SELECT * FROM bulgar_positions ORDER BY дата_влог DESC').all();
    res.json(positions.map(computePositionState));
  });

  router.post('/positions', (req, res) => {
    const b = req.body || {};
    if (!b.име || !b.дата_влог || !b.главница_orig) {
      return res.status(400).json({ error: 'име, дата_влог, главница_orig са задължителни' });
    }
    const currency = b.валута_orig || 'BGN';
    const principalEur = toEur(Number(b.главница_orig), currency);
    const r = db.prepare(`INSERT INTO bulgar_positions
      (име, дата_влог, главница_orig, валута_orig, главница_eur, лихва_pct, период_месеци, бележка)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      b.име, b.дата_влог, Number(b.главница_orig), currency, Number(principalEur.toFixed(2)),
      b.лихва_pct != null ? Number(b.лихва_pct) : null,
      b.период_месеци ? Number(b.период_месеци) : 3,
      b.бележка || ''
    );
    res.status(201).json({ id: r.lastInsertRowid, главница_eur: Number(principalEur.toFixed(2)) });
  });

  router.put('/positions/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM bulgar_positions WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const currency = b.валута_orig || existing.валута_orig;
    const principalOrig = b.главница_orig !== undefined ? Number(b.главница_orig) : existing.главница_orig;
    const principalEur = toEur(principalOrig, currency);
    db.prepare(`UPDATE bulgar_positions SET
      име=?, дата_влог=?, главница_orig=?, валута_orig=?, главница_eur=?,
      лихва_pct=?, период_месеци=?, бележка=?, активна=?
      WHERE id=?`).run(
      b.име ?? existing.име,
      b.дата_влог ?? existing.дата_влог,
      principalOrig, currency, Number(principalEur.toFixed(2)),
      b.лихва_pct !== undefined ? (b.лихва_pct != null ? Number(b.лихва_pct) : null) : existing.лихва_pct,
      b.период_месеци !== undefined ? Number(b.период_месеци) : existing.период_месеци,
      b.бележка ?? existing.бележка,
      b.активна !== undefined ? (b.активна ? 1 : 0) : existing.активна,
      req.params.id
    );
    res.json({ ok: true });
  });

  router.delete('/positions/:id', (req, res) => {
    db.prepare('DELETE FROM bulgar_positions WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── Transactions CRUD ────────────────────────────────────────────────────
  router.get('/transactions', (req, res) => {
    const { position_id, month } = req.query;
    let sql = `SELECT bt.*, p.име AS позиция_име
               FROM bulgar_transactions bt
               LEFT JOIN bulgar_positions p ON p.id = bt.position_id
               WHERE 1=1`;
    const params = [];
    if (position_id) { sql += ' AND bt.position_id = ?'; params.push(position_id); }
    if (month)       { sql += " AND strftime('%Y-%m', bt.дата) = ?"; params.push(month); }
    sql += ' ORDER BY bt.дата DESC, bt.id DESC';
    res.json(db.prepare(sql).all(...params));
  });

  router.post('/transactions', (req, res) => {
    const b = req.body || {};
    if (!b.position_id || !b.дата || !b.тип || b.сума === undefined) {
      return res.status(400).json({ error: 'position_id, дата, тип, сума са задължителни' });
    }
    if (!TX_TYPES.includes(b.тип)) {
      return res.status(400).json({ error: `тип: ${TX_TYPES.join(' | ')}` });
    }
    const r = createBulgarTx(b);
    res.status(201).json({ id: r.id, personal_income_id: r.personal_income_id });
  });

  function createBulgarTx(b) {
    const result = db.transaction(() => {
      const r = db.prepare(`INSERT INTO bulgar_transactions
        (position_id, дата, тип, сума, валута, bank_tx_id, бележка)
        VALUES (?,?,?,?,?,?,?)`).run(
        Number(b.position_id), b.дата, b.тип, Number(b.сума),
        b.валута || 'EUR', b.bank_tx_id || null, b.бележка || ''
      );
      // Дивидентите → personal_income (тип 'лихва_болгар')
      let pincomeId = null;
      if (b.тип === 'дивидент') {
        const pos = db.prepare('SELECT име FROM bulgar_positions WHERE id=?').get(Number(b.position_id));
        const pr = db.prepare(`INSERT INTO personal_income
          (дата, тип, сума, валута, източник, бележка, bank_tx_id)
          VALUES (?,?,?,?,?,?,?)`).run(
          b.дата, 'лихва_болгар', Number(b.сума),
          b.валута || 'EUR',
          pos ? `Bulgar Capital — ${pos.име}` : 'Bulgar Capital',
          b.бележка || `Дивидент (bulgar_tx #${r.lastInsertRowid})`,
          b.bank_tx_id || null
        );
        pincomeId = pr.lastInsertRowid;
      }
      return { id: r.lastInsertRowid, personal_income_id: pincomeId };
    });
    return result();
  }

  router.delete('/transactions/:id', (req, res) => {
    db.prepare('DELETE FROM bulgar_transactions WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── Retro-import: scan transactions по keyword → дивиденти ───────────────
  // POST /retro-import { position_id, keyword: "болгар капитал", само_преглед: false }
  router.post('/retro-import', (req, res) => {
    const b = req.body || {};
    const positionId = Number(b.position_id);
    const keyword = (b.keyword || '').toLowerCase().trim();
    if (!positionId || !keyword) {
      return res.status(400).json({ error: 'position_id и keyword са задължителни' });
    }
    const pos = db.prepare('SELECT * FROM bulgar_positions WHERE id=?').get(positionId);
    if (!pos) return res.status(404).json({ error: 'Позицията не е намерена' });

    // Намери Кт транзакции които match-ват keyword-а и НЕ са вече вкарани като bulgar tx
    const candidates = db.prepare(`
      SELECT t.* FROM transactions t
      WHERE t.operation = 'Кт'
        AND (LOWER(t.контрагент) LIKE '%' || ? || '%' OR LOWER(t.основание) LIKE '%' || ? || '%')
        AND NOT EXISTS (SELECT 1 FROM bulgar_transactions bt WHERE bt.bank_tx_id = t.id)
      ORDER BY t.дата ASC
    `).all(keyword, keyword);

    if (b.само_преглед) {
      return res.json({ candidates: candidates.length, items: candidates });
    }

    let created = 0;
    for (const tx of candidates) {
      try {
        createBulgarTx({
          position_id: positionId,
          дата: tx.дата,
          тип: 'дивидент',
          сума: tx.сума,
          валута: tx.currency || 'EUR',
          bank_tx_id: tx.id,
          бележка: `Авто от bank tx #${tx.id}: ${(tx.основание || '').slice(0, 200)}`,
        });
        created++;
      } catch (e) {
        // вече съществува (unique idx) — skip
      }
    }
    res.json({ created, found: candidates.length });
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  router.get('/summary', (req, res) => {
    const positions = db.prepare('SELECT * FROM bulgar_positions WHERE активна=1').all();
    if (!positions.length) return res.json({ позиции: 0, главница_eur: 0, текуща_стойност_eur: 0, дивиденти_eur: 0 });
    const enriched = positions.map(computePositionState);
    const totals = enriched.reduce((s, p) => ({
      главница_eur:           s.главница_eur           + p.главница_текуща_eur,
      натрупана_лихва_eur:    s.натрупана_лихва_eur    + p.натрупана_лихва_eur,
      текуща_стойност_eur:    s.текуща_стойност_eur    + p.текуща_стойност_eur,
      дивиденти_общо_eur:     s.дивиденти_общо_eur     + p.дивиденти_получени_eur,
    }), { главница_eur: 0, натрупана_лихва_eur: 0, текуща_стойност_eur: 0, дивиденти_общо_eur: 0 });

    // Дивиденти YTD от bulgar_transactions
    const ytd = db.prepare(`
      SELECT SUM(сума) AS total, COUNT(*) AS count
      FROM bulgar_transactions
      WHERE тип='дивидент' AND strftime('%Y', дата) = strftime('%Y', 'now')
    `).get();

    res.json({
      позиции: enriched.length,
      главница_eur:           Number(totals.главница_eur.toFixed(2)),
      натрупана_лихва_eur:    Number(totals.натрупана_лихва_eur.toFixed(2)),
      текуща_стойност_eur:    Number(totals.текуща_стойност_eur.toFixed(2)),
      дивиденти_общо_eur:     Number(totals.дивиденти_общо_eur.toFixed(2)),
      дивиденти_ytd_eur:      Number((ytd?.total || 0).toFixed(2)),
      дивиденти_ytd_брой:     ytd?.count || 0,
      позиции_детайл:         enriched,
    });
  });

  return router;
};

module.exports.TX_TYPES = TX_TYPES;
module.exports.BGN_EUR_RATE = BGN_EUR_RATE;
