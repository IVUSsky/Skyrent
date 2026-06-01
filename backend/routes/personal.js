// /api/personal — личен бюджет: доходи (заплата, договор управление, дивиденти,
// лихва от Болгар капитал, друго) + месечно резюме (доход − лични разходи).
//
// Източници:
//   1. ProBanking импорт auto-създава personal_income при scope='personal' Кт.
//   2. Ръчно — за заплати от друга банка / cash.
//   3. От съществуваща банкова tx — endpoint POST /income/from-tx/:tx_id.

const express = require('express');

const INCOME_TYPES = ['заплата', 'управление', 'дивидент', 'лихва_болгар', 'друго'];

module.exports = function(db) {
  const router = express.Router();

  // Tenants не виждат личния модул
  router.use((req, res, next) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Само за администратори' });
    next();
  });

  // ── Income CRUD ──────────────────────────────────────────────────────────
  router.get('/income', (req, res) => {
    const { month, тип } = req.query;
    let sql = `SELECT pi.*, t.контрагент AS tx_контрагент, t.основание AS tx_основание
               FROM personal_income pi
               LEFT JOIN transactions t ON t.id = pi.bank_tx_id
               WHERE 1=1`;
    const p = [];
    if (month) { sql += " AND strftime('%Y-%m', pi.дата) = ?"; p.push(month); }
    if (тип)   { sql += ' AND pi.тип = ?';                     p.push(тип); }
    sql += ' ORDER BY pi.дата DESC, pi.id DESC';
    res.json(db.prepare(sql).all(...p));
  });

  router.post('/income', (req, res) => {
    const b = req.body || {};
    if (!b.дата || !b.тип || b.сума === undefined) {
      return res.status(400).json({ error: 'дата, тип и сума са задължителни' });
    }
    if (!INCOME_TYPES.includes(b.тип)) {
      return res.status(400).json({ error: `тип трябва да е едно от: ${INCOME_TYPES.join(', ')}` });
    }
    const r = db.prepare(`INSERT INTO personal_income (дата, тип, сума, валута, източник, бележка, bank_tx_id)
                          VALUES (?,?,?,?,?,?,?)`).run(
      b.дата, b.тип, Number(b.сума),
      b.валута || (b.дата >= '2026-01-01' ? 'EUR' : 'BGN'),
      b.източник || '',
      b.бележка || '',
      b.bank_tx_id || null
    );
    res.status(201).json({ id: r.lastInsertRowid });
  });

  router.put('/income/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM personal_income WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    if (b.тип && !INCOME_TYPES.includes(b.тип)) {
      return res.status(400).json({ error: `тип: ${INCOME_TYPES.join(', ')}` });
    }
    db.prepare(`UPDATE personal_income
                SET дата=?, тип=?, сума=?, валута=?, източник=?, бележка=?
                WHERE id=?`).run(
      b.дата ?? existing.дата,
      b.тип  ?? existing.тип,
      b.сума !== undefined ? Number(b.сума) : existing.сума,
      b.валута ?? existing.валута,
      b.източник ?? existing.източник,
      b.бележка ?? existing.бележка,
      req.params.id
    );
    res.json({ ok: true });
  });

  router.delete('/income/:id', (req, res) => {
    db.prepare('DELETE FROM personal_income WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // POST /income/from-tx/:tx_id  Body: { тип, бележка? }
  // Маркира съществуваща банкова Кт транзакция като личен доход:
  //  - сменя transactions.scope='personal' + категория съответна
  //  - създава personal_income запис ако не съществува
  router.post('/income/from-tx/:tx_id', (req, res) => {
    const tx = db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.tx_id);
    if (!tx) return res.status(404).json({ error: 'Транзакцията не е намерена' });
    if (tx.operation !== 'Кт') return res.status(400).json({ error: 'Само Кт транзакции могат да бъдат маркирани като доход' });
    const b = req.body || {};
    const тип = b.тип || 'друго';
    if (!INCOME_TYPES.includes(тип)) {
      return res.status(400).json({ error: `тип: ${INCOME_TYPES.join(', ')}` });
    }
    const already = db.prepare('SELECT id FROM personal_income WHERE bank_tx_id=?').get(tx.id);
    const doIt = db.transaction(() => {
      db.prepare("UPDATE transactions SET scope='personal', категория=? WHERE id=?")
        .run(тип, tx.id);
      if (already) {
        db.prepare('UPDATE personal_income SET тип=?, бележка=? WHERE id=?')
          .run(тип, b.бележка || `Маркирана от bank tx #${tx.id}`, already.id);
        return already.id;
      }
      const r = db.prepare(`INSERT INTO personal_income
        (дата, тип, сума, валута, източник, бележка, bank_tx_id)
        VALUES (?,?,?,?,?,?,?)`).run(
        tx.дата, тип, tx.сума,
        tx.currency || (tx.дата >= '2026-01-01' ? 'EUR' : 'BGN'),
        tx.контрагент || '',
        b.бележка || tx.основание || '',
        tx.id
      );
      return r.lastInsertRowid;
    });
    const id = doIt();
    res.status(201).json({ id, marked_tx: tx.id });
  });

  // POST /tx/:tx_id/scope  Body: { scope: 'personal' | 'business' }
  // Просто превключва scope без да създава personal_income (за разходи / други).
  router.post('/tx/:tx_id/scope', (req, res) => {
    const scope = (req.body?.scope || '').toLowerCase();
    if (!['personal', 'business'].includes(scope)) {
      return res.status(400).json({ error: "scope: 'personal' | 'business'" });
    }
    const tx = db.prepare('SELECT id FROM transactions WHERE id=?').get(req.params.tx_id);
    if (!tx) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE transactions SET scope=? WHERE id=?').run(scope, tx.id);
    // Ако има свързана expense_invoices, я обнови също
    db.prepare('UPDATE expense_invoices SET scope=? WHERE bank_tx_id=?').run(scope, tx.id);
    res.json({ ok: true, scope });
  });

  // ── Monthly summary ──────────────────────────────────────────────────────
  // Връща: доходи (по тип), разходи (по категория), нетен cashflow, savings rate.
  // savings_target_pct се чете от settings.
  router.get('/summary', (req, res) => {
    const month = req.query.month; // YYYY-MM, optional → текущ
    const m = month || new Date().toISOString().slice(0, 7);

    const incomeByType = db.prepare(`
      SELECT тип, валута, SUM(сума) AS total, COUNT(*) AS count
      FROM personal_income
      WHERE strftime('%Y-%m', дата) = ?
      GROUP BY тип, валута
    `).all(m);

    const expensesByCat = db.prepare(`
      SELECT expense_category, currency, SUM(amount) AS total, COUNT(*) AS count
      FROM expense_invoices
      WHERE scope='personal' AND месец = ?
      GROUP BY expense_category, currency
    `).all(m);

    const incomeTotal = incomeByType.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const expenseTotal = expensesByCat.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const cashflow = incomeTotal - expenseTotal;

    const settingsRow = db.prepare("SELECT value FROM settings WHERE key='savings_target_pct'").get();
    const targetPct = settingsRow ? Number(settingsRow.value) || 0 : 30;
    const targetAmount = Number(((incomeTotal * targetPct) / 100).toFixed(2));
    const savingsRate = incomeTotal > 0 ? Number(((cashflow / incomeTotal) * 100).toFixed(2)) : null;

    // Колко вече е инвестирано този месец (метали + Болгар лихва не се брои, само нови вложения)
    const investedThisMonth = db.prepare(`
      SELECT SUM(обща_сума) AS total
      FROM gold_investments
      WHERE strftime('%Y-%m', дата) = ? AND тип='покупка'
    `).get(m);

    res.json({
      месец: m,
      доход_общо: Number(incomeTotal.toFixed(2)),
      разходи_общо: Number(expenseTotal.toFixed(2)),
      нетен_cashflow: Number(cashflow.toFixed(2)),
      доход_по_тип: incomeByType,
      разходи_по_категория: expensesByCat,
      savings: {
        rate_pct: savingsRate,
        target_pct: targetPct,
        нужна_сума: targetAmount,
        свободно_за_инвестиране: Number(cashflow.toFixed(2)),
        дисциплина: savingsRate !== null ? (savingsRate >= targetPct ? 'над цел' : 'под цел') : null,
      },
      инвестирано_месец: Number((investedThisMonth?.total || 0).toFixed(2)),
    });
  });

  // GET /summary/timeline?months=12 → месечни суми за последните N месеца
  router.get('/summary/timeline', (req, res) => {
    const months = Math.min(60, Math.max(1, Number(req.query.months) || 12));
    const incomeRows = db.prepare(`
      SELECT strftime('%Y-%m', дата) AS месец, SUM(сума) AS total
      FROM personal_income
      WHERE дата >= date('now', ?)
      GROUP BY месец
      ORDER BY месец ASC
    `).all(`-${months} months`);
    const expenseRows = db.prepare(`
      SELECT месец, SUM(amount) AS total
      FROM expense_invoices
      WHERE scope='personal' AND месец >= strftime('%Y-%m', date('now', ?))
      GROUP BY месец
      ORDER BY месец ASC
    `).all(`-${months} months`);

    const byMonth = new Map();
    for (const r of incomeRows)  byMonth.set(r.месец, { месец: r.месец, доход: Number(r.total) || 0, разход: 0 });
    for (const r of expenseRows) {
      const e = byMonth.get(r.месец) || { месец: r.месец, доход: 0, разход: 0 };
      e.разход = Number(r.total) || 0;
      byMonth.set(r.месец, e);
    }
    const list = [...byMonth.values()]
      .sort((a, b) => a.месец.localeCompare(b.месец))
      .map(r => ({ ...r, нетно: Number((r.доход - r.разход).toFixed(2)) }));
    res.json(list);
  });

  return router;
};

module.exports.INCOME_TYPES = INCOME_TYPES;
