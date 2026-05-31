// Trading 212 REST API client (Public Beta).
// Docs: https://t212public-api-docs.redoc.ly/
//
// Auth: HTTP Basic с двойката от T212 Settings → API:
//   - T212_API_KEY_ID  = "ID на API ключ"   (username частта)
//   - T212_API_KEY     = "Таен ключ"        (password частта)
// Изпращаме `Authorization: Basic base64(id:secret)`.
//
// Rate limits (per endpoint, per key):
//   /equity/portfolio       → 1 req / 5s   (we cache 60s to be safe)
//   /equity/account/cash    → 1 req / 2s   (we cache 30s)
//   /equity/account/info    → 1 req / 30s  (we cache 1h — rarely changes)
//
// All amounts are in the account's base currency (commonly EUR for EU clients).

const BASE_URL   = process.env.T212_BASE_URL || 'https://live.trading212.com/api/v0';
const API_KEY    = () => process.env.T212_API_KEY    || '';
const API_KEY_ID = () => process.env.T212_API_KEY_ID || '';

function authHeader() {
  const id = API_KEY_ID();
  const secret = API_KEY();
  if (!secret) return null;
  if (id) {
    // Basic <base64(id:secret)>
    return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
  }
  // Fallback за legacy single-key схема (preview API key)
  return secret;
}

const cache = {}; // { [path]: { value, fetched_at, ttl } }

async function call(path, { ttlMs = 0 } = {}) {
  const auth = authHeader();
  if (!auth) throw new Error('T212_API_KEY не е конфигуриран в .env');

  const c = cache[path];
  if (c && ttlMs > 0 && (Date.now() - c.fetched_at) < ttlMs) {
    return { ...c.value, _cached: true, _age_ms: Date.now() - c.fetched_at };
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: { 'Authorization': auth, 'Accept': 'application/json' },
  });

  if (res.status === 401) throw new Error('T212: невалидни credentials (401) — провери T212_API_KEY_ID и T212_API_KEY');
  if (res.status === 403) throw new Error('T212: ключът няма scope за този endpoint (403) — в T212 Settings → API активирай съответните scopes (Account info, Portfolio, Orders, History)');
  if (res.status === 429) {
    // Return cached value if we have one, even if stale
    if (c?.value) return { ...c.value, _cached: true, _stale: true, _age_ms: Date.now() - c.fetched_at };
    throw new Error('T212: rate limit (429) — изчакай малко и опитай отново');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`T212 ${path} → HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const wrapped = Array.isArray(data) ? { items: data } : data;
  cache[path] = { value: wrapped, fetched_at: Date.now(), ttl: ttlMs };
  return { ...wrapped, _cached: false, _age_ms: 0 };
}

async function getAccountInfo() {
  // { id, currencyCode }
  return call('/equity/account/info', { ttlMs: 60 * 60 * 1000 });
}

async function getCash() {
  // { free, total, invested, pieCash, ppl, result, blocked }
  return call('/equity/account/cash', { ttlMs: 30 * 1000 });
}

async function getPortfolio() {
  // Wrapped as { items: [...] }; each position has:
  // { ticker, quantity, averagePrice, currentPrice, ppl, fxPpl, initialFillDate, frontend, maxBuy, maxSell, pieQuantity }
  return call('/equity/portfolio', { ttlMs: 60 * 1000 });
}

async function getOrders() {
  // Pending orders. T212 връща { value: [...], Count: n }
  return call('/equity/orders', { ttlMs: 15 * 1000 });
}

function isConfigured() {
  return !!API_KEY() && !!API_KEY_ID();
}

// Take a full snapshot (cash + portfolio) and persist to t212_snapshots.
// Idempotent within the same calendar day — at most 1 snapshot per (UTC) date,
// updated in-place if called multiple times the same day. Returns the inserted/
// updated row's id, or null if T212 is unreachable / not configured.
async function takeSnapshot(db) {
  if (!isConfigured()) return null;
  try {
    const [info, cash, pf] = await Promise.all([getAccountInfo(), getCash(), getPortfolio()]);
    const positions = (pf.items || []).map(p => {
      const qty = Number(p.quantity) || 0;
      const avg = Number(p.averagePrice) || 0;
      const cur = Number(p.currentPrice) || 0;
      const invested = qty * avg;
      const value = qty * cur;
      return {
        тикер: p.ticker, количество: qty, средна_цена: avg, текуща_цена: cur,
        инвестирано: Number(invested.toFixed(2)),
        текуща_стойност: Number(value.toFixed(2)),
        печалба: Number((value - invested).toFixed(2)),
      };
    });
    const totals = positions.reduce((a, p) => {
      a.инвестирано += p.инвестирано; a.текуща_стойност += p.текуща_стойност; a.печалба += p.печалба; return a;
    }, { инвестирано: 0, текуща_стойност: 0, печалба: 0 });
    const profitPct = totals.инвестирано > 0 ? (totals.печалба / totals.инвестирано) * 100 : 0;

    const today = new Date().toISOString().slice(0, 10);
    const existing = db.prepare("SELECT id FROM t212_snapshots WHERE date(дата) = date(?)").get(today);
    if (existing) {
      db.prepare(`UPDATE t212_snapshots SET
        дата=CURRENT_TIMESTAMP, валута=?, кеш_общо=?, кеш_свободен=?, блокиран=?,
        инвестирано=?, текуща_стойност=?, печалба=?, печалба_pct=?, брой_позиции=?, позиции_json=?
        WHERE id=?`).run(
        info.currencyCode, cash.total, cash.free, cash.blocked,
        Number(totals.инвестирано.toFixed(2)), Number(totals.текуща_стойност.toFixed(2)),
        Number(totals.печалба.toFixed(2)), Number(profitPct.toFixed(2)),
        positions.length, JSON.stringify(positions), existing.id
      );
      return existing.id;
    }
    const r = db.prepare(`INSERT INTO t212_snapshots
      (валута, кеш_общо, кеш_свободен, блокиран, инвестирано, текуща_стойност, печалба, печалба_pct, брой_позиции, позиции_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      info.currencyCode, cash.total, cash.free, cash.blocked,
      Number(totals.инвестирано.toFixed(2)), Number(totals.текуща_стойност.toFixed(2)),
      Number(totals.печалба.toFixed(2)), Number(profitPct.toFixed(2)),
      positions.length, JSON.stringify(positions)
    );
    return r.lastInsertRowid;
  } catch (err) {
    console.warn('[t212] takeSnapshot failed:', err.message);
    return null;
  }
}

module.exports = { getAccountInfo, getCash, getPortfolio, getOrders, isConfigured, takeSnapshot };
