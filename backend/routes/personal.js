// /api/personal — личен бюджет: доходи (заплата, договор управление, дивиденти,
// лихва от Болгар капитал, друго) + месечно резюме (доход − лични разходи).
//
// Източници:
//   1. ProBanking импорт auto-създава personal_income при scope='personal' Кт.
//   2. Ръчно — за заплати от друга банка / cash.
//   3. От съществуваща банкова tx — endpoint POST /income/from-tx/:tx_id.

const express = require('express');

const INCOME_TYPES = ['заплата', 'управление', 'дивидент', 'лихва_болгар', 'sky_capital', 'друго'];

module.exports = function(db) {
  const router = express.Router();

  // Tenants не виждат личния модул
  router.use((req, res, next) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Само за администратори' });
    next();
  });

  // ── Income CRUD ──────────────────────────────────────────────────────────
  router.get('/income', (req, res) => {
    const { тип } = req.query;
    const month = req.query.month || req.query['месец'];  // и двата формата
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

  // ── Helper: parse period query (?month=YYYY-MM | ?from=YYYY-MM-DD&to=... | ?months=N)
  // Връща { from, to, label } като ISO дати.
  // Поправено: ползва локални дати (не UTC) за да избегне TZ off-by-one.
  // "Nм" = последните N месеца включително днес (today.setMonth(today.getMonth() - N)).
  function localDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function parsePeriod(q) {
    // Поддържат се и двете: q.month (английски) и q.месец (кирилица) — за консистенция с другите endpoint-и
    const monthParam = q.month || q['месец'];
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-');
      const last = localDate(new Date(Number(y), Number(m), 0));
      return { from: `${monthParam}-01`, to: last, label: monthParam };
    }
    if (q.from && q.to) {
      return { from: q.from, to: q.to, label: `${q.from}…${q.to}` };
    }
    if (q.months) {
      const n = Math.min(60, Math.max(1, Number(q.months) || 1));
      const today = new Date();
      const from = new Date(today);
      from.setMonth(from.getMonth() - n);
      return { from: localDate(from), to: localDate(today), label: `последни ${n} мес` };
    }
    // default: current month
    const today = new Date();
    const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const last = localDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    return { from: `${t}-01`, to: last, label: t };
  }

  // Категории Дт които НЕ са лични разходи а capital flows/loans/инвестиции:
  // изключват се от "Лични разходи" и се показват отделно в breakdown-а.
  const NOT_PERSONAL_EXPENSE = ['вноска', 'заем_sky', 'инвестиция', 'благородни метали',
                                 'ремонт', 'ремонт д', 'нап_ддс'];

  // BALANCE-NEUTRAL: тези категории представляват bank loan pass-through
  // (банка дава кредит → user → Sky). НЕ са реален outflow от собствените пари.
  // Изключват се от "Излязох" / "Налични" формулата. Показват се само като info.
  const BALANCE_NEUTRAL = ['заем_sky', 'кредит_получен'];

  // ── Period summary ────────────────────────────────────────────────────────
  // Връща: доходи (по тип), разходи (по категория), нетен cashflow, savings rate.
  // Параметри: ?month=YYYY-MM ИЛИ ?from=YYYY-MM-DD&to=YYYY-MM-DD ИЛИ ?months=N
  //
  // ВАЖНО за формулата:
  // - доход_общо = personal_income (заплати, наеми, дивиденти, и т.н.)
  // - разходи_общо = САМО реални консумативни Дт (изключва loans/capital/инв.)
  // - капитал_общо = вноски + заеми към Sky + инвестиции (отделно)
  // - реално_свободно = доход - разходи - капитал
  router.get('/summary', (req, res) => {
    const { from, to, label } = parsePeriod(req.query);

    const incomeByType = db.prepare(`
      SELECT тип, валута, SUM(сума) AS total, COUNT(*) AS count
      FROM personal_income
      WHERE дата BETWEEN ? AND ?
      GROUP BY тип, валута
    `).all(from, to);

    // ВСИЧКИ Дт от personal сметки (от bank transactions)
    const personalOut = db.prepare(`
      SELECT категория, currency, SUM(сума) AS total, COUNT(*) AS count
      FROM transactions
      WHERE scope='personal' AND operation='Дт'
        AND дата BETWEEN ? AND ?
      GROUP BY категория, currency
    `).all(from, to);

    const manualExp = db.prepare(`
      SELECT expense_category AS категория, currency, SUM(amount) AS total, COUNT(*) AS count
      FROM expense_invoices
      WHERE scope='personal' AND (bank_tx_id IS NULL)
        AND (invoice_date BETWEEN ? AND ?
             OR (invoice_date IS NULL AND месец BETWEEN ? AND ?))
      GROUP BY expense_category, currency
    `).all(from, to, from.slice(0, 7), to.slice(0, 7));

    const expMap = new Map();
    const addExp = (rows) => {
      for (const r of rows) {
        const key = `${r.категория || '—'}::${r.currency || 'EUR'}`;
        const existing = expMap.get(key) || { expense_category: r.категория || '—', currency: r.currency || 'EUR', total: 0, count: 0 };
        existing.total += Number(r.total) || 0;
        existing.count += Number(r.count) || 0;
        expMap.set(key, existing);
      }
    };
    addExp(personalOut);
    addExp(manualExp);
    const allOutflows = [...expMap.values()].sort((a, b) => b.total - a.total);

    // Раздели на 3:
    //   1. реални лични разходи
    //   2. капитал/кредитни вноски/инвестиции (реален outflow)
    //   3. balance-neutral pass-through (заем_sky от bank loan)
    const expensesByCat = allOutflows.filter(r =>
      !NOT_PERSONAL_EXPENSE.includes(r.expense_category) &&
      !BALANCE_NEUTRAL.includes(r.expense_category));
    const capitalByCat  = allOutflows.filter(r =>
      NOT_PERSONAL_EXPENSE.includes(r.expense_category) &&
      !BALANCE_NEUTRAL.includes(r.expense_category));
    const neutralByCat  = allOutflows.filter(r =>
      BALANCE_NEUTRAL.includes(r.expense_category));

    const incomeTotal  = incomeByType.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const expenseTotal = expensesByCat.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const capitalTotal = capitalByCat.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const neutralTotal = neutralByCat.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const cashflow     = incomeTotal - expenseTotal;
    const realFree     = incomeTotal - expenseTotal - capitalTotal; // НЕ изважда neutral

    const settingsRow = db.prepare("SELECT value FROM settings WHERE key='savings_target_pct'").get();
    const targetPct = settingsRow ? Number(settingsRow.value) || 0 : 30;
    const targetAmount = Number(((incomeTotal * targetPct) / 100).toFixed(2));
    const savingsRate = incomeTotal > 0 ? Number(((cashflow / incomeTotal) * 100).toFixed(2)) : null;

    // Инвестирано за периода — разбивка по източник
    const invGoldRow = db.prepare(`
      SELECT SUM(обща_сума) AS total, COUNT(*) AS count
      FROM gold_investments
      WHERE дата BETWEEN ? AND ? AND тип='покупка' AND метал='gold'
    `).get(from, to);
    const invSilverRow = db.prepare(`
      SELECT SUM(обща_сума) AS total, COUNT(*) AS count
      FROM gold_investments
      WHERE дата BETWEEN ? AND ? AND тип='покупка' AND метал='silver'
    `).get(from, to);
    const invBulgarRow = db.prepare(`
      SELECT SUM(сума) AS total, COUNT(*) AS count
      FROM bulgar_transactions
      WHERE дата BETWEEN ? AND ? AND тип='влог'
    `).get(from, to);
    // Trading 212 + други брокери от bank transactions с категория='инвестиция'
    const invBrokerRow = db.prepare(`
      SELECT SUM(сума) AS total, COUNT(*) AS count
      FROM transactions
      WHERE operation='Дт' AND категория='инвестиция'
        AND дата BETWEEN ? AND ?
    `).get(from, to);

    const invBreakdown = [
      { източник: 'Bulgar Capital', сума: invBulgarRow?.total || 0, брой: invBulgarRow?.count || 0 },
      { източник: 'Злато',          сума: invGoldRow?.total   || 0, брой: invGoldRow?.count   || 0 },
      { източник: 'Сребро',         сума: invSilverRow?.total || 0, брой: invSilverRow?.count || 0 },
      { източник: 'Брокери (T212/др.)', сума: invBrokerRow?.total || 0, брой: invBrokerRow?.count || 0 },
    ].filter(b => b.сума > 0);
    const invested = invBreakdown.reduce((s, b) => s + b.сума, 0);

    res.json({
      период: { from, to, label },
      месец: label,
      доход_общо:     Number(incomeTotal.toFixed(2)),
      разходи_общо:   Number(expenseTotal.toFixed(2)),
      капитал_общо:   Number(capitalTotal.toFixed(2)),
      неутрален_общо: Number(neutralTotal.toFixed(2)),
      нетен_cashflow: Number(cashflow.toFixed(2)),
      реално_свободно: Number(realFree.toFixed(2)),
      доход_по_тип:           incomeByType,
      разходи_по_категория:   expensesByCat,
      капитал_по_категория:   capitalByCat,
      неутрален_по_категория: neutralByCat,
      savings: {
        rate_pct: savingsRate,
        target_pct: targetPct,
        нужна_сума: targetAmount,
        свободно_за_инвестиране: Number(cashflow.toFixed(2)),
        дисциплина: savingsRate !== null ? (savingsRate >= targetPct ? 'над цел' : 'под цел') : null,
      },
      инвестирано_месец: Number(invested.toFixed(2)),
      инвестирано_по_източник: invBreakdown.map(b => ({
        ...b,
        сума: Number(b.сума.toFixed(2)),
      })),
    });
  });

  // PATCH /loans/:id/external — маркира кредит като плащан externally (от друг)
  router.patch('/loans/:id/external', (req, res) => {
    const { paid_external, paid_external_note } = req.body || {};
    db.prepare('UPDATE loans SET paid_external = ?, paid_external_note = ? WHERE id = ?')
      .run(paid_external ? 1 : 0, paid_external_note || null, req.params.id);
    res.json({ ok: true });
  });

  // ── Loans summary (ипотеки + плащания) ──────────────────────────────────
  // Match-ва loans.договор с tx.основание (търси "договор" pattern в основание).
  // За всеки loan: сума платена досега, # вноски, очаквана следваща дата/сума.
  router.get('/loans/summary', (req, res) => {
    const loans = db.prepare('SELECT * FROM loans').all();
    if (!loans.length) return res.json({ loans: [], общо_дълг: 0, общо_платено: 0 });

    const result = [];
    for (const loan of loans) {
      // External-paid loans: skip bank tx-те matching, no payments expected here
      if (loan.paid_external) {
        result.push({ ...loan, платено: 0, брой_вноски: 0, последна_дата: null, search_key: null });
        continue;
      }
      const dog = (loan.договор || '').trim();
      if (!dog) {
        result.push({ ...loan, платено: 0, брой_вноски: 0, последна_дата: null });
        continue;
      }
      // Извлечи числов част от договора (напр. "902-1212686" → "1212686")
      const numMatch = dog.match(/(\d{5,})/);
      const searchKey = numMatch ? numMatch[1] : dog;

      const payments = db.prepare(`
        SELECT id, дата, сума, основание FROM transactions
        WHERE operation = 'Дт'
          AND категория = 'вноска'
          AND основание LIKE ?
        ORDER BY дата ASC
      `).all(`%${searchKey}%`);

      const платено = payments.reduce((s, p) => s + Number(p.сума || 0), 0);
      const последна = payments[payments.length - 1];
      const първа = payments[0];

      result.push({
        ...loan,
        платено: Number(платено.toFixed(2)),
        брой_вноски: payments.length,
        първа_вноска: първа?.дата || null,
        последна_вноска: последна?.дата || null,
        последна_сума: последна ? Number((Number(последна.сума) || 0).toFixed(2)) : null,
        search_key: searchKey,
      });
    }

    res.json({
      loans: result,
      общо_дълг:     Number(loans.reduce((s, l) => s + (Number(l.остатък) || 0), 0).toFixed(2)),
      общо_месечна:  Number(loans.reduce((s, l) => s + (Number(l.вноска) || 0), 0).toFixed(2)),
      общо_платено:  Number(result.reduce((s, l) => s + l.платено, 0).toFixed(2)),
      общо_вноски:   result.reduce((s, l) => s + l.брой_вноски, 0),
    });
  });

  // ── Категоризация по контрагент (batch) ─────────────────────────────────
  // GET /categorize/contractors?category=X&op=Дт
  // Връща групи контрагенти със същата текуща категория, сортирани по сума.
  router.get('/categorize/contractors', (req, res) => {
    const cat = req.query.category;
    const op = req.query.op || 'Дт';
    const scope = req.query.scope || 'personal';
    if (!cat) return res.status(400).json({ error: 'category е задължителна' });

    // Use JS-side grouping за case-insensitive cyrillic match
    const rows = db.prepare(`
      SELECT id, дата, контрагент, основание, сума, operation, scope, категория
      FROM transactions
      WHERE категория = ? AND operation = ? AND scope = ?
        AND контрагент IS NOT NULL AND контрагент != ''
    `).all(cat, op, scope);

    const groups = new Map();
    for (const r of rows) {
      const key = r.контрагент.trim();
      if (!groups.has(key)) groups.set(key, { контрагент: key, count: 0, total: 0, sample: r.основание, ids: [] });
      const g = groups.get(key);
      g.count++;
      g.total += Number(r.сума) || 0;
      if (g.ids.length < 100) g.ids.push(r.id);
    }
    const list = [...groups.values()].sort((a, b) => b.total - a.total);
    res.json({
      brой_контрагенти: list.length,
      общо_сума: Number(list.reduce((s, g) => s + g.total, 0).toFixed(2)),
      контрагенти: list.map(g => ({ ...g, total: Number(g.total.toFixed(2)) })),
    });
  });

  // POST /categorize/contractor { contractor, category, scope?, save_rule? }
  // Batch update на всички tx-те от този контрагент + (optional) tx_rule.
  // Auto-rebuild на personal_income за income категории (заплата, упрedение,
  // sky_capital, лихва_болгар, наем на personal scope).
  const PERSONAL_INCOME_CATS_SET = new Set(['заплата','управление','sky_capital','лихва_болгар','наем']);

  router.post('/categorize/contractor', (req, res) => {
    const { contractor, category, scope } = req.body || {};
    if (!contractor || !category) return res.status(400).json({ error: 'contractor + category са задължителни' });

    const candidates = db.prepare(`SELECT id, контрагент FROM transactions WHERE контрагент IS NOT NULL`).all();
    const target = contractor.toLowerCase();
    const matchIds = candidates.filter(t => (t.контрагент || '').toLowerCase().includes(target)).map(t => t.id);

    let updated = 0;
    let pincomeCreated = 0;
    const upd = scope
      ? db.prepare('UPDATE transactions SET категория = ?, scope = ? WHERE id = ?')
      : db.prepare('UPDATE transactions SET категория = ? WHERE id = ?');
    const updExp = db.prepare('UPDATE expense_invoices SET expense_category = ?, scope = COALESCE(?, scope) WHERE bank_tx_id = ?');
    const getTx = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const hasPi = db.prepare('SELECT id FROM personal_income WHERE bank_tx_id = ?');
    const insertPi = db.prepare(`INSERT INTO personal_income
      (дата, тип, сума, валута, източник, бележка, bank_tx_id) VALUES (?,?,?,?,?,?,?)`);

    const doIt = db.transaction(() => {
      for (const id of matchIds) {
        if (scope) upd.run(category, scope, id);
        else       upd.run(category, id);
        updExp.run(category, scope || null, id);
        updated++;
        // Auto-rebuild personal_income за income категории при personal scope
        if (PERSONAL_INCOME_CATS_SET.has(category)) {
          const tx = getTx.get(id);
          if (tx && tx.operation === 'Кт' && tx.scope === 'personal' && !hasPi.get(id)) {
            let pincomeType = 'друго';
            if (category === 'заплата')       pincomeType = 'заплата';
            else if (category === 'управление') pincomeType = 'управление';
            else if (category === 'sky_capital') pincomeType = 'sky_capital';
            else if (category === 'лихва_болгар') pincomeType = 'лихва_болгар';
            // наем → 'друго' (личен)
            insertPi.run(tx.дата, pincomeType, tx.сума, tx.currency || 'EUR',
                         tx.контрагент || '', tx.основание || '', tx.id);
            pincomeCreated++;
          }
        }
      }
      // tx_rule upsert
      const existing = db.prepare('SELECT id FROM tx_rules WHERE LOWER(pattern) = LOWER(?)').get(contractor);
      if (existing) {
        db.prepare('UPDATE tx_rules SET категория = ?, scope = ? WHERE id = ?').run(category, scope || 'business', existing.id);
      } else {
        db.prepare('INSERT INTO tx_rules (pattern, категория, scope) VALUES (?, ?, ?)').run(contractor, category, scope || 'business');
      }
    });
    doIt();

    res.json({ updated, contractor, category, scope: scope || 'unchanged', rule_saved: true, personal_income_created: pincomeCreated });
  });

  // GET /search/tx?q=keyword — намира tx-те съдържащи keyword в контрагент
  // или основание. Полезно за намиране на Bulgar дивиденти, който може да
  // не са в обичайните места.
  router.get('/search/tx', (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q) return res.status(400).json({ error: 'q е задължително' });
    const all = db.prepare(`SELECT id, дата, контрагент, основание, сума, operation, категория, scope
                            FROM transactions ORDER BY дата DESC LIMIT 5000`).all();
    const matches = all.filter(t =>
      (t.контрагент || '').toLowerCase().includes(q) ||
      (t.основание  || '').toLowerCase().includes(q)
    );
    res.json({ q, count: matches.length, tx: matches.slice(0, 100) });
  });

  // ── Movements per direction (за clickable KPI cards) ────────────────────
  // GET /movements?direction=in|out&month= | from=&to= | months=
  // direction=in:  Кт от personal сметка + personal_income
  // direction=out: Дт от personal сметка
  router.get('/movements', (req, res) => {
    const { from, to, label } = parsePeriod(req.query);
    const direction = (req.query.direction || 'out').toLowerCase();
    const op = direction === 'in' ? 'Кт' : 'Дт';

    const rows = db.prepare(`
      SELECT t.id, t.дата, t.контрагент, t.основание, t.сума, t.operation,
             t.категория, t.scope, t.currency
      FROM transactions t
      WHERE t.scope = 'personal'
        AND t.operation = ?
        AND t.дата BETWEEN ? AND ?
      ORDER BY t.дата DESC, t.сума DESC
    `).all(op, from, to);

    // Group by категория за визуални секции
    const byCategory = {};
    let total = 0;
    for (const r of rows) {
      const key = r.категория || 'друго';
      if (!byCategory[key]) byCategory[key] = { категория: key, total: 0, count: 0, items: [] };
      byCategory[key].total += Number(r.сума) || 0;
      byCategory[key].count++;
      byCategory[key].items.push(r);
      total += Number(r.сума) || 0;
    }
    const groups = Object.values(byCategory).sort((a, b) => b.total - a.total);

    res.json({
      период: { from, to, label },
      direction,
      общо: Number(total.toFixed(2)),
      брой: rows.length,
      групи: groups,
      tx: rows,
    });
  });

  // ── Детайлен анализ на разходи за период ────────────────────────────────
  // GET /expenses/breakdown?month= | ?from=&to= | ?months=
  // Връща: топ контрагенти, top 30 разходи, дневен/месечен trend, breakdown по категория.
  router.get('/expenses/breakdown', (req, res) => {
    const { from, to, label } = parsePeriod(req.query);

    const byCategory = db.prepare(`
      SELECT expense_category, currency,
             SUM(amount) AS total, COUNT(*) AS count,
             AVG(amount) AS средно, MAX(amount) AS макс, MIN(amount) AS мин
      FROM expense_invoices
      WHERE scope='personal'
        AND (invoice_date BETWEEN ? AND ?
             OR (invoice_date IS NULL AND месец BETWEEN ? AND ?))
      GROUP BY expense_category, currency
      ORDER BY total DESC
    `).all(from, to, from.slice(0, 7), to.slice(0, 7));

    const byContractor = db.prepare(`
      SELECT supplier_name, currency,
             SUM(amount) AS total, COUNT(*) AS count
      FROM expense_invoices
      WHERE scope='personal'
        AND (invoice_date BETWEEN ? AND ?
             OR (invoice_date IS NULL AND месец BETWEEN ? AND ?))
        AND supplier_name IS NOT NULL AND supplier_name != ''
      GROUP BY supplier_name, currency
      ORDER BY total DESC
      LIMIT 30
    `).all(from, to, from.slice(0, 7), to.slice(0, 7));

    const byMonth = db.prepare(`
      SELECT
        COALESCE(strftime('%Y-%m', invoice_date), месец) AS месец,
        expense_category,
        SUM(amount) AS total
      FROM expense_invoices
      WHERE scope='personal'
        AND (invoice_date BETWEEN ? AND ?
             OR (invoice_date IS NULL AND месец BETWEEN ? AND ?))
      GROUP BY месец, expense_category
      ORDER BY месец ASC
    `).all(from, to, from.slice(0, 7), to.slice(0, 7));

    const top = db.prepare(`
      SELECT id, COALESCE(invoice_date, месец) AS дата,
             supplier_name, expense_category, amount, currency, reason
      FROM expense_invoices
      WHERE scope='personal'
        AND (invoice_date BETWEEN ? AND ?
             OR (invoice_date IS NULL AND месец BETWEEN ? AND ?))
      ORDER BY amount DESC
      LIMIT 30
    `).all(from, to, from.slice(0, 7), to.slice(0, 7));

    const total = byCategory.reduce((s, r) => s + Number(r.total || 0), 0);

    res.json({
      период: { from, to, label },
      общо: Number(total.toFixed(2)),
      по_категория:   byCategory,
      по_контрагент:  byContractor,
      по_месец:       byMonth,
      топ_30:         top,
    });
  });

  // POST /rebuild-from-tx
  // Сканира съществуващите transactions и:
  // 1. За всеки Кт с категория ∈ ['заплата','управление','наем'] и scope='personal'
  //    → ако няма personal_income запис → създава го.
  // 2. За всеки Дт с scope='personal' → ако има свързан expense_invoices с
  //    различен scope → sync-ва го на 'personal'.
  // Идемпотентно — можеш да го пускаш многократно.
  router.post('/rebuild-from-tx', (req, res) => {
    const ktRows = db.prepare(`
      SELECT t.* FROM transactions t
      WHERE t.operation = 'Кт'
        AND t.scope = 'personal'
        AND t.категория IN ('заплата', 'управление', 'наем', 'sky_capital', 'лихва_болгар')
        AND NOT EXISTS (SELECT 1 FROM personal_income pi WHERE pi.bank_tx_id = t.id)
    `).all();

    const insertPi = db.prepare(`INSERT INTO personal_income
      (дата, тип, сума, валута, източник, бележка, bank_tx_id) VALUES (?,?,?,?,?,?,?)`);

    let createdIncome = 0;
    for (const t of ktRows) {
      let pincomeType = 'друго';
      if (t.категория === 'заплата')         pincomeType = 'заплата';
      else if (t.категория === 'управление') pincomeType = 'управление';
      else if (t.категория === 'sky_capital') pincomeType = 'sky_capital';
      else if (t.категория === 'лихва_болгар') pincomeType = 'лихва_болгар';
      // наем → 'друго' (личен наем)
      insertPi.run(
        t.дата, pincomeType, t.сума,
        t.currency || 'EUR',
        t.контрагент || '',
        t.основание || `Ретро от bank tx #${t.id}`,
        t.id
      );
      createdIncome++;
    }

    // Sync expense_invoices.scope = transactions.scope ако bank_tx_id linked
    const syncExpense = db.prepare(`
      UPDATE expense_invoices
      SET scope = (SELECT scope FROM transactions WHERE id = expense_invoices.bank_tx_id)
      WHERE bank_tx_id IS NOT NULL
        AND scope != (SELECT scope FROM transactions WHERE id = expense_invoices.bank_tx_id)
    `).run();

    res.json({
      создадени_доходи:  createdIncome,
      синхронизирани_разходи: syncExpense.changes,
      Кт_намерени:       ktRows.length,
    });
  });

  // POST /recategorize-by-keywords
  // Ретро update на категория на съществуващи tx-те според keywords.
  // Полезно когато имаш импортирани приход_друг/разход_друг които всъщност
  // имат specific keyword (заплати, Trading 212, и т.н.) и са били импортирани
  // преди keyword-овата логика да е добавена.
  // Body: { rules: [{ keyword, target_category, operation?, target_scope? }, ...] }
  router.post('/recategorize-by-keywords', (req, res) => {
    const rules = (req.body && Array.isArray(req.body.rules)) ? req.body.rules : [];
    if (!rules.length) return res.status(400).json({ error: 'rules array required' });

    const results = [];
    // JS-side filter защото SQLite LOWER() не handle-ва кирилица.
    // Извличаме кандидати първо според op (ако е зададен), после filter-ваме в JS.
    for (const rule of rules) {
      const kw = (rule.keyword || '').toLowerCase().trim();
      const cat = rule.target_category;
      const op = rule.operation;
      const scope = rule.target_scope;
      if (!kw || !cat) continue;

      const filterSql = op ? `SELECT id, контрагент, основание FROM transactions WHERE operation = ?`
                           : `SELECT id, контрагент, основание FROM transactions`;
      const candidates = op ? db.prepare(filterSql).all(op) : db.prepare(filterSql).all();
      const matched = candidates.filter(t =>
        (t.контрагент || '').toLowerCase().includes(kw) ||
        (t.основание  || '').toLowerCase().includes(kw)
      );

      const upd = scope
        ? db.prepare('UPDATE transactions SET scope = ?, категория = ? WHERE id = ?')
        : db.prepare('UPDATE transactions SET категория = ? WHERE id = ?');
      let count = 0;
      for (const tx of matched) {
        if (scope) upd.run(scope, cat, tx.id);
        else       upd.run(cat, tx.id);
        count++;
      }
      results.push({ keyword: kw, target_category: cat, updated: count });
    }

    // Rebuild personal_income за новите 'заплата'/'управление'/'sky_capital'/'наем' tx-те
    const ktRows = db.prepare(`
      SELECT t.* FROM transactions t
      WHERE t.operation = 'Кт'
        AND t.scope = 'personal'
        AND t.категория IN ('заплата','управление','наем','sky_capital','лихва_болгар')
        AND NOT EXISTS (SELECT 1 FROM personal_income pi WHERE pi.bank_tx_id = t.id)
    `).all();
    const insertPi = db.prepare(`INSERT INTO personal_income
      (дата, тип, сума, валута, източник, бележка, bank_tx_id) VALUES (?,?,?,?,?,?,?)`);
    let createdIncome = 0;
    for (const t of ktRows) {
      let pincomeType = 'друго';
      if (t.категория === 'заплата')          pincomeType = 'заплата';
      else if (t.категория === 'управление')  pincomeType = 'управление';
      else if (t.категория === 'sky_capital') pincomeType = 'sky_capital';
      else if (t.категория === 'лихва_болгар') pincomeType = 'лихва_болгар';
      insertPi.run(t.дата, pincomeType, t.сума, t.currency || 'EUR',
                   t.контрагент || '', t.основание || '', t.id);
      createdIncome++;
    }

    res.json({ rules_applied: results, personal_income_created: createdIncome });
  });

  // POST /scope/by-keyword  { keyword, scope: 'personal'|'business', operation? }
  // Ретро-маркира всички transactions match-ващи keyword като желания scope.
  // Полезно когато не си посочил account scope при импорта.
  router.post('/scope/by-keyword', (req, res) => {
    const { keyword, scope, operation } = req.body || {};
    if (!keyword || !['personal','business'].includes(scope)) {
      return res.status(400).json({ error: 'keyword + scope са задължителни' });
    }
    const kw = `%${keyword.toLowerCase()}%`;
    let sql = `UPDATE transactions SET scope = ?
               WHERE (LOWER(контрагент) LIKE ? OR LOWER(основание) LIKE ?)`;
    const params = [scope, kw, kw];
    if (operation) { sql += ' AND operation = ?'; params.push(operation); }
    const r = db.prepare(sql).run(...params);
    // Sync expense_invoices
    db.prepare(`UPDATE expense_invoices
                SET scope = ?
                WHERE bank_tx_id IN (
                  SELECT id FROM transactions
                  WHERE (LOWER(контрагент) LIKE ? OR LOWER(основание) LIKE ?)
                  ${operation ? 'AND operation = ?' : ''}
                )`).run(scope, kw, kw, ...(operation ? [operation] : []));
    res.json({ updated: r.changes });
  });

  // GET /accounts — списък import sessions + scope_map + статистики
  router.get('/accounts', (req, res) => {
    const settingsRow = db.prepare("SELECT value FROM settings WHERE key='account_scope_map'").get();
    let map = {};
    if (settingsRow) { try { map = JSON.parse(settingsRow.value); } catch {} }

    const sessions = db.prepare(`
      SELECT s.id, s.filename, s.tx_count, s.month_from, s.month_to,
             s.account_iban, s.account_scope, s.imported_at,
             SUM(CASE WHEN t.scope='personal' THEN 1 ELSE 0 END) AS tx_personal,
             SUM(CASE WHEN t.scope='business' THEN 1 ELSE 0 END) AS tx_business,
             COUNT(t.id) AS tx_actual
      FROM import_sessions s
      LEFT JOIN transactions t ON t.session_id = s.id
      GROUP BY s.id
      ORDER BY s.imported_at DESC
      LIMIT 50
    `).all();

    const byScope = db.prepare(`
      SELECT scope, COUNT(*) AS count
      FROM transactions
      GROUP BY scope
    `).all();

    res.json({
      account_scope_map: map,
      sessions,
      tx_by_scope: byScope,
    });
  });

  // POST /accounts/mark-and-rebuild
  // Body: { session_id?, iban?, scope }
  // - Ако е подаден session_id → update всички tx-те от тази сесия.
  // - Ако е подаден IBAN → update сесии с този account_iban + запазва в map.
  // - Винаги rebuild-ва personal_income накрая.
  router.post('/accounts/mark-and-rebuild', (req, res) => {
    const { session_id, iban, scope } = req.body || {};
    if (!['personal','business'].includes(scope)) {
      return res.status(400).json({ error: 'scope: personal | business' });
    }
    if (!session_id && !iban) {
      return res.status(400).json({ error: 'session_id или iban е задължителен' });
    }

    let txUpdated = 0;
    let expUpdated = 0;

    if (session_id) {
      const r = db.prepare(`UPDATE transactions SET scope = ? WHERE session_id = ?`).run(scope, Number(session_id));
      txUpdated += r.changes;
      const e = db.prepare(`UPDATE expense_invoices SET scope = ?
                            WHERE bank_tx_id IN (SELECT id FROM transactions WHERE session_id = ?)`).run(scope, Number(session_id));
      expUpdated += e.changes;
      // Маркирай и самата сесия
      db.prepare(`UPDATE import_sessions SET account_scope = ? WHERE id = ?`).run(scope, Number(session_id));
    }

    let savedIban = null;
    if (iban) {
      const ibanUp = String(iban).replace(/\s+/g, '').toUpperCase();
      savedIban = ibanUp;
      // Запази в settings
      const settingsRow = db.prepare("SELECT value FROM settings WHERE key='account_scope_map'").get();
      let map = {};
      if (settingsRow) { try { map = JSON.parse(settingsRow.value); } catch {} }
      map[ibanUp] = scope;
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('account_scope_map', ?)`).run(JSON.stringify(map));

      // Update сесии с този IBAN
      const sessIds = db.prepare(`SELECT id FROM import_sessions WHERE account_iban = ?`).all(ibanUp).map(s => s.id);
      for (const sid of sessIds) {
        const r = db.prepare(`UPDATE transactions SET scope = ? WHERE session_id = ?`).run(scope, sid);
        txUpdated += r.changes;
        const e = db.prepare(`UPDATE expense_invoices SET scope = ?
                              WHERE bank_tx_id IN (SELECT id FROM transactions WHERE session_id = ?)`).run(scope, sid);
        expUpdated += e.changes;
        db.prepare(`UPDATE import_sessions SET account_scope = ? WHERE id = ?`).run(scope, sid);
      }
    }

    // Rebuild personal_income
    const ktRows = db.prepare(`
      SELECT t.* FROM transactions t
      WHERE t.operation = 'Кт'
        AND t.scope = 'personal'
        AND t.категория IN ('заплата','управление','наем','sky_capital','лихва_болгар')
        AND NOT EXISTS (SELECT 1 FROM personal_income pi WHERE pi.bank_tx_id = t.id)
    `).all();
    const insertPi = db.prepare(`INSERT INTO personal_income
      (дата, тип, сума, валута, източник, бележка, bank_tx_id) VALUES (?,?,?,?,?,?,?)`);
    let createdIncome = 0;
    for (const t of ktRows) {
      let pincomeType = 'друго';
      if (t.категория === 'заплата')         pincomeType = 'заплата';
      else if (t.категория === 'управление') pincomeType = 'управление';
      else if (t.категория === 'sky_capital') pincomeType = 'sky_capital';
      else if (t.категория === 'лихва_болгар') pincomeType = 'лихва_болгар';
      insertPi.run(t.дата, pincomeType, t.сума, t.currency || 'EUR',
                   t.контрагент || '', t.основание || '', t.id);
      createdIncome++;
    }

    res.json({
      scope_set: scope,
      iban: savedIban,
      session_id: session_id || null,
      tx_updated: txUpdated,
      expense_invoices_updated: expUpdated,
      personal_income_created: createdIncome,
    });
  });

  // GET /accounts/balances → live computed балас per IBAN.
  // Алгоритъм:
  //  1. За всеки известен IBAN (от import_sessions) намери най-ранния session с
  //     opening_balance → опорна точка.
  //  2. Sum-вай Кт и Дт от ВСИЧКИ tx-те в сесии за този IBAN с дата >= опорната.
  //  3. balance = opening + Σ Кт − Σ Дт.
  //
  // Ако няма session с opening_balance → fallback към latest closing_balance.
  // Ако и това няма → 0 + поле needs_baseline=true (UI ще покаже бутон Корекция).
  router.get('/accounts/balances', (req, res) => {
    const allSessions = db.prepare(`
      SELECT id, account_iban, account_scope, account_currency,
             opening_balance, closing_balance, month_from, month_to,
             imported_at, filename
      FROM import_sessions
      WHERE account_iban IS NOT NULL
      ORDER BY month_from ASC, imported_at ASC
    `).all();

    // Group sessions by IBAN
    const byIban = new Map();
    for (const s of allSessions) {
      if (!byIban.has(s.account_iban)) byIban.set(s.account_iban, []);
      byIban.get(s.account_iban).push(s);
    }

    // Manual baseline overrides от settings.account_baseline (JSON: {iban: {opening, as_of}})
    const baselineRow = db.prepare("SELECT value FROM settings WHERE key='account_baseline'").get();
    let baselines = {};
    if (baselineRow) { try { baselines = JSON.parse(baselineRow.value); } catch {} }

    const accounts = [];
    for (const [iban, sessions] of byIban) {
      const latestSession = sessions[sessions.length - 1];
      const earliestWithOpening = sessions.find(s => s.opening_balance != null);
      const manualBaseline = baselines[iban];

      let opening = null;
      let asOfDate = null;
      let opSource = null;
      if (manualBaseline?.opening != null) {
        opening = Number(manualBaseline.opening);
        asOfDate = manualBaseline.as_of || sessions[0]?.month_from;
        opSource = 'manual';
      } else if (earliestWithOpening) {
        opening = Number(earliestWithOpening.opening_balance);
        asOfDate = earliestWithOpening.month_from || `${earliestWithOpening.month_from}-01`;
        opSource = 'pdf_opening';
      } else if (latestSession.closing_balance != null) {
        opening = Number(latestSession.closing_balance);
        asOfDate = latestSession.month_to;
        opSource = 'pdf_closing_fallback';
      }

      let balance = opening;
      let lastTxDate = asOfDate;
      let txCount = 0;
      if (opening !== null && opSource !== 'pdf_closing_fallback') {
        const sessIds = sessions.map(s => s.id);
        const placeholders = sessIds.map(() => '?').join(',');
        // ВАЖНО: ползваме дата > as_of (не >=), за да третираме baseline като
        // "балансът в края на as_of date" — tx-те ON as_of date вече са включени
        // в baseline и не се броят втори път. За PDF opening (typically date на
        // statement start) използваме >= за да броим включително тази дата.
        const cmp = opSource === 'manual' ? '>' : '>=';
        const sumRow = db.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN operation='Кт' THEN сума ELSE 0 END), 0) AS kt,
            COALESCE(SUM(CASE WHEN operation='Дт' THEN сума ELSE 0 END), 0) AS dt,
            COUNT(*) AS cnt,
            MAX(дата) AS last_date
          FROM transactions
          WHERE session_id IN (${placeholders})
            AND дата ${cmp} ?
        `).get(...sessIds, asOfDate || '1970-01-01');
        balance = opening + (Number(sumRow.kt) || 0) - (Number(sumRow.dt) || 0);
        lastTxDate = sumRow.last_date || asOfDate;
        txCount = sumRow.cnt;
      }

      accounts.push({
        iban,
        scope: latestSession.account_scope,
        currency: latestSession.account_currency || 'EUR',
        balance: balance !== null ? Number(balance.toFixed(2)) : null,
        opening: opening !== null ? Number(opening.toFixed(2)) : null,
        opening_as_of: asOfDate,
        opening_source: opSource,
        as_of: lastTxDate,
        tx_count: txCount,
        needs_baseline: opening === null,
        sessions_count: sessions.length,
      });
    }

    accounts.sort((a, b) => (b.balance || 0) - (a.balance || 0));

    const totals = accounts.reduce((acc, a) => {
      const k = a.scope || 'unknown';
      if (a.balance !== null) acc[k] = (acc[k] || 0) + a.balance;
      return acc;
    }, {});

    res.json({
      акаунти: accounts,
      общо_personal: Number((totals.personal || 0).toFixed(2)),
      общо_business: Number((totals.business || 0).toFixed(2)),
      общо: Number(Object.values(totals).reduce((s, v) => s + v, 0).toFixed(2)),
    });
  });

  // POST /accounts/baseline { iban, opening, as_of }
  // Manual override на началния баланс на сметка. Полезно когато:
  //  - PDF-ите не съдържат opening_balance
  //  - Балансът в системата не съвпада с реалния по сметка → задаваш реалния
  router.post('/accounts/baseline', (req, res) => {
    const { iban, opening, as_of } = req.body || {};
    if (!iban || opening === undefined) {
      return res.status(400).json({ error: 'iban + opening са задължителни' });
    }
    const ibanUp = String(iban).replace(/\s+/g, '').toUpperCase();
    const row = db.prepare("SELECT value FROM settings WHERE key='account_baseline'").get();
    let map = {};
    if (row) { try { map = JSON.parse(row.value); } catch {} }
    map[ibanUp] = { opening: Number(opening), as_of: as_of || new Date().toISOString().slice(0, 10) };
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('account_baseline', ?)`).run(JSON.stringify(map));
    res.json({ ok: true, iban: ibanUp, baseline: map[ibanUp] });
  });

  // GET /last-month → връща последния месец с personal_income или
  // personal expense_invoices. По default за UI picker.
  router.get('/last-month', (req, res) => {
    const lastIncome = db.prepare(`SELECT MAX(strftime('%Y-%m', дата)) AS m FROM personal_income`).get();
    const lastExpense = db.prepare(`SELECT MAX(месец) AS m FROM expense_invoices WHERE scope='personal'`).get();
    const a = lastIncome?.m || '';
    const b = lastExpense?.m || '';
    const last = a > b ? a : b;
    res.json({ месец: last || new Date().toISOString().slice(0, 7) });
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

  // GET /debug/duplicates — намира групи tx с еднаква дата+сума+operation
  // но различен контрагент (потенциално duplicate-нати поради whitespace
  // или вариации в име).
  router.get('/debug/duplicates', (req, res) => {
    const groups = db.prepare(`
      SELECT дата, ROUND(сума,2) AS сума, operation, COUNT(*) AS брой,
             GROUP_CONCAT(id) AS ids,
             GROUP_CONCAT(контрагент, '|') AS contractors,
             GROUP_CONCAT(session_id) AS sessions
      FROM transactions
      WHERE дата IS NOT NULL AND сума > 0
      GROUP BY дата, ROUND(сума, 2), operation
      HAVING COUNT(*) > 1
      ORDER BY сума DESC, дата DESC
      LIMIT 100
    `).all();
    res.json({
      groups,
      total_dup_groups: groups.length,
      total_dup_tx: groups.reduce((s, g) => s + g.брой, 0),
      total_dup_amount: groups.reduce((s, g) => s + g.сума * (g.брой - 1), 0),
    });
  });

  // GET /debug/tx?amount=X&date=Y → tx-те match-ващи сумата/датата
  router.get('/debug/tx', (req, res) => {
    const conds = ['1=1'];
    const params = [];
    if (req.query.amount) {
      conds.push('ABS(сума - ?) < 1');
      params.push(Number(req.query.amount));
    }
    if (req.query.date) {
      conds.push('дата = ?');
      params.push(req.query.date);
    }
    if (req.query.contractor) {
      conds.push('LOWER(контрагент) LIKE ?');
      params.push(`%${req.query.contractor.toLowerCase()}%`);
    }
    const rows = db.prepare(`
      SELECT id, session_id, дата, контрагент, основание, сума, operation,
             категория, scope
      FROM transactions
      WHERE ${conds.join(' AND ')}
      ORDER BY дата DESC, id DESC
      LIMIT 100
    `).all(...params);
    res.json({ count: rows.length, transactions: rows });
  });

  // GET /debug/personal-income → списък личн доходи
  router.get('/debug/personal-income', (req, res) => {
    const rows = db.prepare(`
      SELECT pi.id, pi.дата, pi.тип, pi.сума, pi.валута, pi.източник,
             pi.bank_tx_id, t.контрагент AS tx_контрагент, t.session_id
      FROM personal_income pi
      LEFT JOIN transactions t ON t.id = pi.bank_tx_id
      ORDER BY pi.дата DESC, pi.id DESC
      LIMIT 100
    `).all();
    res.json({ count: rows.length, incomes: rows });
  });

  // POST /debug/fix-loan-amounts
  // Намира tx-те с year-merge bug — основание завършва с "/DD.MM." (truncated,
  // без YY защото е било слято с амоунта). Опитва да намери "сибилинг" tx
  // със същия loan number и правилна сума → ако има, изтрива buggy-то;
  // ако няма, поправя амоунта (приема YY=24 от loan дата).
  router.post('/debug/fix-loan-amounts', (req, res) => {
    const candidates = db.prepare(`
      SELECT id, session_id, дата, сума, основание, контрагент
      FROM transactions
      WHERE operation = 'Дт'
        AND основание LIKE '%ПОГАСЯВАНЕ%'
        AND (
          сума >= 10000
          OR основание GLOB '*/__.__.'
        )
    `).all();

    // Buggy = основание завършва с "/DD.MM." (точка след месеца, без година)
    const buggyRe = /\/(\d{2})\.(\d{2})\.$/;

    const upd = db.prepare('UPDATE transactions SET сума = ? WHERE id = ?');
    const updExp = db.prepare('UPDATE expense_invoices SET amount = ? WHERE bank_tx_id = ?');
    const delTx = db.prepare('DELETE FROM transactions WHERE id = ?');
    const delExp = db.prepare('DELETE FROM expense_invoices WHERE bank_tx_id = ?');
    const findSibling = db.prepare(`
      SELECT id, сума, основание FROM transactions
      WHERE дата = ? AND operation = 'Дт'
        AND основание LIKE ?
        AND id != ?
        AND ABS(сума - ?) < 0.02
    `);

    const fixed = [];
    const deleted = [];

    const doFix = db.transaction(() => {
      for (const tx of candidates) {
        const osn = tx.основание || '';
        const m = osn.match(buggyRe);
        if (!m) continue;
        const dd = m[1], mm = m[2];
        // Predict real amount: assume YY=24 (loans started 2024)
        // wrong = YY*1000 + real → real = wrong - YY*1000
        let realAmount = null;
        for (const yy of [24, 23, 22, 25]) {
          if (tx.сума >= yy * 1000 && tx.сума < (yy + 1) * 1000) {
            realAmount = Number((tx.сума - yy * 1000).toFixed(2));
            break;
          }
        }
        if (realAmount === null) continue;

        // Извлечи loan number от основание (между "902-" и "/")
        const loanM = osn.match(/902-(\d+)/);
        const loanNum = loanM ? loanM[1] : null;

        // Търси sibling с правилна сума и същи loan number
        let sibling = null;
        if (loanNum) {
          sibling = findSibling.get(tx.дата, `%902-${loanNum}%`, tx.id, realAmount);
        }

        if (sibling) {
          // Дубликат → изтрий buggy-то
          delExp.run(tx.id);
          delTx.run(tx.id);
          deleted.push({ id: tx.id, дата: tx.дата, основание: osn.slice(0, 60), сума: tx.сума, sibling_id: sibling.id, sibling_сума: sibling.сума });
        } else {
          // Няма sibling → поправи амоунта
          upd.run(realAmount, tx.id);
          updExp.run(realAmount, tx.id);
          fixed.push({ id: tx.id, дата: tx.дата, основание: osn.slice(0, 60), старо: tx.сума, ново: realAmount });
        }
      }
    });
    doFix();

    res.json({
      fixed_count: fixed.length,
      deleted_count: deleted.length,
      examples_fixed: fixed.slice(0, 5),
      examples_deleted: deleted.slice(0, 5),
      total_correction: fixed.reduce((s, f) => s + (f.старо - f.ново), 0)
                      + deleted.reduce((s, d) => s + d.сума, 0),
    });
  });

  // POST /debug/wipe-imports — изтрива ВСИЧКИ импортирани bank данни.
  // Запазва: settings (включително account_scope_map и custom_categories),
  // tx_rules (заучените правила), properties, contracts, и т.н.
  // Изтрива: transactions, import_sessions, expense_invoices (от bank), personal_income (от bank).
  // ВНИМАНИЕ: Ръчно въведени expense_invoices/personal_income също се трият.
  router.post('/debug/wipe-imports', (req, res) => {
    const counts = {};
    const doWipe = db.transaction(() => {
      counts.personal_income = db.prepare('DELETE FROM personal_income').run().changes;
      counts.expense_invoices = db.prepare('DELETE FROM expense_invoices').run().changes;
      counts.transactions = db.prepare('DELETE FROM transactions').run().changes;
      counts.import_sessions = db.prepare('DELETE FROM import_sessions').run().changes;
    });
    doWipe();
    res.json({ wiped: counts, total: Object.values(counts).reduce((s, v) => s + v, 0) });
  });

  // POST /debug/delete-duplicates — изтрива дубликати (запазва най-стария id)
  // Връща списък изтрити. Преди delete прави cleanup на свързаните
  // personal_income/expense_invoices.
  router.post('/debug/delete-duplicates', (req, res) => {
    const groups = db.prepare(`
      SELECT дата, ROUND(сума,2) AS сума, operation, COUNT(*) AS брой,
             MIN(id) AS keep_id,
             GROUP_CONCAT(id) AS all_ids,
             GROUP_CONCAT(контрагент, '|') AS contractors
      FROM transactions
      WHERE дата IS NOT NULL AND сума > 0
      GROUP BY дата, ROUND(сума, 2), operation
      HAVING COUNT(*) > 1
    `).all();

    const deletedIds = [];
    const doDelete = db.transaction(() => {
      for (const g of groups) {
        const ids = g.all_ids.split(',').map(Number);
        const toDelete = ids.filter(id => id !== g.keep_id);
        for (const id of toDelete) {
          db.prepare('DELETE FROM personal_income WHERE bank_tx_id = ?').run(id);
          db.prepare('DELETE FROM expense_invoices WHERE bank_tx_id = ?').run(id);
          db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
          deletedIds.push(id);
        }
      }
    });
    doDelete();
    res.json({ deleted_count: deletedIds.length, deleted_ids: deletedIds });
  });

  return router;
};

module.exports.INCOME_TYPES = INCOME_TYPES;
