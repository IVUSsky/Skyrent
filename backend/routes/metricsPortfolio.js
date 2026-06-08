const express = require('express');

const BGN_RATE = 1.95583;
const toEur = (amount, currency) => {
  if (!amount) return 0;
  return (currency || 'EUR').toUpperCase() === 'BGN' ? amount / BGN_RATE : amount;
};

// Skyrent canonical P&L convention (виж backend/routes/expenses.js summary endpoint):
// Opex = ВСИЧКО освен NON_OPEX. NULL category също се брои като opex.
// Това е consistent с /api/expenses/summary endpoint-а.
const NON_OPEX_CATEGORIES = new Set([
  'инвестиция', 'благородни метали', 'ремонт', 'ремонт д',
  // Финансови движения които НЕ са operating expense:
  'вноска', 'депозит_получен', 'депозит_върнат', 'депозит_задържан',
  'equity_inject', 'equity_withdraw', 'заем_sky', 'заем_антон',
  'нап_ддс',  // данък — отделна група, не recurring opex
]);

const RENT_INCOME_CATEGORIES = new Set([
  'наем', 'наем_фактуриран', 'rent',
]);

// Personal scope категории — никога не са business opex.
// (defensive — Skyrent има scope='personal' и 'business', но някои стари записи нямат)
const PERSONAL_ONLY_CATEGORIES = new Set([
  'заплата', 'храна', 'почивка', 'обучение_деца', 'друго_лично', 'здраве',
  'масло_мотор', 'теглене_кеш_за_гърците', 'данък_по_чл.50', 'лихва_болгар',
  'приход_друг', 'разход_друг',
]);

// transactions.дата е DATE формата 'YYYY-MM-DD'; for BGN→EUR преди 2026-01-01,
// EUR след. Конвертираме консистентно в EUR.
const txCurrency = (дата) => {
  if (!дата) return 'EUR';
  return дата < '2026-01-01' ? 'BGN' : 'EUR';
};

function calcCurrentBalance(остатък, вноска, лихва, balance_date) {
  if (!остатък || !вноска || !лихва || !balance_date) return остатък || 0;
  const r = лихва / 100 / 12;
  const now = new Date();
  const from = new Date(balance_date);
  const k = Math.max(0,
    (now.getFullYear() - from.getFullYear()) * 12 +
    (now.getMonth() - from.getMonth())
  );
  if (k === 0) return остатък;
  if (r === 0) return Math.max(0, остатък - вноска * k);
  const factor = Math.pow(1 + r, k);
  return Math.max(0, Math.round((остатък * factor - вноска * (factor - 1) / r) * 100) / 100);
}

/**
 * Forward amortization schedule.
 * Връща { months: [{m, principal, interest, balance_end}], totals: { principal, interest } }.
 *
 * principal = monthly_payment - interest_on_balance
 * interest = balance_at_start × monthly_rate
 *
 * Ако balance падне под нула в рамките на M месеца → последното плащане се коригира
 * (не симулираме предвременно прекратяване — само спираме amortization-а).
 */
function amortizationSchedule(balance, monthlyPayment, annualRatePct, months) {
  const out = { months: [], totals: { principal: 0, interest: 0 } };
  if (!balance || balance <= 0 || !monthlyPayment || monthlyPayment <= 0 || months <= 0) {
    return out;
  }
  const r = (annualRatePct || 0) / 100 / 12;
  let b = balance;
  for (let m = 1; m <= months; m++) {
    if (b <= 0) break;
    const interest = b * r;
    let principal = monthlyPayment - interest;
    if (principal <= 0) {
      // Текущата вноска не покрива и lihvата — теоретично невъзможно при стандартен заем,
      // но при rate spike може; третираме като нулев principal.
      principal = 0;
    }
    if (principal > b) principal = b;
    const balanceEnd = Math.max(0, b - principal);
    out.months.push({
      m,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      balance_end: Math.round(balanceEnd * 100) / 100,
    });
    out.totals.principal += principal;
    out.totals.interest += interest;
    b = balanceEnd;
  }
  out.totals.principal = Math.round(out.totals.principal * 100) / 100;
  out.totals.interest = Math.round(out.totals.interest * 100) / 100;
  return out;
}

function parsePropertyIds(text) {
  if (!text) return [];
  const s = String(text).trim();
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed.map(Number).filter(n => Number.isInteger(n) && n > 0);
      }
    } catch (_) { /* fall through to CSV */ }
  }
  return s
    .replace(/[\[\]"']/g, '')
    .split(/[,;\s]+/)
    .map(t => t.trim())
    .filter(t => /^\d+$/.test(t))
    .map(Number);
}

function periodFloorMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function bucketize(values, edges, labels) {
  const counts = new Array(labels.length).fill(0);
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    let placed = false;
    for (let i = 0; i < edges.length; i++) {
      if (v < edges[i]) { counts[i]++; placed = true; break; }
    }
    if (!placed) counts[counts.length - 1]++;
  }
  return labels.map((bucket, i) => ({ bucket, count: counts[i] }));
}

module.exports = function(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    try {
      const asofDate = new Date();
      const asof = asofDate.toISOString().slice(0, 10);
      const opexFromPeriod = periodFloorMonths(12);

      const properties = db.prepare('SELECT * FROM properties').all();
      const loans = db.prepare('SELECT * FROM loans').all();

      // OPEX source #1: expense_invoices — само BUSINESS scope (или NULL legacy)
      const expensesRows = db.prepare(`
        SELECT property_id, amount, currency, expense_category, месец, scope
        FROM expense_invoices
        WHERE COALESCE(месец, '') >= ?
          AND COALESCE(scope, 'business') = 'business'
      `).all(opexFromPeriod);

      // OPEX source #2: transactions — само BUSINESS scope
      const txRows = db.prepare(`
        SELECT property_id, сума, operation, категория, дата, месец, scope
        FROM transactions
        WHERE operation = 'Дт' AND COALESCE(месец, '') >= ?
          AND COALESCE(scope, 'business') = 'business'
      `).all(opexFromPeriod);

      const opexDirect = new Map();
      let opexCommon = 0;

      const addOpex = (propId, eur) => {
        if (propId) {
          opexDirect.set(propId, (opexDirect.get(propId) || 0) + eur);
        } else {
          opexCommon += eur;
        }
      };

      const isOpexCategory = (cat) => {
        if (!cat) return true;  // NULL category = treated as opex (per Skyrent /summary endpoint)
        const k = cat.trim().toLowerCase();
        if (NON_OPEX_CATEGORIES.has(k)) return false;
        if (PERSONAL_ONLY_CATEGORIES.has(k)) return false;
        return true;
      };

      for (const e of expensesRows) {
        if (!isOpexCategory(e.expense_category)) continue;
        addOpex(e.property_id, toEur(e.amount, e.currency));
      }

      for (const t of txRows) {
        if (!isOpexCategory(t['категория'])) continue;
        addOpex(t.property_id, toEur(Math.abs(t['сума']), txCurrency(t['дата'])));
      }

      // INCOME реално получен — от bank Кт + категория = наем*
      // Само business scope (личен наем не се брои в бизнес portfolio metrics).
      const incomeRows = db.prepare(`
        SELECT property_id, сума, категория, дата, месец, scope
        FROM transactions
        WHERE operation = 'Кт' AND COALESCE(месец, '') >= ?
          AND COALESCE(scope, 'business') = 'business'
      `).all(opexFromPeriod);

      const rentReceivedByProp = new Map();
      let rentReceivedTotal = 0;
      for (const t of incomeRows) {
        const cat = (t['категория'] || '').trim().toLowerCase();
        if (!RENT_INCOME_CATEGORIES.has(cat)) continue;
        const eur = toEur(Math.abs(t['сума']), txCurrency(t['дата']));
        rentReceivedTotal += eur;
        if (t.property_id) {
          rentReceivedByProp.set(t.property_id, (rentReceivedByProp.get(t.property_id) || 0) + eur);
        }
      }

      const propRows = properties.map(p => {
        const rentMonthly = p['наем'] || 0;
        const rentAnnual = rentMonthly * 12;
        const assetVal = (p.market_val != null && p.market_val > 0)
          ? p.market_val
          : (p['покупна'] || 0) + (p['ремонт'] || 0);
        const stage = p.lifecycle_stage || (p['статус'] === '✅' ? 'active' : 'inactive');
        return {
          id: p.id,
          адрес: p['адрес'],
          район: p['район'],
          тип: p['тип'],
          наемател: p['наемател'],
          active: p['статус'] === '✅',
          lifecycle_stage: stage,
          lifecycle_eta_date: p.lifecycle_eta_date || null,
          rent_monthly: rentMonthly,
          rent_annual: rentAnnual,
          rent_received_12m: Math.round((rentReceivedByProp.get(p.id) || 0) * 100) / 100,
          asset_val: assetVal,
          purchase_paid_amount: p.purchase_paid_amount != null
            ? Math.round(p.purchase_paid_amount * 100) / 100
            : null,
          purchase_balance_due: p.purchase_balance_due != null
            ? Math.round(p.purchase_balance_due * 100) / 100
            : null,
          purchase_balance_due_date: p.purchase_balance_due_date || null,
          opex_annual_direct: Math.round((opexDirect.get(p.id) || 0) * 100) / 100,
        };
      });

      const rentTotal = propRows.reduce((s, p) => s + p.rent_annual, 0);
      for (const p of propRows) {
        const share = rentTotal > 0 ? p.rent_annual / rentTotal : 0;
        p.opex_annual_allocated = Math.round(opexCommon * share * 100) / 100;
        p.opex_annual_total = Math.round((p.opex_annual_direct + p.opex_annual_allocated) * 100) / 100;
        p.opex_ratio = p.rent_annual > 0
          ? Math.round((p.opex_annual_total / p.rent_annual) * 10000) / 10000
          : null;
        p.noi_annual = Math.round((p.rent_annual - p.opex_annual_total) * 100) / 100;
      }

      let unallocatedDebt = 0;
      let unallocatedDebtService = 0;
      const debtByProp = new Map();
      const debtServiceByProp = new Map();
      const propIdSet = new Set(properties.map(p => p.id));

      const propAssetById = new Map(propRows.map(p => [p.id, p.asset_val]));

      // Per-loan amortization (12m) + aggregate.
      const loanSchedules = [];
      let portfolioPrincipal12m = 0;
      let portfolioInterest12m = 0;
      const principalByProp = new Map();
      const interestByProp = new Map();

      for (const l of loans) {
        const остатъкCalc = calcCurrentBalance(l['остатък'], l['вноска'], l['лихва'], l['balance_date']);
        const monthlyService = l['вноска'] || 0;
        const debtEur = toEur(остатъкCalc, l.currency);
        const serviceEur = toEur(monthlyService, l.currency) * 12;

        const ids = parsePropertyIds(l['имоти']).filter(id => propIdSet.has(id));

        // 12m amortization за този loan в native currency, после конвертирано в EUR
        const sched = amortizationSchedule(остатъкCalc, monthlyService, l['лихва'], 12);
        const principalNative = sched.totals.principal;
        const interestNative = sched.totals.interest;
        const principalEur = toEur(principalNative, l.currency);
        const interestEur = toEur(interestNative, l.currency);
        portfolioPrincipal12m += principalEur;
        portfolioInterest12m += interestEur;

        loanSchedules.push({
          id: l.id,
          банка: l['банка'],
          договор: l['договор'],
          currency: l.currency || 'EUR',
          balance_now: Math.round(остатъкCalc * 100) / 100,
          balance_now_eur: Math.round(debtEur * 100) / 100,
          monthly_payment: monthlyService,
          principal_12m: principalNative,
          interest_12m: interestNative,
          principal_12m_eur: Math.round(principalEur * 100) / 100,
          interest_12m_eur: Math.round(interestEur * 100) / 100,
          balance_after_12m_eur: Math.round((debtEur - principalEur) * 100) / 100,
        });

        if (ids.length === 0) {
          unallocatedDebt += debtEur;
          unallocatedDebtService += serviceEur;
          continue;
        }

        // Asset-weighted split: големите imota поемат по-голям дял от collateral debt.
        // Ако всички asset_val са 0 → fallback equal split.
        const weights = ids.map(id => propAssetById.get(id) || 0);
        const wTotal = weights.reduce((s, w) => s + w, 0);
        const useWeighted = wTotal > 0;

        ids.forEach((id, i) => {
          const share = useWeighted ? weights[i] / wTotal : 1 / ids.length;
          debtByProp.set(id, (debtByProp.get(id) || 0) + debtEur * share);
          debtServiceByProp.set(id, (debtServiceByProp.get(id) || 0) + serviceEur * share);
          principalByProp.set(id, (principalByProp.get(id) || 0) + principalEur * share);
          interestByProp.set(id, (interestByProp.get(id) || 0) + interestEur * share);
        });
      }

      for (const p of propRows) {
        p.allocated_debt = Math.round((debtByProp.get(p.id) || 0) * 100) / 100;
        p.allocated_debt_service = Math.round((debtServiceByProp.get(p.id) || 0) * 100) / 100;
        p.principal_paydown_12m = Math.round((principalByProp.get(p.id) || 0) * 100) / 100;
        p.interest_12m = Math.round((interestByProp.get(p.id) || 0) * 100) / 100;
        p.ltv = p.asset_val > 0 ? Math.round((p.allocated_debt / p.asset_val) * 10000) / 10000 : null;
        p.cap_rate = p.asset_val > 0 ? Math.round((p.noi_annual / p.asset_val) * 10000) / 10000 : null;
        p.expense_ratio = p.opex_ratio;
        p.net_cash_flow = Math.round((p.noi_annual - p.allocated_debt_service) * 100) / 100;
        const equityInvested = p.asset_val - p.allocated_debt;
        p.cash_on_cash = equityInvested > 0
          ? Math.round((p.net_cash_flow / equityInvested) * 10000) / 10000
          : null;
      }

      const rankBy = (arr, key, dir = 'desc') => {
        const idx = [...arr.keys()]
          .filter(i => arr[i][key] != null)
          .sort((a, b) => dir === 'desc' ? arr[b][key] - arr[a][key] : arr[a][key] - arr[b][key]);
        const ranks = new Map();
        idx.forEach((i, rank) => ranks.set(arr[i].id, rank + 1));
        return ranks;
      };
      const noiRanks = rankBy(propRows, 'noi_annual', 'desc');
      const capRanks = rankBy(propRows, 'cap_rate', 'desc');
      const exrRanks = rankBy(propRows, 'expense_ratio', 'asc');
      for (const p of propRows) {
        p.rank = {
          noi: noiRanks.get(p.id) || null,
          cap_rate: capRanks.get(p.id) || null,
          expense_ratio: exrRanks.get(p.id) || null,
        };
      }

      const activeProps = propRows.filter(p => p.active);
      const portfolioRentMonthly = activeProps.reduce((s, p) => s + p.rent_monthly, 0);
      const portfolioRentAnnual = portfolioRentMonthly * 12;
      const portfolioAssetBase = propRows.reduce((s, p) => s + p.asset_val, 0);
      const portfolioOpexAnnual = propRows.reduce((s, p) => s + p.opex_annual_total, 0);
      const portfolioDebtAllocated = propRows.reduce((s, p) => s + p.allocated_debt, 0);
      const portfolioTotalDebt = portfolioDebtAllocated + unallocatedDebt;
      const portfolioDebtServiceAllocated = propRows.reduce((s, p) => s + p.allocated_debt_service, 0);
      const portfolioDebtServiceTotal = portfolioDebtServiceAllocated + unallocatedDebtService;
      const portfolioNoi = portfolioRentAnnual - portfolioOpexAnnual;
      const portfolioEquity = portfolioAssetBase - portfolioTotalDebt;

      // Lifecycle groupings + pre-construction финансово отражение
      const propsByStage = {};
      for (const p of propRows) {
        const k = p.lifecycle_stage || 'inactive';
        propsByStage[k] = (propsByStage[k] || 0) + 1;
      }

      const offPlanObligations = propRows.reduce(
        (s, p) => s + (p.purchase_balance_due || 0), 0
      );
      const realEquity = portfolioEquity - offPlanObligations;
      const realLtv = portfolioAssetBase > 0
        ? (portfolioTotalDebt + offPlanObligations) / portfolioAssetBase
        : null;

      // Projected rent ако всичко с rent_monthly>0 в non-inactive stage стане active.
      // Не екстраполираме за имоти БЕЗ договорен наем (pre_construction Симеоново имат rent=0)
      // — те ще се добавят при активиране през UI.
      const projectableStages = new Set(['active', 'listing', 'furnishing', 'renovating']);
      const projectedRentMonthly = propRows
        .filter(p => projectableStages.has(p.lifecycle_stage) && p.rent_monthly > 0)
        .reduce((s, p) => s + p.rent_monthly, 0);
      const projectedRentAnnual = projectedRentMonthly * 12;

      const totalRentForShares = activeProps.reduce((s, p) => s + p.rent_annual, 0);
      const shares = activeProps
        .map(p => totalRentForShares > 0 ? p.rent_annual / totalRentForShares : 0)
        .sort((a, b) => b - a);
      const top5Share = shares.slice(0, 5).reduce((s, v) => s + v, 0);
      const top1Share = shares[0] || 0;
      const herfindahl = shares.reduce((s, v) => s + v * v, 0);

      const capRateValues = propRows.map(p => p.cap_rate).filter(v => v != null);
      const exrValues = propRows.map(p => p.expense_ratio).filter(v => v != null);

      const portfolio = {
        properties_total: propRows.length,
        properties_active: activeProps.length,
        rent_received_12m: Math.round(rentReceivedTotal * 100) / 100,
        asset_base: Math.round(portfolioAssetBase * 100) / 100,
        total_debt: Math.round(portfolioTotalDebt * 100) / 100,
        unallocated_debt: Math.round(unallocatedDebt * 100) / 100,
        equity: Math.round(portfolioEquity * 100) / 100,
        ltv: portfolioAssetBase > 0
          ? Math.round((portfolioTotalDebt / portfolioAssetBase) * 10000) / 10000
          : null,
        rent_monthly: Math.round(portfolioRentMonthly * 100) / 100,
        rent_annual: Math.round(portfolioRentAnnual * 100) / 100,
        opex_annual: Math.round(portfolioOpexAnnual * 100) / 100,
        opex_ratio: portfolioRentAnnual > 0
          ? Math.round((portfolioOpexAnnual / portfolioRentAnnual) * 10000) / 10000
          : null,
        noi_annual: Math.round(portfolioNoi * 100) / 100,
        debt_service_annual: Math.round(portfolioDebtServiceTotal * 100) / 100,
        dscr: portfolioDebtServiceTotal > 0
          ? Math.round((portfolioNoi / portfolioDebtServiceTotal) * 10000) / 10000
          : null,
        cap_rate: portfolioAssetBase > 0
          ? Math.round((portfolioNoi / portfolioAssetBase) * 10000) / 10000
          : null,
        net_cash_flow_annual: Math.round((portfolioNoi - portfolioDebtServiceTotal) * 100) / 100,
        cash_on_cash: portfolioEquity > 0
          ? Math.round(((portfolioNoi - portfolioDebtServiceTotal) / portfolioEquity) * 10000) / 10000
          : null,
        // Pre-construction финансово отражение — отделя бъдещи обвързаности от текущ equity
        off_plan_obligations: Math.round(offPlanObligations * 100) / 100,
        real_equity: Math.round(realEquity * 100) / 100,
        real_ltv: realLtv != null ? Math.round(realLtv * 10000) / 10000 : null,
        // Forward-looking: rent при пълна заетост на не-inactive имоти
        projected_rent_monthly: Math.round(projectedRentMonthly * 100) / 100,
        projected_rent_annual: Math.round(projectedRentAnnual * 100) / 100,
        // Lifecycle breakdown
        properties_by_stage: propsByStage,
        // Amortization (12m forward)
        principal_paydown_12m: Math.round(portfolioPrincipal12m * 100) / 100,
        interest_12m: Math.round(portfolioInterest12m * 100) / 100,
        debt_after_12m: Math.round((portfolioTotalDebt - portfolioPrincipal12m) * 100) / 100,
        principal_share_12m: portfolioDebtServiceTotal > 0
          ? Math.round((portfolioPrincipal12m / portfolioDebtServiceTotal) * 10000) / 10000
          : null,
        concentration: {
          top5_rent_share: Math.round(top5Share * 10000) / 10000,
          top1_rent_share: Math.round(top1Share * 10000) / 10000,
          herfindahl: Math.round(herfindahl * 10000) / 10000,
        },
      };

      const distributions = {
        cap_rate: bucketize(
          capRateValues,
          [0, 0.03, 0.05, 0.07, 0.10, Infinity],
          ['<0%', '0-3%', '3-5%', '5-7%', '7-10%', '>10%']
        ),
        expense_ratio: bucketize(
          exrValues,
          [0.10, 0.20, 0.30, 0.50, Infinity],
          ['<10%', '10-20%', '20-30%', '30-50%', '>50%']
        ),
      };

      res.json({
        asof,
        currency: 'EUR',
        opex_period_from: opexFromPeriod,
        portfolio,
        by_property: propRows,
        distributions,
        loan_schedules: loanSchedules,
      });
    } catch (err) {
      console.error('[metrics/portfolio] error', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
