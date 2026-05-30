// AI Market Agent — fetches recent news from public RSS feeds for precious
// metals, asks Claude for a buy/sell/hold signal in the context of the user's
// portfolio + price history, and records the decision in agent_signals.
//
// Stays minimal-dep: uses fetch + plain regex to extract <item> blocks from
// RSS XML. Two reliable English-language sources are tried in parallel; if
// both fail the agent still runs the analysis with portfolio + price data
// only (Claude can still produce a signal based on TA).

const Anthropic = require('@anthropic-ai/sdk');
const { getMetalPriceEUR } = require('./goldPrice');

// Feeds chosen for reliability + relevance to gold/silver.
const FEEDS = [
  { name: 'Kitco News',         url: 'https://www.kitco.com/rss/KitcoNews.xml' },
  { name: 'Investing Metals',   url: 'https://www.investing.com/rss/commodities_Metals.rss' },
];

const METAL_KEYWORDS = {
  gold:   ['gold', 'xau', 'bullion', 'yellow metal'],
  silver: ['silver', 'xag', 'silver bullion'],
};

const METAL_LABEL_BG = { gold: 'злато', silver: 'сребро' };

// Parse RSS <item> blocks → array of { title, description, link, pubDate, source }
function parseRss(xml, sourceName) {
  const items = [];
  const itemRegex = /<item[\s\S]*?<\/item>/g;
  const re = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${tag}>`));
    return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
  };
  const matches = xml.match(itemRegex) || [];
  for (const block of matches) {
    const title = re(block, 'title');
    const description = re(block, 'description');
    const link = re(block, 'link');
    const pubDate = re(block, 'pubDate');
    if (title) items.push({ title, description, link, pubDate, source: sourceName });
    if (items.length >= 40) break;
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    const r = await fetch(feed.url, { headers: { 'User-Agent': 'Skyrent-Agent/1.0' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRss(xml, feed.name);
  } catch (e) {
    console.warn(`[newsAgent] feed ${feed.name} failed:`, e.message);
    return [];
  }
}

async function fetchAllNews() {
  const results = await Promise.all(FEEDS.map(fetchFeed));
  return results.flat();
}

// Filter recent (last 72h) news that mention the metal
function filterRelevant(allNews, metal, hours = 72) {
  const since = Date.now() - hours * 3600 * 1000;
  const keywords = METAL_KEYWORDS[metal] || [];
  return allNews.filter(n => {
    const t = (n.pubDate ? new Date(n.pubDate).getTime() : null);
    if (t && t < since) return false;
    const hay = `${n.title} ${n.description}`.toLowerCase();
    return keywords.some(k => hay.includes(k));
  }).slice(0, 20);
}

// Compose Claude prompt + call. Returns parsed { signal, confidence, reasoning, action }
async function analyzeWithClaude({ metal, portfolio, priceHistory, currentPrice, news }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY не е конфигуриран');
  const client = new (Anthropic.default || Anthropic)({ apiKey });

  const trend30d = priceHistory.length > 1
    ? `от €${Number(priceHistory[0].цена_eur).toFixed(0)} до €${Number(priceHistory[priceHistory.length - 1].цена_eur).toFixed(0)} (${priceHistory.length} наблюдения)`
    : 'недостатъчни данни';

  const newsBlock = news.length === 0
    ? '— Няма налични скорошни новини за метала.'
    : news.slice(0, 15).map((n, i) =>
        `${i+1}. [${n.source}] ${n.title}\n   ${(n.description || '').slice(0, 200)}\n   Дата: ${n.pubDate || '?'}`
      ).join('\n\n');

  const prompt = `Ти си AI инвестиционен агент за Иво Лазаров. Анализирай пазара на ${METAL_LABEL_BG[metal]} и върни препоръка.

ПОРТФЕЙЛ — ${METAL_LABEL_BG[metal].toUpperCase()}:
- Притежавани: ${portfolio.общо_oz} oz
- Средна покупна цена: €${portfolio.средна_цена?.toFixed(0) || 0}/oz
- Текуща цена: €${currentPrice?.toFixed(2) || 'неизвестна'}/oz
- Текуща стойност: €${portfolio.текуща_стойност !== null ? portfolio.текуща_стойност.toFixed(0) : 'n/a'}
- P/L: ${portfolio.печалба_eur !== null ? `€${portfolio.печалба_eur.toFixed(0)} (${portfolio.печалба_pct?.toFixed(1)}%)` : 'n/a'}

ЦЕНОВО ДВИЖЕНИЕ (30 дни): ${trend30d}

ПОСЛЕДНИ НОВИНИ (${news.length} статии):
${newsBlock}

ВЪРНИ СТРИКТНО JSON:
{
  "сигнал": "купи" | "продай" | "задръж" | "наблюдавай",
  "уверенност": 0-100,
  "обоснование": "2-3 изречения защо",
  "действие_препоръка": "конкретно действие, напр. 'купи 1-2 oz при €X' или 'изчакай корекция към €Y'",
  "ключови_фактори": ["3-5 най-важни фактора от новините + пазара"]
}

Правила:
- "купи" само ако има поне 2 потвърждаващи фактора (спад на цената + бичи новини, или техническа подкрепа + макро catalyst).
- "продай" само ако цената е значително над средната покупна И има bearish сигнали.
- "задръж" при странично движение без ясни сигнали.
- "наблюдавай" при volatility / неясна посока.
- Стой консервативен — fakes сигнали по-скъпо от пропуснати възможности.
- Bulgarian only в текстовите полета.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (response.content?.[0]?.text || '').trim();
  const json = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(json); }
  catch (e) {
    throw new Error(`Claude върна невалиден JSON: ${text.slice(0, 300)}`);
  }
  return parsed;
}

// Top-level: run a single agent cycle for one metal. Writes agent_signals row.
async function runAgent(db, metal, options = {}) {
  // 1. Get current price (cached one-shot)
  const priceData = await getMetalPriceEUR(metal).catch(() => null);

  // 2. Load portfolio snapshot
  const txs = db.prepare('SELECT * FROM gold_investments WHERE метал=? ORDER BY дата ASC, id ASC').all(metal);
  let totalOz = 0, totalInvested = 0, totalBuyOz = 0, totalBuyCost = 0;
  for (const t of txs) {
    if (t.тип === 'покупка') {
      totalOz += Number(t.количество); totalBuyOz += Number(t.количество);
      totalBuyCost += Number(t.обща_сума); totalInvested += Number(t.обща_сума);
    } else if (t.тип === 'продажба') {
      totalOz -= Number(t.количество); totalInvested -= Number(t.обща_сума);
    }
  }
  const avgBuy = totalBuyOz > 0 ? totalBuyCost / totalBuyOz : 0;
  const currentValue = priceData?.eur ? totalOz * priceData.eur : null;
  const profit = currentValue !== null ? currentValue - totalInvested : null;
  const portfolio = {
    общо_oz: Number(totalOz.toFixed(4)),
    средна_цена: Number(avgBuy.toFixed(2)),
    обща_инвестиция: Number(totalInvested.toFixed(2)),
    текуща_стойност: currentValue,
    печалба_eur: profit,
    печалба_pct: profit !== null && totalInvested > 0 ? (profit / totalInvested) * 100 : null,
  };

  // 3. Price history (last 30 days)
  const priceHistory = db.prepare(`
    SELECT дата, цена_eur FROM gold_price_history
    WHERE метал=? AND дата >= datetime('now', '-30 days')
    ORDER BY дата ASC
  `).all(metal);

  // 4. Fetch news
  const allNews = await fetchAllNews();
  const relevant = filterRelevant(allNews, metal, options.newsHours || 72);

  // 5. Ask Claude
  const decision = await analyzeWithClaude({
    metal,
    portfolio,
    priceHistory,
    currentPrice: priceData?.eur || null,
    news: relevant,
  });

  // 6. Store signal
  const r = db.prepare(`
    INSERT INTO agent_signals
      (метал, сигнал, уверенност, обоснование, новини_json, цена_eur, действие_препоръка)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    metal,
    decision.сигнал || 'наблюдавай',
    Math.max(0, Math.min(100, Number(decision.уверенност) || 0)),
    decision.обоснование || '',
    JSON.stringify({ news: relevant.slice(0, 15), keywords: decision.ключови_фактори || [] }),
    priceData?.eur || null,
    decision.действие_препоръка || ''
  );

  return { id: r.lastInsertRowid, метал: metal, ...decision, цена_eur: priceData?.eur || null };
}

module.exports = { runAgent, fetchAllNews, filterRelevant, METAL_LABEL_BG };
