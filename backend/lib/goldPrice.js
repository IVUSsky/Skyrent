// Gold spot price helper. Tries goldapi.io first (needs GOLD_API_KEY), falls
// back to metals.live + frankfurter.app for FX conversion. Returns { usd,
// eur, change24h } or null on total failure.

async function getGoldPriceEUR() {
  // ── Path A: goldapi.io (direct EUR) ──
  if (process.env.GOLD_API_KEY) {
    try {
      const r = await fetch('https://www.goldapi.io/api/XAU/EUR', {
        headers: { 'x-access-token': process.env.GOLD_API_KEY, 'Content-Type': 'application/json' },
      });
      if (r.ok) {
        const d = await r.json();
        return {
          usd: Number(d.price_gram_24k) ? Number(d.price) * 1 : null,
          eur: Number(d.price),
          change24h: Number(d.ch || 0),
          source: 'goldapi.io',
        };
      }
    } catch (e) {
      console.warn('goldapi.io fetch failed:', e.message);
    }
  }

  // ── Path B: metals.live + frankfurter for USD→EUR ──
  try {
    const [goldR, fxR] = await Promise.all([
      fetch('https://api.metals.live/v1/spot/gold'),
      fetch('https://api.frankfurter.app/latest?from=USD&to=EUR'),
    ]);
    if (!goldR.ok || !fxR.ok) throw new Error(`HTTP ${goldR.status}/${fxR.status}`);
    const goldArr = await goldR.json();
    const fxData  = await fxR.json();
    const usd     = Array.isArray(goldArr) ? Number(goldArr[0]?.price) : Number(goldArr?.price);
    const eurUsd  = Number(fxData.rates?.EUR);
    if (!usd || !eurUsd) throw new Error('invalid response shape');
    return { usd, eur: usd * eurUsd, change24h: 0, source: 'metals.live' };
  } catch (e) {
    console.warn('metals.live fetch failed:', e.message);
  }

  return null;
}

module.exports = { getGoldPriceEUR };
