// Spot price helper for precious metals.
//
// Fallback вериж:
//   A) goldapi.io   — primary, EUR direct (GOLD_API_KEY)
//   B) metalpriceapi.com — fallback, USD → EUR через frankfurter (METAL_PRICE_API_KEY)
//
// Връща { usd, eur, change24h, source } или null при пълен fail.
//
// Usage:
//   const p = await getMetalPriceEUR('gold')      // default
//   const s = await getMetalPriceEUR('silver')

const METAL_SYMBOLS = {
  gold:     'XAU',
  silver:   'XAG',
  platinum: 'XPT',
};

// Light in-memory dedup, за да не удряме API-то по 2 пъти от паралелни заявки.
const inflight = new Map();

async function getMetalPriceEUR(metal = 'gold') {
  const key = (metal || 'gold').toLowerCase();
  if (!METAL_SYMBOLS[key]) throw new Error(`Unsupported metal: ${metal}`);
  if (inflight.has(key)) return inflight.get(key);
  const p = _fetchMetal(key).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function _fetchMetal(key) {
  const symbol = METAL_SYMBOLS[key];

  // ── Path A: goldapi.io (EUR директно) ────────────────────────────────────
  if (process.env.GOLD_API_KEY) {
    try {
      const r = await fetch(`https://www.goldapi.io/api/${symbol}/EUR`, {
        headers: { 'x-access-token': process.env.GOLD_API_KEY, 'Content-Type': 'application/json' },
      });
      if (r.ok) {
        const d = await r.json();
        return {
          usd: null,
          eur: Number(d.price),
          change24h: Number(d.ch || 0),
          source: 'goldapi.io',
        };
      }
      // 429/403 = rate-limit or quota → пада към next path
      console.warn(`goldapi.io ${symbol} HTTP ${r.status} — fallback`);
    } catch (e) {
      console.warn(`goldapi.io ${symbol} fetch failed:`, e.message);
    }
  }

  // ── Path B: metalpriceapi.com (USD) + frankfurter (FX) ───────────────────
  if (process.env.METAL_PRICE_API_KEY) {
    try {
      const [metalR, fxR] = await Promise.all([
        fetch(`https://api.metalpriceapi.com/v1/latest?api_key=${process.env.METAL_PRICE_API_KEY}&base=USD&currencies=${symbol}`),
        fetch('https://api.frankfurter.app/latest?from=USD&to=EUR'),
      ]);
      if (!metalR.ok) throw new Error(`metalpriceapi HTTP ${metalR.status}`);
      if (!fxR.ok)    throw new Error(`frankfurter HTTP ${fxR.status}`);
      const d  = await metalR.json();
      const fx = await fxR.json();
      // metalpriceapi free plan връща inverse rate: rates.XAU = oz/USD
      // → USD per oz = 1 / rates.XAU. Платените планове връщат USD per oz директно.
      const rate = Number(d.rates?.[symbol]);
      if (!rate || !d.success) throw new Error('metalpriceapi invalid response');
      const usd = rate < 1 ? 1 / rate : rate;   // евристика: ако rate < 1, значи е inverse
      const eurUsd = Number(fx.rates?.EUR);
      if (!eurUsd) throw new Error('frankfurter invalid response');
      return { usd, eur: usd * eurUsd, change24h: 0, source: 'metalpriceapi.com' };
    } catch (e) {
      console.warn(`metalpriceapi ${symbol} fetch failed:`, e.message);
    }
  }

  return null;
}

// Backward-compatible alias
async function getGoldPriceEUR() { return getMetalPriceEUR('gold'); }

module.exports = { getMetalPriceEUR, getGoldPriceEUR, METAL_SYMBOLS };
