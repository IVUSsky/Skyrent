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

module.exports = function(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const loans = db.prepare('SELECT * FROM loans ORDER BY id').all();
    const result = loans.map(l => ({
      ...l,
      остатък_calc: calcCurrentBalance(l['остатък'], l['вноска'], l['лихва'], l['balance_date']),
    }));
    res.json(result);
  });

  router.put('/:id', (req, res) => {
    try {
      const { остатък, вноска, лихва, краен, balance_date } = req.body;
      const id = req.params.id;
      const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(id);
      if (!loan) return res.status(404).json({ error: 'Not found' });

      db.prepare(`
        UPDATE loans SET
          остатък = ?,
          вноска  = ?,
          лихва   = ?,
          краен   = ?,
          balance_date = ?
        WHERE id = ?
      `).run(
        остатък  !== undefined ? Number(остатък)  : loan['остатък'],
        вноска   !== undefined ? Number(вноска)   : loan['вноска'],
        лихва    !== undefined ? Number(лихва)    : loan['лихва'],
        краен    !== undefined ? Number(краен)    : loan['краен'],
        balance_date || loan['balance_date'] || new Date().toISOString().slice(0, 10),
        id
      );

      const updated = db.prepare('SELECT * FROM loans WHERE id = ?').get(id);
      res.json({
        ...updated,
        остатък_calc: calcCurrentBalance(updated['остатък'], updated['вноска'], updated['лихва'], updated['balance_date']),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
