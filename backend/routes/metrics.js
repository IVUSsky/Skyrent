const express = require('express');
module.exports = function(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const properties = db.prepare('SELECT * FROM properties').all();
    const loans = db.prepare('SELECT * FROM loans').all();

    // Rent metrics
    const activeProps = properties.filter(p => p['статус'] === '✅');
    const активен_наем = activeProps.reduce((sum, p) => sum + (p['наем'] || 0), 0);
    const наем_мес = активен_наем;
    const наем_год = активен_наем * 12;

    // Loan metrics
    const total_debt = loans.reduce((sum, l) => sum + (l['остатък'] || 0), 0);
    const total_вноска = loans.reduce((sum, l) => sum + (l['вноска'] || 0), 0);

    // Asset base: use market_val if set, otherwise покупна+ремонт
    const asset_base = properties.reduce((sum, p) => {
      const val = p.market_val != null && p.market_val > 0
        ? p.market_val
        : (p['покупна'] || 0) + (p['ремонт'] || 0);
      return sum + val;
    }, 0);

    // Derived metrics
    const NOI = наем_год * 0.90;
    const DSCR = total_вноска > 0 ? NOI / (total_вноска * 12) : null;
    const equity = asset_base - total_debt;
    const LTV = asset_base > 0 ? total_debt / asset_base : null;
    const cap_rate = asset_base > 0 ? NOI / asset_base : null;
    const net_cf = активен_наем - total_вноска - активен_наем * 0.10;

    // By group
    const апартаментTypes = new Set(['1-стаен','2-стаен','3-стаен','Мезонет']);
    const гаражTypes = new Set(['Гараж']);
    const паркоместаTypes = new Set(['Паркомясто']);

    function groupStats(typeSet) {
      const group = properties.filter(p => typeSet.has(p['тип']));
      const active = group.filter(p => p['статус'] === '✅');
      const monthly_rent = active.reduce((s, p) => s + (p['наем'] || 0), 0);
      const annual_rent = monthly_rent * 12;
      const asset_val = group.reduce((s, p) => {
        const val = p.market_val != null && p.market_val > 0
          ? p.market_val
          : (p['покупна'] || 0) + (p['ремонт'] || 0);
        return s + val;
      }, 0);
      return { count: group.length, active_count: active.length, monthly_rent, annual_rent, asset_val };
    }

    const by_group = {
      'Апартамент': groupStats(апартаментTypes),
      'Гараж': groupStats(гаражTypes),
      'Паркомясто': groupStats(паркоместаTypes),
    };

    const total_properties = properties.length;
    const active_properties = activeProps.length;

    res.json({
      активен_наем,
      наем_мес,
      наем_год,
      total_debt,
      total_вноска,
      asset_base,
      NOI,
      DSCR,
      equity,
      LTV,
      cap_rate,
      net_cf,
      by_group,
      total_properties,
      active_properties,
    });
  });

  return router;
};
