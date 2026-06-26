// Данъчни справки за наем. Ниво 1: годишна справка по чл. 50 ЗДДФЛ (Приложение 4)
// за физически лица. Доходът = записаните наемни фактури за годината (по `month`);
// при липса на записи за имот → fallback оценка (наем × 12).

const express = require('express');
const { buildChl50Report } = require('../lib/chl50Pdf');

module.exports = function (db) {
  const router = express.Router();

  function gatherRows(year) {
    const props = db.prepare('SELECT id, адрес, наем FROM properties').all();
    const inc = {};
    try {
      db.prepare(`SELECT property_id, SUM(CASE WHEN type='credit_note' THEN -amount ELSE amount END) AS income
                  FROM rent_invoices WHERE substr(month,1,4)=? GROUP BY property_id`).all(year)
        .forEach(r => { inc[r.property_id] = Number(r.income) || 0; });
    } catch (_) {}
    return props.map(p => {
      const recorded = inc[p.id] != null && inc[p.id] !== 0;
      return {
        address: p['адрес'] || ('Имот #' + p.id),
        income: recorded ? inc[p.id] : (Number(p['наем']) || 0) * 12,
        estimate: !recorded,
      };
    }).filter(r => r.income > 0);
  }
  function declarant() {
    try { const s = db.prepare("SELECT value FROM settings WHERE key='issuer'").get(); if (s) return (JSON.parse(s.value) || {}).name || ''; } catch (_) {}
    return '';
  }
  const validYear = (y) => (/^\d{4}$/.test(String(y || '')) ? String(y) : String(new Date().getFullYear()));

  // JSON preview — за UI-то (числа преди сваляне)
  router.get('/chl50', (req, res) => {
    const year = validYear(req.query.year);
    const rows = gatherRows(year);
    const gross = rows.reduce((s, r) => s + r.income, 0);
    const deductible = gross * 0.10, base = gross - deductible, tax = base * 0.10;
    res.json({
      year, count: rows.length, has_estimates: rows.some(r => r.estimate),
      gross, deductible, base, tax,
    });
  });

  // PDF справка
  router.get('/chl50.pdf', async (req, res) => {
    try {
      const year = validYear(req.query.year);
      const pdf = await buildChl50Report({ year, declarant: declarant(), rows: gatherRows(year) });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="spravka-naem-chl50-${year}.pdf"`);
      res.send(pdf);
    } catch (e) {
      res.status(500).json({ error: 'Грешка при генериране на справката' });
    }
  });

  return router;
};
