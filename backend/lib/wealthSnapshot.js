// Compute and persist Net Worth snapshots.
//
// Net Worth = property equity (asset − debt) + gold + silver + Trading 212 NAV.
// Snapshots are written to wealth_snapshots — at most 1 row per calendar day
// (idempotent: UPDATE if today's row exists, INSERT otherwise).

const t212 = require('./trading212');

// Mirror of computePortfolioSnapshot in routes/investments.js, kept here to
// avoid a circular dependency (routes → lib → routes). Behaviour must stay
// in sync; if you change one, change both.
function metalSnapshot(db, metal) {
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
  return {
    общо_oz:         Number(totalOz.toFixed(4)),
    средна_цена:     Number(avgBuyPrice.toFixed(2)),
    текуща_цена:     currentEur,
    обща_инвестиция: Number(totalInvested.toFixed(2)),
    текуща_стойност: currentValue,
  };
}

async function computeWealth(db) {
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

  const gold = metalSnapshot(db, 'gold');
  const silver = metalSnapshot(db, 'silver');
  const bulgar = bulgarSnapshot(db);

  // T212: live; fall back to last t212_snapshot
  let t212Data = null;
  if (t212.isConfigured()) {
    try {
      const [info, cash, pf] = await Promise.all([t212.getAccountInfo(), t212.getCash(), t212.getPortfolio()]);
      const positions = pf.items || [];
      const invested = positions.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.averagePrice) || 0), 0);
      const value = positions.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.currentPrice) || 0), 0);
      t212Data = {
        валута: info.currencyCode,
        обща_стойност: Number((cash.total || 0).toFixed(2)),
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

  const metals_value = (gold.текуща_стойност || 0) + (silver.текуща_стойност || 0);
  const t212_value = t212Data?.обща_стойност || 0;
  const bulgar_value = bulgar.текуща_стойност || 0;
  const total_wealth = property_equity + metals_value + t212_value + bulgar_value;
  const allocation = total_wealth > 0 ? {
    имоти_equity: Number(((property_equity / total_wealth) * 100).toFixed(2)),
    злато:        Number((((gold.текуща_стойност || 0) / total_wealth) * 100).toFixed(2)),
    сребро:       Number((((silver.текуща_стойност || 0) / total_wealth) * 100).toFixed(2)),
    t212:         Number(((t212_value / total_wealth) * 100).toFixed(2)),
    болгар:       Number(((bulgar_value / total_wealth) * 100).toFixed(2)),
  } : null;

  return {
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
    злато: { метал: 'gold', ...gold },
    сребро: { метал: 'silver', ...silver },
    t212: t212Data,
    болгар: bulgar,
    изчислено_на: new Date().toISOString(),
  };
}

// Bulgar Capital snapshot — sum of all active positions (principal + accrued).
function bulgarSnapshot(db) {
  const positions = db.prepare('SELECT * FROM bulgar_positions WHERE активна=1').all();
  if (!positions.length) return { позиции: 0, главница_eur: 0, текуща_стойност: 0 };
  const BGN_EUR_RATE = 1.95583;
  const toEur = (a, c) => c === 'BGN' ? a / BGN_EUR_RATE : a;
  let totalCurrent = 0, totalPrincipal = 0;
  for (const pos of positions) {
    const txs = db.prepare('SELECT * FROM bulgar_transactions WHERE position_id=? ORDER BY дата ASC, id ASC').all(pos.id);
    let principal = pos.главница_eur;
    let lastDiv = pos.дата_влог;
    for (const t of txs) {
      const eur = toEur(Number(t.сума), t.валута);
      if (t.тип === 'влог') principal += eur;
      else if (t.тип === 'теглене') principal -= eur;
      else if (t.тип === 'дивидент' && t.дата > lastDiv) lastDiv = t.дата;
    }
    let accrued = 0;
    if (pos.лихва_pct) {
      const days = Math.max(0, Math.floor((Date.now() - new Date(lastDiv).getTime()) / 86400000));
      accrued = principal * (pos.лихва_pct / 100) * (days / 365);
    }
    totalCurrent += principal + accrued;
    totalPrincipal += principal;
  }
  return {
    позиции: positions.length,
    главница_eur:    Number(totalPrincipal.toFixed(2)),
    текуща_стойност: Number(totalCurrent.toFixed(2)),
  };
}

// Persist a wealth snapshot. At most one row per calendar day (UPDATE if exists).
async function takeWealthSnapshot(db) {
  const w = await computeWealth(db);
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare("SELECT id FROM wealth_snapshots WHERE date(дата) = date(?)").get(today);
  const row = {
    общо:           w.общо,
    имоти_equity:   w.имоти.equity,
    имоти_asset:    w.имоти.asset_value,
    имоти_debt:     w.имоти.debt,
    имоти_брой:     w.имоти.брой,
    злато:          w.злато.текуща_стойност || 0,
    сребро:         w.сребро.текуща_стойност || 0,
    t212:           w.t212?.обща_стойност || 0,
    болгар:         w.болгар?.текуща_стойност || 0,
    разпределение_json: JSON.stringify(w.разпределение || {}),
  };
  if (existing) {
    db.prepare(`UPDATE wealth_snapshots SET
      дата=CURRENT_TIMESTAMP, общо=?, имоти_equity=?, имоти_asset=?, имоти_debt=?, имоти_брой=?,
      злато=?, сребро=?, t212=?, болгар=?, разпределение_json=?
      WHERE id=?`).run(
      row.общо, row.имоти_equity, row.имоти_asset, row.имоти_debt, row.имоти_брой,
      row.злато, row.сребро, row.t212, row.болгар, row.разпределение_json, existing.id
    );
    return existing.id;
  }
  const r = db.prepare(`INSERT INTO wealth_snapshots
    (общо, имоти_equity, имоти_asset, имоти_debt, имоти_брой, злато, сребро, t212, болгар, разпределение_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    row.общо, row.имоти_equity, row.имоти_asset, row.имоти_debt, row.имоти_брой,
    row.злато, row.сребро, row.t212, row.болгар, row.разпределение_json
  );
  return r.lastInsertRowid;
}

module.exports = { computeWealth, takeWealthSnapshot };
