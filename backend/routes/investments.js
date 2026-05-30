// /api/investments — admin module for tracking gold (and later other assets).
// Tenants do not access this. All endpoints require role = admin or broker.

const express = require('express');
const { getGoldPriceEUR } = require('../lib/goldPrice');

module.exports = function(db) {
  const router = express.Router();

  // Admin/broker-only guard
  router.use((req, res, next) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Само за администратори' });
    next();
  });

  // ── Cached current price (avoid hammering external APIs) ──────────────────
  let priceCache = { value: null, fetched_at: 0 };
  const PRICE_TTL = 5 * 60 * 1000; // 5 min

  async function currentPrice() {
    if (priceCache.value && Date.now() - priceCache.fetched_at < PRICE_TTL) {
      return priceCache.value;
    }
    const p = await getGoldPriceEUR();
    if (p) {
      priceCache = { value: p, fetched_at: Date.now() };
      // Opportunistically store in history if no row exists for the current hour
      const lastH = db.prepare("SELECT дата FROM gold_price_history ORDER BY id DESC LIMIT 1").get();
      const needWrite = !lastH || (Date.now() - new Date(lastH.дата).getTime()) > 55 * 60 * 1000;
      if (needWrite) {
        try {
          db.prepare("INSERT INTO gold_price_history (цена_usd, цена_eur, промяна_24h) VALUES (?,?,?)")
            .run(p.usd || null, p.eur || null, p.change24h || 0);
        } catch (_) {}
      }
    }
    return priceCache.value;
  }

  // ── GOLD: current price ───────────────────────────────────────────────────
  router.get('/gold/price', async (req, res) => {
    const p = await currentPrice();
    if (!p) return res.status(502).json({ error: 'Цената на златото не е достъпна (external API failure)' });
    res.json({
      цена_usd:     p.usd,
      цена_eur:     p.eur,
      промяна_24h:  p.change24h,
      източник:     p.source,
      обновено:     new Date(priceCache.fetched_at).toISOString(),
    });
  });

  // ── GOLD: price history (last 30 days) ────────────────────────────────────
  router.get('/gold/price-history', (req, res) => {
    const days = Math.min(365, Number(req.query.days) || 30);
    const rows = db.prepare(`
      SELECT id, дата, цена_eur, цена_usd, промяна_24h
      FROM gold_price_history
      WHERE дата >= datetime('now', ?)
      ORDER BY дата ASC
    `).all(`-${days} days`);
    res.json(rows);
  });

  // ── GOLD: portfolio summary ───────────────────────────────────────────────
  router.get('/gold/portfolio', async (req, res) => {
    const txs = db.prepare('SELECT * FROM gold_investments ORDER BY дата ASC, id ASC').all();
    let totalOz = 0;
    let totalInvested = 0;       // sum of purchase costs minus sale proceeds
    let totalBuyCost = 0;        // gross buy cost
    let totalBuyOz = 0;          // gross buy quantity
    let totalSellOz = 0;
    let totalSellProceeds = 0;

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
    const price = await currentPrice();
    const currentPriceEur = price?.eur || null;
    const currentValue = currentPriceEur ? totalOz * currentPriceEur : null;
    const profit = currentValue !== null ? (currentValue - totalInvested) : null;
    const profitPct = (currentValue !== null && totalInvested > 0) ? ((profit / totalInvested) * 100) : null;

    res.json({
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

  // ── GOLD: transactions list ───────────────────────────────────────────────
  router.get('/gold/transactions', (req, res) => {
    res.json(db.prepare('SELECT * FROM gold_investments ORDER BY дата DESC, id DESC').all());
  });

  // ── GOLD: create transaction ──────────────────────────────────────────────
  router.post('/gold/transactions', (req, res) => {
    const b = req.body || {};
    const requiredErr = ['дата','тип','количество','цена_eur'].find(k => b[k] === undefined || b[k] === '');
    if (requiredErr) return res.status(400).json({ error: `Поле "${requiredErr}" е задължително` });
    if (!['покупка','продажба'].includes(b.тип)) {
      return res.status(400).json({ error: 'тип трябва да е "покупка" или "продажба"' });
    }
    const qty   = Number(b.количество);
    const price = Number(b.цена_eur);
    const total = b.обща_сума !== undefined ? Number(b.обща_сума) : Number((qty * price).toFixed(2));

    const r = db.prepare(`
      INSERT INTO gold_investments
        (дата, тип, количество, цена_eur, обща_сума, доставчик, продукт, сертификат, съхранение, бележка)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      b.дата, b.тип, qty, price, total,
      b.доставчик || '', b.продукт || '', b.сертификат || '',
      b.съхранение || 'home', b.бележка || ''
    );
    res.status(201).json({ id: r.lastInsertRowid });
  });

  router.put('/gold/transactions/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM gold_investments WHERE id=?').get(req.params.id);
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

  router.delete('/gold/transactions/:id', (req, res) => {
    db.prepare('DELETE FROM gold_investments WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── GOLD: alerts ─────────────────────────────────────────────────────────
  router.get('/gold/alerts', (req, res) => {
    res.json(db.prepare('SELECT * FROM gold_alerts ORDER BY created_at DESC').all());
  });

  router.post('/gold/alerts', (req, res) => {
    const b = req.body || {};
    if (!b.цена_eur || !b.посока) return res.status(400).json({ error: 'цена_eur и посока са задължителни' });
    if (!['под','над'].includes(b.посока)) return res.status(400).json({ error: 'посока: "под" или "над"' });
    const r = db.prepare(`
      INSERT INTO gold_alerts (цена_eur, посока, количество_oz, съобщение, активна)
      VALUES (?,?,?,?,?)
    `).run(
      Number(b.цена_eur), b.посока,
      b.количество_oz ? Number(b.количество_oz) : null,
      b.съобщение || '',
      b.активна !== undefined ? (b.активна ? 1 : 0) : 1
    );
    res.status(201).json({ id: r.lastInsertRowid });
  });

  router.put('/gold/alerts/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM gold_alerts WHERE id=?').get(req.params.id);
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

  router.delete('/gold/alerts/:id', (req, res) => {
    db.prepare('DELETE FROM gold_alerts WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── GOLD: reports (Claude-generated AI analyses) ─────────────────────────
  router.get('/gold/reports', (req, res) => {
    const limit = Math.min(50, Number(req.query.limit) || 12);
    res.json(db.prepare('SELECT id, месец, тип, created_at FROM investment_reports ORDER BY created_at DESC LIMIT ?').all(limit));
  });

  router.get('/gold/reports/:id', (req, res) => {
    const r = db.prepare('SELECT * FROM investment_reports WHERE id=?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(r);
  });

  // POST /gold/report — ad-hoc Claude-generated report. `type`: monthly | weekly | alert
  router.post('/gold/report', async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY не е конфигуриран' });
    const reportType = (req.body?.тип || 'monthly').toLowerCase();
    try {
      const result = await buildReport(db, reportType);
      res.json(result);
    } catch (err) {
      console.error('Investment report error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};

// ── Helper exported for the cron and the ad-hoc endpoint ───────────────────
async function buildReport(db, reportType) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.default
    ? new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })
    : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const portfolio = computePortfolioSnapshot(db);
  const historyRows = db.prepare(`
    SELECT дата, цена_eur, промяна_24h
    FROM gold_price_history
    WHERE дата >= datetime('now', ?)
    ORDER BY дата ASC
  `).all(reportType === 'weekly' ? '-14 days' : '-90 days');

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

  const prompt = `Ти си финансов анализатор на портфейла на Иво Лазаров (Sky Capital OOD).
Генерирай ${reportType === 'weekly' ? 'седмично' : reportType === 'alert' ? 'алармено' : 'месечно'} инвестиционно резюме за ${periodName}.

ПОРТФЕЙЛ — ИМОТИ:
- Месечни наеми (активни): €${(propertyMetrics?.total_rent || 0).toFixed(0)} от ${propertyMetrics?.active || 0}/${propertyMetrics?.total || 0} имота.
- Общ дълг по кредити: €${(loans?.debt || 0).toFixed(0)}.
- Месечни вноски: €${(loans?.monthly || 0).toFixed(0)}.
- Нетен месечен cash-flow от наеми: €${((propertyMetrics?.total_rent || 0) - (loans?.monthly || 0)).toFixed(0)}.

ПОРТФЕЙЛ — ЗЛАТО:
- Притежавани: ${portfolio.общо_oz} troy oz.
- Средна покупна цена: €${portfolio.средна_цена.toFixed(0)}/oz.
- Текуща цена: €${portfolio.текуща_цена !== null ? portfolio.текуща_цена.toFixed(0) : 'неизвестна'}/oz.
- Обща инвестиция: €${portfolio.обща_инвестиция.toFixed(0)}.
- Текуща стойност: €${portfolio.текуща_стойност !== null ? portfolio.текуща_стойност.toFixed(0) : 'неизвестна'}.
- Печалба: €${portfolio.печалба_eur !== null ? portfolio.печалба_eur.toFixed(0) : 'n/a'} (${portfolio.печалба_pct !== null ? portfolio.печалба_pct.toFixed(1) + '%' : 'n/a'}).

ДВИЖЕНИЕ НА ЦЕНАТА (последни ${historyRows.length} наблюдения):
${historyRows.slice(-30).map(r => `- ${new Date(r.дата).toISOString().slice(0,10)}: €${Number(r.цена_eur).toFixed(0)}`).join('\n') || '— няма исторически данни'}

Очаквам кратък структуриран markdown отговор (на български):

### 📊 Резюме
1-2 изречения за състоянието на портфейла.

### 🥇 Анализ на златото
- Тенденция (нагоре/надолу/странично) с конкретни числа.
- Сравнение спрямо средната покупна цена.
- Препоръка: купувай / задръж / частична реализация.

### 🏠 Контекст от имотите
Накратко как cash-flow от наеми се отнася към инвестициите.

### 💡 Конкретна следваща стъпка
Едно конкретно действие за следващия период.

Не повече от 300 думи. Конкретен, без вода.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (response.content?.[0]?.text || '').trim();

  const r = db.prepare(`
    INSERT INTO investment_reports (месец, тип, съдържание, данни)
    VALUES (?,?,?,?)
  `).run(
    new Date().toISOString().slice(0, 7),
    reportType,
    text,
    JSON.stringify({ portfolio, propertyMetrics, loans, historyPoints: historyRows.length })
  );

  return { id: r.lastInsertRowid, тип: reportType, съдържание: text };
}

// Same logic as the /gold/portfolio handler — extracted for the cron + report
function computePortfolioSnapshot(db) {
  const txs = db.prepare('SELECT * FROM gold_investments ORDER BY дата ASC, id ASC').all();
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
  const latestPrice = db.prepare('SELECT цена_eur FROM gold_price_history ORDER BY id DESC LIMIT 1').get();
  const currentEur  = latestPrice ? Number(latestPrice.цена_eur) : null;
  const currentValue = currentEur ? totalOz * currentEur : null;
  const profit = currentValue !== null ? (currentValue - totalInvested) : null;
  const profitPct = (currentValue !== null && totalInvested > 0) ? ((profit / totalInvested) * 100) : null;
  return {
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
