/**
 * Standalone smoke test за /api/metrics/portfolio.
 *
 * Зарежда локалната БД, вика handler-а директно (без Express/JWT),
 * проверява invariant-и и принтва JSON в конзолата.
 *
 * Run:  node backend/scripts/test_portfolio_metrics.js
 */
const path = require('path');
const { initDb } = require('../db/db');
const routerFactory = require('../routes/metricsPortfolio');

(async () => {
  const db = await initDb();
  const router = routerFactory(db);

  const handler = router.stack.find(l => l.route && l.route.path === '/').route.stack[0].handle;

  let capturedStatus = 200;
  let capturedBody = null;
  const res = {
    status(code) { capturedStatus = code; return this; },
    json(obj)    { capturedBody = obj; return this; },
  };
  handler({}, res);

  if (capturedStatus !== 200) {
    console.error('FAIL: status', capturedStatus, capturedBody);
    process.exit(1);
  }

  const data = capturedBody;
  const p = data.portfolio;

  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass, detail });

  check('properties_total > 0', p.properties_total > 0, `=${p.properties_total}`);
  check('asset_base > 0',      p.asset_base > 0,      `=${p.asset_base}`);
  check('rent_annual = rent_monthly * 12',
    Math.abs(p.rent_annual - p.rent_monthly * 12) < 0.5,
    `${p.rent_annual} vs ${p.rent_monthly * 12}`);
  check('opex_ratio in [0, 1]',
    p.opex_ratio == null || (p.opex_ratio >= 0 && p.opex_ratio <= 1),
    `=${p.opex_ratio}`);
  check('noi_annual = rent_annual - opex_annual',
    Math.abs(p.noi_annual - (p.rent_annual - p.opex_annual)) < 0.5,
    `${p.noi_annual} vs ${p.rent_annual - p.opex_annual}`);

  const sumByPropRent = data.by_property.filter(x => x.active).reduce((s, x) => s + x.rent_annual, 0);
  check('Σ by_property(active).rent_annual = portfolio.rent_annual',
    Math.abs(sumByPropRent - p.rent_annual) < 1,
    `${sumByPropRent} vs ${p.rent_annual}`);

  const sumByPropDebt = data.by_property.reduce((s, x) => s + x.allocated_debt, 0);
  check('Σ allocated_debt + unallocated = total_debt',
    Math.abs(sumByPropDebt + p.unallocated_debt - p.total_debt) < 1,
    `${sumByPropDebt} + ${p.unallocated_debt} vs ${p.total_debt}`);

  check('concentration herfindahl in [0, 1]',
    p.concentration.herfindahl >= 0 && p.concentration.herfindahl <= 1,
    `=${p.concentration.herfindahl}`);

  const noFinite = data.by_property.filter(x =>
    [x.cap_rate, x.ltv, x.opex_ratio, x.cash_on_cash].some(v => v != null && !Number.isFinite(v))
  );
  check('no Infinity/NaN in per-property metrics',
    noFinite.length === 0,
    `bad=${noFinite.length}`);

  console.log('\n══════════ INVARIANT CHECKS ══════════');
  for (const c of checks) {
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  ${c.detail}`);
  }
  const failed = checks.filter(c => !c.pass).length;
  console.log(`\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}\n`);

  console.log('══════════ PORTFOLIO ══════════');
  console.log(JSON.stringify(p, null, 2));
  console.log('\n══════════ TOP 5 by Cap Rate ══════════');
  const top5 = [...data.by_property]
    .filter(x => x.cap_rate != null)
    .sort((a, b) => b.cap_rate - a.cap_rate)
    .slice(0, 5)
    .map(x => ({
      id: x.id,
      адрес: x.адрес,
      rent: x.rent_annual,
      noi: x.noi_annual,
      cap: (x.cap_rate * 100).toFixed(2) + '%',
      ltv: x.ltv == null ? '-' : (x.ltv * 100).toFixed(1) + '%',
    }));
  console.table(top5);

  console.log('══════════ BOTTOM 5 by Cap Rate ══════════');
  const bot5 = [...data.by_property]
    .filter(x => x.cap_rate != null)
    .sort((a, b) => a.cap_rate - b.cap_rate)
    .slice(0, 5)
    .map(x => ({
      id: x.id,
      адрес: x.адрес,
      rent: x.rent_annual,
      noi: x.noi_annual,
      cap: (x.cap_rate * 100).toFixed(2) + '%',
      opex_r: (x.opex_ratio * 100).toFixed(1) + '%',
    }));
  console.table(bot5);

  console.log('══════════ DISTRIBUTIONS ══════════');
  console.log('Cap Rate buckets:');  console.table(data.distributions.cap_rate);
  console.log('Expense Ratio buckets:'); console.table(data.distributions.expense_ratio);

  process.exit(failed === 0 ? 0 : 1);
})().catch(err => {
  console.error('ERROR', err);
  process.exit(2);
});
