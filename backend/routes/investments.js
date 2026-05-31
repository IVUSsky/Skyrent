// /api/investments — admin module for precious-metals tracking.
// Endpoints are parameterized by :metal (gold | silver | platinum).
// Tenants are blocked; admin/broker only.

const express = require('express');
const { getMetalPriceEUR } = require('../lib/goldPrice');

// Платината е поддържана от helper-а и DB schema-та, но засега не я излагаме
// през UI/cron. За да я върнем: добави 'platinum' в SUPPORTED_METALS + METAL_LABEL_BG
// и съответната пункт в METALS array във frontend.
const SUPPORTED_METALS = ['gold', 'silver'];
const METAL_LABEL_BG = { gold: 'злато', silver: 'сребро', platinum: 'платина' };

module.exports = function(db) {
  const router = express.Router();

  // Admin/broker-only guard
  router.use((req, res, next) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Само за администратори' });
    next();
  });

  // ── Cached current price per metal (avoid hammering APIs) ─────────────────
  const priceCache = {}; // { gold: { value, fetched_at }, silver: {...}, ... }
  const PRICE_TTL = 5 * 60 * 1000; // 5 min

  async function currentPrice(metal) {
    const c = priceCache[metal];
    if (c?.value && Date.now() - c.fetched_at < PRICE_TTL) return c.value;
    const p = await getMetalPriceEUR(metal);
    if (p) {
      priceCache[metal] = { value: p, fetched_at: Date.now() };
      // Opportunistically store in history if no row exists for current hour
      const lastH = db.prepare("SELECT дата FROM gold_price_history WHERE метал=? ORDER BY id DESC LIMIT 1").get(metal);
      const needWrite = !lastH || (Date.now() - new Date(lastH.дата).getTime()) > 55 * 60 * 1000;
      if (needWrite) {
        try {
          db.prepare("INSERT INTO gold_price_history (метал, цена_usd, цена_eur, промяна_24h) VALUES (?,?,?,?)")
            .run(metal, p.usd || null, p.eur || null, p.change24h || 0);
        } catch (_) {}
      }
    }
    return priceCache[metal]?.value || null;
  }

  function validateMetal(req, res, next) {
    const m = (req.params.metal || '').toLowerCase();
    if (!SUPPORTED_METALS.includes(m)) {
      return res.status(400).json({ error: `Невалиден метал: ${m}. Позволени: ${SUPPORTED_METALS.join(', ')}` });
    }
    req.metal = m;
    next();
  }

  // ── current price ────────────────────────────────────────────────────────
  router.get('/:metal/price', validateMetal, async (req, res) => {
    const p = await currentPrice(req.metal);
    if (!p) return res.status(502).json({ error: `Цената на ${METAL_LABEL_BG[req.metal]} не е достъпна` });
    res.json({
      метал:        req.metal,
      цена_usd:     p.usd,
      цена_eur:     p.eur,
      промяна_24h:  p.change24h,
      източник:     p.source,
      обновено:     new Date(priceCache[req.metal].fetched_at).toISOString(),
    });
  });

  // ── price history ────────────────────────────────────────────────────────
  router.get('/:metal/price-history', validateMetal, (req, res) => {
    const days = Math.min(365, Number(req.query.days) || 30);
    const rows = db.prepare(`
      SELECT id, дата, цена_eur, цена_usd, промяна_24h
      FROM gold_price_history
      WHERE метал=? AND дата >= datetime('now', ?)
      ORDER BY дата ASC
    `).all(req.metal, `-${days} days`);
    res.json(rows);
  });

  // ── portfolio summary ────────────────────────────────────────────────────
  router.get('/:metal/portfolio', validateMetal, async (req, res) => {
    const txs = db.prepare('SELECT * FROM gold_investments WHERE метал=? ORDER BY дата ASC, id ASC').all(req.metal);
    let totalOz = 0, totalInvested = 0, totalBuyOz = 0, totalBuyCost = 0, totalSellOz = 0, totalSellProceeds = 0;
    for (const t of txs) {
      if (t.тип === 'покупка') {
        totalOz       += Number(t.количество);
        totalBuyOz    += Number(t.количество);
        totalBuyCost  += Number(t.обща_сума);
        totalInvested += Number(t.обща_сума);
      } else if (t.тип === 'продажба') {
        totalOz           -= Number(t.количество);
        totalSellOz       += Number(t.количество);
        totalSellProceeds += Number(t.обща_сума);
        totalInvested     -= Number(t.обща_сума);
      }
    }
    const avgBuyPrice = totalBuyOz > 0 ? (totalBuyCost / totalBuyOz) : 0;
    const price = await currentPrice(req.metal);
    const currentPriceEur = price?.eur || null;
    const currentValue = currentPriceEur ? totalOz * currentPriceEur : null;
    const profit = currentValue !== null ? (currentValue - totalInvested) : null;
    const profitPct = (currentValue !== null && totalInvested > 0) ? ((profit / totalInvested) * 100) : null;
    res.json({
      метал:                req.metal,
      общо_oz:              Number(totalOz.toFixed(4)),
      средна_цена:          Number(avgBuyPrice.toFixed(2)),
      текуща_цена:          currentPriceEur ? Number(currentPriceEur.toFixed(2)) : null,
      обща_инвестиция:      Number(totalInvested.toFixed(2)),
      текуща_стойност:      currentValue !== null ? Number(currentValue.toFixed(2)) : null,
      печалба_eur:          profit !== null ? Number(profit.toFixed(2)) : null,
      печалба_pct:          profitPct !== null ? Number(profitPct.toFixed(2)) : null,
      брой_сделки:          txs.length,
      общо_купено_oz:       Number(totalBuyOz.toFixed(4)),
      общо_продадено_oz:    Number(totalSellOz.toFixed(4)),
      реализирана_печалба:  totalSellOz > 0 ? Number((totalSellProceeds - (avgBuyPrice * totalSellOz)).toFixed(2)) : 0,
    });
  });

  // ── transactions list ────────────────────────────────────────────────────
  router.get('/:metal/transactions', validateMetal, (req, res) => {
    res.json(db.prepare('SELECT * FROM gold_investments WHERE метал=? ORDER BY дата DESC, id DESC').all(req.metal));
  });

  // ── create transaction ───────────────────────────────────────────────────
  router.post('/:metal/transactions', validateMetal, (req, res) => {
    const b = req.body || {};
    const missing = ['дата','тип','количество','цена_eur'].find(k => b[k] === undefined || b[k] === '');
    if (missing) return res.status(400).json({ error: `Поле "${missing}" е задължително` });
    if (!['покупка','продажба'].includes(b.тип)) {
      return res.status(400).json({ error: 'тип трябва да е "покупка" или "продажба"' });
    }
    const qty   = Number(b.количество);
    const price = Number(b.цена_eur);
    const total = b.обща_сума !== undefined ? Number(b.обща_сума) : Number((qty * price).toFixed(2));
    const r = db.prepare(`
      INSERT INTO gold_investments
        (метал, дата, тип, количество, цена_eur, обща_сума, доставчик, продукт, сертификат, съхранение, бележка)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      req.metal, b.дата, b.тип, qty, price, total,
      b.доставчик || '', b.продукт || '', b.сертификат || '',
      b.съхранение || 'home', b.бележка || ''
    );
    res.status(201).json({ id: r.lastInsertRowid });
  });

  router.put('/:metal/transactions/:id', validateMetal, (req, res) => {
    const existing = db.prepare('SELECT * FROM gold_investments WHERE id=? AND метал=?').get(req.params.id, req.metal);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const set = (k) => b[k] !== undefined ? b[k] : existing[k];
    const qty   = b.количество !== undefined ? Number(b.количество) : existing.количество;
    const price = b.цена_eur   !== undefined ? Number(b.цена_eur)   : existing.цена_eur;
    const total = b.обща_сума  !== undefined ? Number(b.обща_сума)  : Number((qty * price).toFixed(2));
    db.prepare(`
      UPDATE gold_investments
      SET дата=?, тип=?, количество=?, цена_eur=?, обща_сума=?,
          доставчик=?, продукт=?, сертификат=?, съхранение=?, бележка=?
      WHERE id=?
    `).run(
      set('дата'), set('тип'), qty, price, total,
      set('доставчик'), set('продукт'), set('сертификат'),
      set('съхранение'), set('бележка'),
      req.params.id
    );
    res.json({ ok: true });
  });

  router.delete('/:metal/transactions/:id', validateMetal, (req, res) => {
    db.prepare('DELETE FROM gold_investments WHERE id=? AND метал=?').run(req.params.id, req.metal);
    res.json({ ok: true });
  });

  // ── Import from expense_invoices ─────────────────────────────────────────
  // Lists candidate expenses for the given metal: rows tagged as
  // 'инвестиция' or 'благородни метали' AND whose supplier_name/reason
  // contains a keyword for that metal, AND not yet imported.
  const METAL_KEYWORDS = {
    gold:   ['злато', 'gold', 'au ', 'au,', '(au)', 'aurum', 'tavex', 'igold'],
    silver: ['сребро', 'silver', 'ag ', 'ag,', '(ag)', 'argentum'],
  };

  router.get('/:metal/expense-candidates', validateMetal, (req, res) => {
    const expenses = db.prepare(`
      SELECT ei.*
      FROM expense_invoices ei
      WHERE ei.expense_category IN ('инвестиция', 'благородни метали')
        AND ei.id NOT IN (SELECT source_expense_id FROM gold_investments WHERE source_expense_id IS NOT NULL)
      ORDER BY COALESCE(ei.invoice_date, ei.created_at) DESC
    `).all();

    const keywords = METAL_KEYWORDS[req.metal] || [];
    // If no keywords match, still allow admin to import (returns all candidates)
    const filtered = expenses.map(e => {
      const haystack = `${e.supplier_name || ''} ${e.reason || ''}`.toLowerCase();
      const matched = keywords.some(k => haystack.includes(k));
      return { ...e, _metal_match: matched };
    });

    // Sort: matched first, then by date desc
    filtered.sort((a, b) => {
      if (a._metal_match !== b._metal_match) return b._metal_match - a._metal_match;
      return 0;
    });

    res.json(filtered);
  });

  // POST /:metal/import-from-expense
  // Body: { expense_id, количество, продукт?, доставчик?, сертификат?, съхранение?, бележка? }
  // Date/amount come from the expense; admin supplies quantity (oz) so we can
  // compute unit price. Links source_expense_id so the expense can't be
  // re-imported.
  router.post('/:metal/import-from-expense', validateMetal, (req, res) => {
    const b = req.body || {};
    const expenseId = Number(b.expense_id);
    const qty = Number(b.количество);
    if (!expenseId) return res.status(400).json({ error: 'expense_id е задължителен' });
    if (!qty || qty <= 0) return res.status(400).json({ error: 'количество (oz) е задължително и > 0' });

    const expense = db.prepare('SELECT * FROM expense_invoices WHERE id=?').get(expenseId);
    if (!expense) return res.status(404).json({ error: 'Разходът не е намерен' });

    const already = db.prepare('SELECT id FROM gold_investments WHERE source_expense_id=?').get(expenseId);
    if (already) return res.status(400).json({ error: `Разходът вече е импортиран като сделка #${already.id}` });

    const total = Number(expense.amount) || 0;
    if (total <= 0) return res.status(400).json({ error: 'Разходът няма валидна сума' });
    const unitPrice = Number((total / qty).toFixed(2));
    const date = expense.invoice_date || expense.месец || new Date().toISOString().slice(0, 10);

    const r = db.prepare(`
      INSERT INTO gold_investments
        (метал, дата, тип, количество, цена_eur, обща_сума, доставчик, продукт, сертификат, съхранение, бележка, source_expense_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      req.metal, date, 'покупка', qty, unitPrice, total,
      b.доставчик || expense.supplier_name || '',
      b.продукт   || '',
      b.сертификат|| expense.invoice_number || '',
      b.съхранение|| 'home',
      b.бележка   || (expense.reason ? `Импорт от разход #${expenseId}: ${expense.reason}` : `Импорт от разход #${expenseId}`),
      expenseId
    );
    res.status(201).json({ id: r.lastInsertRowid, цена_eur: unitPrice, обща_сума: total });
  });

  // ── alerts ───────────────────────────────────────────────────────────────
  router.get('/:metal/alerts', validateMetal, (req, res) => {
    res.json(db.prepare('SELECT * FROM gold_alerts WHERE метал=? ORDER BY created_at DESC').all(req.metal));
  });

  router.post('/:metal/alerts', validateMetal, (req, res) => {
    const b = req.body || {};
    if (!b.цена_eur || !b.посока) return res.status(400).json({ error: 'цена_eur и посока са задължителни' });
    if (!['под','над'].includes(b.посока)) return res.status(400).json({ error: 'посока: "под" или "над"' });
    const r = db.prepare(`
      INSERT INTO gold_alerts (метал, цена_eur, посока, количество_oz, съобщение, активна)
      VALUES (?,?,?,?,?,?)
    `).run(
      req.metal, Number(b.цена_eur), b.посока,
      b.количество_oz ? Number(b.количество_oz) : null,
      b.съобщение || '',
      b.активна !== undefined ? (b.активна ? 1 : 0) : 1
    );
    res.status(201).json({ id: r.lastInsertRowid });
  });

  router.put('/:metal/alerts/:id', validateMetal, (req, res) => {
    const existing = db.prepare('SELECT * FROM gold_alerts WHERE id=? AND метал=?').get(req.params.id, req.metal);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    db.prepare(`
      UPDATE gold_alerts
      SET цена_eur=?, посока=?, количество_oz=?, съобщение=?, активна=?,
          задействана=?, задействана_на=?
      WHERE id=?
    `).run(
      b.цена_eur !== undefined ? Number(b.цена_eur) : existing.цена_eur,
      b.посока ?? existing.посока,
      b.количество_oz !== undefined ? (b.количество_oz ? Number(b.количество_oz) : null) : existing.количество_oz,
      b.съобщение ?? existing.съобщение,
      b.активна !== undefined ? (b.активна ? 1 : 0) : existing.активна,
      b.задействана !== undefined ? (b.задействана ? 1 : 0) : existing.задействана,
      b.задействана_на ?? existing.задействана_на,
      req.params.id
    );
    res.json({ ok: true });
  });

  router.delete('/:metal/alerts/:id', validateMetal, (req, res) => {
    db.prepare('DELETE FROM gold_alerts WHERE id=? AND метал=?').run(req.params.id, req.metal);
    res.json({ ok: true });
  });

  // ── reports ─────────────────────────────────────────────────────────────
  router.get('/reports', (req, res) => {
    const limit = Math.min(50, Number(req.query.limit) || 12);
    const metal = req.query.metal;
    if (metal && SUPPORTED_METALS.includes(metal)) {
      res.json(db.prepare('SELECT id, метал, месец, тип, created_at FROM investment_reports WHERE метал=? OR метал=? ORDER BY created_at DESC LIMIT ?').all(metal, 'all', limit));
    } else {
      res.json(db.prepare('SELECT id, метал, месец, тип, created_at FROM investment_reports ORDER BY created_at DESC LIMIT ?').all(limit));
    }
  });

  router.get('/reports/:id', (req, res) => {
    const r = db.prepare('SELECT * FROM investment_reports WHERE id=?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(r);
  });

  // ── AI Market Agent ──────────────────────────────────────────────────────
  // GET /agent/signals — recent signals list (optionally filter by metal)
  router.get('/agent/signals', (req, res) => {
    const limit = Math.min(100, Number(req.query.limit) || 30);
    const metal = req.query.metal;
    let sql = `SELECT id, дата, метал, сигнал, уверенност, обоснование, цена_eur, действие_препоръка, email_sent
               FROM agent_signals`;
    const params = [];
    if (metal && SUPPORTED_METALS.includes(metal)) {
      sql += ' WHERE метал=?';
      params.push(metal);
    }
    sql += ' ORDER BY дата DESC LIMIT ?';
    params.push(limit);
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/agent/signals/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM agent_signals WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  // POST /agent/analyze — manually trigger an analysis for a metal
  // Body: { метал: gold|silver }
  router.post('/agent/analyze', async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY не е конфигуриран' });
    const metal = (req.body?.метал || req.body?.metal || 'gold').toLowerCase();
    if (!SUPPORTED_METALS.includes(metal)) {
      return res.status(400).json({ error: `Невалиден метал: ${metal}` });
    }
    try {
      const { runAgent } = require('../lib/newsAgent');
      const result = await runAgent(db, metal);
      res.json(result);
    } catch (err) {
      console.error('Agent error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /report — body { тип: weekly|monthly|alert, метал: gold|silver|platinum|all }
  router.post('/report', async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY не е конфигуриран' });
    const reportType = (req.body?.тип || 'monthly').toLowerCase();
    const metal      = (req.body?.метал || 'all').toLowerCase();
    if (metal !== 'all' && !SUPPORTED_METALS.includes(metal)) {
      return res.status(400).json({ error: 'метал: gold | silver | platinum | all' });
    }
    try {
      const result = await buildReport(db, reportType, metal);
      res.json(result);
    } catch (err) {
      console.error('Investment report error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Broker: Trading 212 (POC) ────────────────────────────────────────────
  // Read-only proxy към T212 REST API. Изисква T212_API_KEY в env.
  // Кешираме per-endpoint в lib/trading212.js за да не удряме rate limits.
  const t212 = require('../lib/trading212');

  router.get('/broker/t212/status', (req, res) => {
    res.json({ configured: t212.isConfigured(), base_url: process.env.T212_BASE_URL || 'https://live.trading212.com/api/v0' });
  });

  router.get('/broker/t212/account', async (req, res) => {
    try {
      const [info, cash] = await Promise.all([t212.getAccountInfo(), t212.getCash()]);
      res.json({
        акаунт_id:        info.id,
        валута:           info.currencyCode,
        кеш_свободен:     cash.free,
        кеш_общо:         cash.total,
        инвестирано:      cash.invested,
        блокиран:         cash.blocked,
        нереализирана_пл: cash.ppl,
        резултат:         cash.result,
        кеш_кеширан:      cash._cached,
        кеш_възраст_ms:   cash._age_ms,
      });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // ── Net Worth: aggregates properties + metals + T212 ─────────────────────
  router.get('/wealth/summary', async (req, res) => {
    try {
      // Properties
      const properties = db.prepare('SELECT * FROM properties').all();
      const loans = db.prepare('SELECT * FROM loans').all();
      const property_asset = properties.reduce((s, p) => {
        const v = p.market_val != null && p.market_val > 0 ? p.market_val : (p['покупна'] || 0) + (p['ремонт'] || 0);
        return s + v;
      }, 0);
      const property_debt = loans.reduce((s, l) => s + (l['остатък'] || 0), 0);
      const property_equity = property_asset - property_debt;
      const property_invested = properties.reduce((s, p) => s + (p['покупна'] || 0) + (p['ремонт'] || 0), 0);

      // Metals: gold + silver portfolios
      const gold = computePortfolioSnapshot(db, 'gold');
      const silver = computePortfolioSnapshot(db, 'silver');

      // T212: prefer fresh cash + portfolio; fall back to latest snapshot
      let t212Data = null;
      if (t212.isConfigured()) {
        try {
          const [info, cash, pf] = await Promise.all([t212.getAccountInfo(), t212.getCash(), t212.getPortfolio()]);
          const positions = pf.items || [];
          const invested = positions.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.averagePrice) || 0), 0);
          const value = positions.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.currentPrice) || 0), 0);
          t212Data = {
            валута: info.currencyCode,
            обща_стойност: Number((cash.total || 0).toFixed(2)),  // NAV
            кеш_свободен: Number((cash.free || 0).toFixed(2)),
            блокиран: Number((cash.blocked || 0).toFixed(2)),
            инвестирано: Number(invested.toFixed(2)),
            позиции_стойност: Number(value.toFixed(2)),
            печалба: Number((value - invested).toFixed(2)),
            брой_позиции: positions.length,
            източник: 'live',
          };
        } catch (err) {
          const last = db.prepare('SELECT * FROM t212_snapshots ORDER BY дата DESC LIMIT 1').get();
          if (last) {
            t212Data = {
              валута: last.валута,
              обща_стойност: last.кеш_общо,
              кеш_свободен: last.кеш_свободен,
              блокиран: last.блокиран,
              инвестирано: last.инвестирано,
              позиции_стойност: last.текуща_стойност,
              печалба: last.печалба,
              брой_позиции: last.брой_позиции,
              източник: 'snapshot',
              snapshot_date: last.дата,
              live_error: err.message,
            };
          } else {
            t212Data = { error: err.message };
          }
        }
      }

      // Totals
      const metals_value = (gold.текуща_стойност || 0) + (silver.текуща_стойност || 0);
      const t212_value = t212Data?.обща_стойност || 0;
      const total_wealth = property_equity + metals_value + t212_value;

      // Allocation %
      const allocation = total_wealth > 0 ? {
        имоти_equity: Number(((property_equity / total_wealth) * 100).toFixed(2)),
        злато:        Number((((gold.текуща_стойност || 0) / total_wealth) * 100).toFixed(2)),
        сребро:       Number((((silver.текуща_стойност || 0) / total_wealth) * 100).toFixed(2)),
        t212:         Number(((t212_value / total_wealth) * 100).toFixed(2)),
      } : null;

      res.json({
        общо: Number(total_wealth.toFixed(2)),
        валута: 'EUR',
        разпределение: allocation,
        имоти: {
          asset_value: Number(property_asset.toFixed(2)),
          debt:        Number(property_debt.toFixed(2)),
          equity:      Number(property_equity.toFixed(2)),
          инвестирано: Number(property_invested.toFixed(2)),
          брой:        properties.length,
        },
        злато:  gold,
        сребро: silver,
        t212:   t212Data,
        изчислено_на: new Date().toISOString(),
      });
    } catch (err) {
      console.error('wealth/summary error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/broker/t212/history', (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 90));
    const rows = db.prepare(`
      SELECT id, дата, валута, кеш_общо, кеш_свободен, блокиран,
             инвестирано, текуща_стойност, печалба, печалба_pct, брой_позиции
      FROM t212_snapshots
      WHERE дата >= datetime('now', ?)
      ORDER BY дата ASC
    `).all(`-${days} days`);
    res.json(rows);
  });

  router.post('/broker/t212/snapshot', async (req, res) => {
    try {
      const id = await t212.takeSnapshot(db);
      if (!id) return res.status(502).json({ error: 'Snapshot не успя — провери T212 ключа' });
      const row = db.prepare('SELECT * FROM t212_snapshots WHERE id=?').get(id);
      res.status(201).json(row);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  router.get('/broker/t212/orders', async (req, res) => {
    try {
      const data = await t212.getOrders();
      const items = (data.value || data.items || []).map(o => ({
        id:           o.id,
        тикер:        o.ticker,
        име:          o.instrument?.name || o.ticker,
        isin:         o.instrument?.isin || null,
        страна:       o.side,                // BUY / SELL
        тип:          o.type,                // MARKET / LIMIT / STOP / ...
        статус:       o.status,              // NEW / PARTIALLY_FILLED / ...
        стойност:     o.value,
        изпълнено:    o.filledValue,
        валута:       o.currency,
        създадена:    o.createdAt,
        от_източник:  o.initiatedFrom,
      }));
      res.json({ брой: items.length, поръчки: items, кеширан: data._cached, възраст_ms: data._age_ms });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  router.get('/broker/t212/portfolio', async (req, res) => {
    try {
      const [pf, info] = await Promise.all([t212.getPortfolio(), t212.getAccountInfo()]);
      const positions = (pf.items || []).map(p => {
        const qty = Number(p.quantity) || 0;
        const avg = Number(p.averagePrice) || 0;
        const cur = Number(p.currentPrice) || 0;
        const invested = qty * avg;
        const value = qty * cur;
        const profit = value - invested;
        const profitPct = invested > 0 ? (profit / invested) * 100 : 0;
        return {
          тикер:            p.ticker,
          количество:       qty,
          средна_цена:      avg,
          текуща_цена:      cur,
          инвестирано:      Number(invested.toFixed(2)),
          текуща_стойност:  Number(value.toFixed(2)),
          печалба:          Number(profit.toFixed(2)),
          печалба_pct:      Number(profitPct.toFixed(2)),
          ppl:              p.ppl,
          fx_ppl:           p.fxPpl,
          в_pie:            !!p.pieQuantity,
          начална_сделка:   p.initialFillDate,
        };
      });
      positions.sort((a, b) => b.текуща_стойност - a.текуща_стойност);
      const totals = positions.reduce((acc, p) => {
        acc.инвестирано     += p.инвестирано;
        acc.текуща_стойност += p.текуща_стойност;
        acc.печалба         += p.печалба;
        return acc;
      }, { инвестирано: 0, текуща_стойност: 0, печалба: 0 });
      totals.печалба_pct = totals.инвестирано > 0 ? Number(((totals.печалба / totals.инвестирано) * 100).toFixed(2)) : 0;
      totals.инвестирано     = Number(totals.инвестирано.toFixed(2));
      totals.текуща_стойност = Number(totals.текуща_стойност.toFixed(2));
      totals.печалба         = Number(totals.печалба.toFixed(2));
      res.json({
        валута:       info.currencyCode,
        брой_позиции: positions.length,
        общо:         totals,
        позиции:      positions,
        кеширан:      pf._cached,
        възраст_ms:   pf._age_ms,
      });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // ── Back-compat aliases for old /gold/* URLs (frontend still calls them
  // during the transitional period) ────────────────────────────────────────
  router.get('/gold/reports', (req, res, next) => {
    req.url = '/reports?metal=gold';
    router.handle(req, res, next);
  });

  return router;
};

// ── Helpers exported for cron + ad-hoc endpoint ──────────────────────────
async function buildReport(db, reportType, metal = 'all') {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.default
    ? new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })
    : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const metalsToCover = metal === 'all' ? SUPPORTED_METALS : [metal];
  const portfolios = {};
  const histories = {};
  for (const m of metalsToCover) {
    portfolios[m] = computePortfolioSnapshot(db, m);
    histories[m] = db.prepare(`
      SELECT дата, цена_eur, промяна_24h
      FROM gold_price_history
      WHERE метал=? AND дата >= datetime('now', ?)
      ORDER BY дата ASC
    `).all(m, reportType === 'weekly' ? '-14 days' : '-90 days');
  }

  const propertyMetrics = db.prepare(`
    SELECT SUM(наем) AS total_rent,
           COUNT(CASE WHEN статус='✅' THEN 1 END) AS active,
           COUNT(*) AS total
    FROM properties
  `).get();
  const loans = db.prepare(`SELECT SUM(остатък) AS debt, SUM(вноска) AS monthly FROM loans`).get();

  const periodName = reportType === 'weekly'
    ? `седмично резюме (${new Date().toLocaleDateString('bg-BG')})`
    : reportType === 'alert'
      ? `алармен анализ (${new Date().toLocaleDateString('bg-BG')})`
      : `${new Date().toLocaleDateString('bg-BG', { month:'long', year:'numeric' })}`;

  const metalsSection = metalsToCover.map(m => {
    const p = portfolios[m];
    const hist = histories[m];
    return `
ПОРТФЕЙЛ — ${METAL_LABEL_BG[m].toUpperCase()}:
- Притежавани: ${p.общо_oz} troy oz.
- Средна покупна цена: €${p.средна_цена.toFixed(0)}/oz.
- Текуща цена: €${p.текуща_цена !== null ? p.текуща_цена.toFixed(0) : 'неизвестна'}/oz.
- Обща инвестиция: €${p.обща_инвестиция.toFixed(0)}.
- Текуща стойност: €${p.текуща_стойност !== null ? p.текуща_стойност.toFixed(0) : 'неизвестна'}.
- Печалба: €${p.печалба_eur !== null ? p.печалба_eur.toFixed(0) : 'n/a'} (${p.печалба_pct !== null ? p.печалба_pct.toFixed(1) + '%' : 'n/a'}).

Движение на цената (${hist.length} наблюдения):
${hist.slice(-15).map(r => `- ${new Date(r.дата).toISOString().slice(0,10)}: €${Number(r.цена_eur).toFixed(0)}`).join('\n') || '— няма данни'}`;
  }).join('\n');

  const prompt = `Ти си финансов анализатор на портфейла на Иво Лазаров (Sky Capital OOD).
Генерирай ${reportType === 'weekly' ? 'седмично' : reportType === 'alert' ? 'алармено' : 'месечно'} инвестиционно резюме за ${periodName}${metal !== 'all' ? ` — фокус: ${METAL_LABEL_BG[metal]}` : ' — всички метали'}.

ПОРТФЕЙЛ — ИМОТИ:
- Месечни наеми (активни): €${(propertyMetrics?.total_rent || 0).toFixed(0)} от ${propertyMetrics?.active || 0}/${propertyMetrics?.total || 0} имота.
- Общ дълг по кредити: €${(loans?.debt || 0).toFixed(0)}.
- Месечни вноски: €${(loans?.monthly || 0).toFixed(0)}.
- Нетен месечен cash-flow от наеми: €${((propertyMetrics?.total_rent || 0) - (loans?.monthly || 0)).toFixed(0)}.
${metalsSection}

Очаквам кратък структуриран markdown отговор (на български):

### 📊 Резюме
1-2 изречения за състоянието.

### 🥇 Анализ по метал
За всеки метал: тенденция (нагоре/надолу/странично), сравнение спрямо средната покупна цена, препоръка (купувай/задръж/частична реализация).

${metal === 'all' ? '### ⚖️ Диверсификация\nКоментар как се разпределя капиталът между трите метала.\n' : ''}

### 🏠 Контекст от имотите
Накратко как cash-flow от наеми се отнася към инвестициите.

### 💡 Конкретна следваща стъпка
Едно конкретно действие за следващия период.

Не повече от ${metal === 'all' ? 400 : 300} думи. Конкретен, без вода.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (response.content?.[0]?.text || '').trim();

  const r = db.prepare(`
    INSERT INTO investment_reports (метал, месец, тип, съдържание, данни)
    VALUES (?,?,?,?,?)
  `).run(
    metal,
    new Date().toISOString().slice(0, 7),
    reportType,
    text,
    JSON.stringify({ portfolios, propertyMetrics, loans })
  );

  return { id: r.lastInsertRowid, тип: reportType, метал: metal, съдържание: text };
}

function computePortfolioSnapshot(db, metal = 'gold') {
  const txs = db.prepare('SELECT * FROM gold_investments WHERE метал=? ORDER BY дата ASC, id ASC').all(metal);
  let totalOz = 0, totalInvested = 0, totalBuyOz = 0, totalBuyCost = 0;
  for (const t of txs) {
    if (t.тип === 'покупка') {
      totalOz       += Number(t.количество);
      totalBuyOz    += Number(t.количество);
      totalBuyCost  += Number(t.обща_сума);
      totalInvested += Number(t.обща_сума);
    } else if (t.тип === 'продажба') {
      totalOz       -= Number(t.количество);
      totalInvested -= Number(t.обща_сума);
    }
  }
  const avgBuyPrice = totalBuyOz > 0 ? (totalBuyCost / totalBuyOz) : 0;
  const latestPrice = db.prepare('SELECT цена_eur FROM gold_price_history WHERE метал=? ORDER BY id DESC LIMIT 1').get(metal);
  const currentEur  = latestPrice ? Number(latestPrice.цена_eur) : null;
  const currentValue = currentEur ? totalOz * currentEur : null;
  const profit = currentValue !== null ? (currentValue - totalInvested) : null;
  const profitPct = (currentValue !== null && totalInvested > 0) ? ((profit / totalInvested) * 100) : null;
  return {
    метал:             metal,
    общо_oz:           Number(totalOz.toFixed(4)),
    средна_цена:       Number(avgBuyPrice.toFixed(2)),
    текуща_цена:       currentEur,
    обща_инвестиция:   Number(totalInvested.toFixed(2)),
    текуща_стойност:   currentValue,
    печалба_eur:       profit,
    печалба_pct:       profitPct,
  };
}

module.exports.buildReport = buildReport;
module.exports.computePortfolioSnapshot = computePortfolioSnapshot;
module.exports.SUPPORTED_METALS = SUPPORTED_METALS;
module.exports.METAL_LABEL_BG = METAL_LABEL_BG;
