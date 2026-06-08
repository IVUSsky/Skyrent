const express = require('express');

/**
 * Calculates current loan balance using standard amortization:
 * B(k) = B0 * (1+r)^k  -  PMT * ((1+r)^k - 1) / r
 * where B0 = balance at balance_date, r = monthly rate, k = months elapsed
 */
function calcCurrentBalance(остатък, вноска, лихва, balance_date) {
  if (!остатък || !вноска || !лихва || !balance_date) return остатък || 0;

  const r = лихва / 100 / 12;
  const now = new Date();
  const from = new Date(balance_date);

  // months elapsed since balance_date
  const k = Math.max(0,
    (now.getFullYear() - from.getFullYear()) * 12 +
    (now.getMonth() - from.getMonth())
  );

  if (k === 0) return остатък;
  if (r === 0) return Math.max(0, остатък - вноска * k);

  const factor = Math.pow(1 + r, k);
  const current = остатък * factor - вноска * (factor - 1) / r;
  return Math.max(0, Math.round(current * 100) / 100);
}

const BGN_RATE = 1.95583;
const toEur = (amount, currency) => {
  if (!amount) return 0;
  return (currency || 'EUR').toUpperCase() === 'BGN' ? amount / BGN_RATE : amount;
};

module.exports = function(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const loans = db.prepare('SELECT * FROM loans ORDER BY id').all();
    const result = loans.map(l => ({
      ...l,
      currency: l.currency || 'EUR',
      остатък_calc: calcCurrentBalance(l['остатък'], l['вноска'], l['лихва'], l['balance_date']),
    }));
    res.json(result);
  });

  // Месечна вноска по график — общо + per loan, в EUR
  router.get('/schedule-summary', (req, res) => {
    try {
      const loans = db.prepare('SELECT * FROM loans').all();
      const items = loans.map(l => ({
        id: l.id,
        банка: l.банка,
        договор: l.договор,
        кредитополучател: l.кредитополучател,
        вноска: l.вноска,
        currency: l.currency || 'EUR',
        вноска_eur: toEur(l.вноска, l.currency),
        краен: l.краен,
      }));
      const total_monthly_eur = items.reduce((s, i) => s + i.вноска_eur, 0);

      // Per borrower breakdown
      const byBorrower = {};
      for (const it of items) {
        const k = it.кредитополучател || 'Други';
        byBorrower[k] = (byBorrower[k] || 0) + it.вноска_eur;
      }

      res.json({
        total_monthly_eur,
        active_count: items.length,
        items,
        byBorrower: Object.entries(byBorrower).map(([name, total]) => ({ кредитополучател: name, monthly_eur: total })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Месечен график за период — масив { месец, scheduled_eur } за месеците в [from, to]
  router.get('/schedule-monthly', (req, res) => {
    try {
      const { from, to } = req.query;
      if (!from || !to) return res.status(400).json({ error: 'from и to са задължителни (YYYY-MM)' });
      const loans = db.prepare('SELECT вноска, краен, currency FROM loans').all();

      const months = [];
      const [yF, mF] = from.split('-').map(Number);
      const [yT, mT] = to.split('-').map(Number);
      let y = yF, m = mF;
      while (y < yT || (y === yT && m <= mT)) {
        const ym = `${y}-${String(m).padStart(2, '0')}`;
        const activeSum = loans.reduce((s, l) => {
          if (l.краен && l.краен < y) return s; // приключил преди тази година
          return s + toEur(l.вноска, l.currency);
        }, 0);
        months.push({ месец: ym, scheduled_eur: activeSum });
        m++;
        if (m > 12) { m = 1; y++; }
      }
      res.json(months);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', (req, res) => {
    try {
      const { остатък, вноска, лихва, краен, balance_date, currency, имоти } = req.body;
      const id = req.params.id;
      const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(id);
      if (!loan) return res.status(404).json({ error: 'Not found' });

      // Валидация на имоти полето: ако се подава, трябва да е JSON array от ints
      let imotiStr = loan['имоти'];
      if (имоти !== undefined) {
        const arr = Array.isArray(имоти) ? имоти : (typeof имоти === 'string' ? JSON.parse(имоти) : null);
        if (!Array.isArray(arr)) return res.status(400).json({ error: 'имоти must be array' });
        const cleaned = arr.map(Number).filter(n => Number.isInteger(n) && n > 0);
        imotiStr = JSON.stringify(cleaned);
      }

      db.prepare(`
        UPDATE loans SET
          остатък = ?,
          вноска  = ?,
          лихва   = ?,
          краен   = ?,
          balance_date = ?,
          currency = ?,
          имоти   = ?
        WHERE id = ?
      `).run(
        остатък  !== undefined ? Number(остатък)  : loan['остатък'],
        вноска   !== undefined ? Number(вноска)   : loan['вноска'],
        лихва    !== undefined ? Number(лихва)    : loan['лихва'],
        краен    !== undefined ? Number(краен)    : loan['краен'],
        balance_date || loan['balance_date'] || new Date().toISOString().slice(0, 10),
        (currency || loan.currency || 'EUR').toUpperCase(),
        imotiStr,
        id
      );

      const updated = db.prepare('SELECT * FROM loans WHERE id = ?').get(id);
      res.json({
        ...updated,
        currency: updated.currency || 'EUR',
        остатък_calc: calcCurrentBalance(updated['остатък'], updated['вноска'], updated['лихва'], updated['balance_date']),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
