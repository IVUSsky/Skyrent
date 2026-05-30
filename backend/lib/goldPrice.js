// Spot price helper for precious metals.
//
// Supports gold, silver, platinum via goldapi.io (preferred, EUR direct) with
// a metals.live + frankfurter.app FX fallback. Returns { usd, eur, change24h,
// source } or null on total failure.
//
// Usage:
//   const p = await getMetalPriceEUR('gold')      // default
//   const s = await getMetalPriceEUR('silver')
//   const t = await getMetalPriceEUR('platinum')

const METAL_SYMBOLS = {
  gold:     'XAU',
  silver:   'XAG',
  platinum: 'XPT',
};

const METAL_LIVE_PATHS = {
  gold:     'gold',
  silver:   'silver',
  platinum: 'platinum',
};

async function getMetalPriceEUR(metal = 'gold') {
  const key = (metal || 'gold').toLowerCase();
  if (!METAL_SYMBOLS[key]) {
    throw new Error(`Unsupported metal: ${metal}`);
  }
  const symbol = METAL_SYMBOLS[key];

  // ── Path A: goldapi.io (returns EUR price directly when EUR is the quote ──
  if (process.env.GOLD_API_KEY) {
    try {
      const r = await fetch(`https://www.goldapi.io/api/${symbol}/EUR`, {
        headers: { 'x-access-token': process.env.GOLD_API_KEY, 'Content-Type': 'application/json' },
      });
      if (r.ok) {
        const d = await r.json();
        return {
          usd: d.price_gram_24k ? null : null,
          eur: Number(d.price),
          change24h: Number(d.ch || 0),
          source: 'goldapi.io',
        };
      }
    } catch (e) {
      console.warn(`goldapi.io ${symbol} fetch failed:`, e.message);
    }
  }

  // ── Path B: metals.live (USD) + frankfurter (FX) ──
  try {
    const [metalR, fxR] = await Promise.all([
      fetch(`https://api.metals.live/v1/spot/${METAL_LIVE_PATHS[key]}`),
      fetch('https://api.frankfurter.app/latest?from=USD&to=EUR'),
    ]);
    if (!metalR.ok || !fxR.ok) throw new Error(`HTTP ${metalR.status}/${fxR.status}`);
    const arr    = await metalR.json();
    const fxData = await fxR.json();
    const usd    = Array.isArray(arr) ? Number(arr[0]?.price) : Number(arr?.price);
    const eurUsd = Number(fxData.rates?.EUR);
    if (!usd || !eurUsd) throw new Error('invalid response shape');
    return { usd, eur: usd * eurUsd, change24h: 0, source: 'metals.live' };
  } catch (e) {
    console.warn(`metals.live ${metal} fetch failed:`, e.message);
  }

  return null;
}

// Backward-compatible alias
async function getGoldPriceEUR() { return getMetalPriceEUR('gold'); }

module.exports = { getMetalPriceEUR, getGoldPriceEUR, METAL_SYMBOLS };
