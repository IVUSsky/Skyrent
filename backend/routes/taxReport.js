// Данъчни справки за наем (физически лица).
// Ниво 1: годишна справка по чл. 50 ЗДДФЛ (Приложение 4).
// Ниво 2: тримесечни авансови вноски (чл. 67) + справка за декларация чл. 55.
// Доход = записани наемни фактури за периода (по `month`); fallback наем × брой
// месеци при липса на записи. Аванс = доход × 0.9 × 10% (= 9% от брутото).

const express = require('express');
const { buildChl50Report } = require('../lib/chl50Pdf');

const ALL_MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const Q_MONTHS = { 1: ['01', '02', '03'], 2: ['04', '05', '06'], 3: ['07', '08', '09'], 4: ['10', '11', '12'] };
const Q_DEADLINE = { 1: '30 април', 2: '31 юли', 3: '31 октомври' }; // Q4 → няма аванс (годишна ГДД)

module.exports = function (db) {
  const router = express.Router();

  function incomeForMonths(year, months) {
    const keys = months.map(m => `${year}-${m}`);
    const props = db.prepare('SELECT id, адрес, наем FROM properties').all();
    const inc = {};
    try {
      const ph = keys.map(() => '?').join(',');
      db.prepare(`SELECT property_id, SUM(CASE WHEN type='credit_note' THEN -amount ELSE amount END) AS income
                  FROM rent_invoices WHERE month IN (${ph}) GROUP BY property_id`).all(...keys)
        .forEach(r => { inc[r.property_id] = Number(r.income) || 0; });
    } catch (_) {}
    return props.map(p => {
      const recorded = inc[p.id] != null && inc[p.id] !== 0;
      return {
        address: p['адрес'] || ('Имот #' + p.id),
        income: recorded ? inc[p.id] : (Number(p['наем']) || 0) * months.length,
        estimate: !recorded,
      };
    }).filter(r => r.income > 0);
  }
  const sum = (rows) => rows.reduce((s, r) => s + r.income, 0);
  function declarant() {
    try { const s = db.prepare("SELECT value FROM settings WHERE key='issuer'").get(); if (s) return (JSON.parse(s.value) || {}).name || ''; } catch (_) {}
    return '';
  }
  const validYear = (y) => (/^\d{4}$/.test(String(y || '')) ? String(y) : String(new Date().getFullYear()));

  // JSON: годишни числа + тримесечни аванси (Q1–Q3)
  router.get('/chl50', (req, res) => {
    const year = validYear(req.query.year);
    const rows = incomeForMonths(year, ALL_MONTHS);
    const gross = sum(rows);
    const deductible = gross * 0.10, base = gross - deductible, tax = base * 0.10;
    const quarters = [1, 2, 3].map(q => {
      const g = sum(incomeForMonths(year, Q_MONTHS[q]));
      return { q, gross: g, advance: g * 0.9 * 0.10, deadline: `${Q_DEADLINE[q]} ${year} г.` };
    });
    res.json({ year, count: rows.length, has_estimates: rows.some(r => r.estimate), gross, deductible, base, tax, quarters });
  });

  // PDF годишна справка (чл. 50)
  router.get('/chl50.pdf', async (req, res) => {
    try {
      const year = validYear(req.query.year);
      const pdf = await buildChl50Report({ year, declarant: declarant(), rows: incomeForMonths(year, ALL_MONTHS) });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="spravka-naem-chl50-${year}.pdf"`);
      res.send(pdf);
    } catch (e) { res.status(500).json({ error: 'Грешка при генериране' }); }
  });

  // PDF тримесечна справка (за декларация по чл. 55)
  router.get('/chl55.pdf', async (req, res) => {
    try {
      const year = validYear(req.query.year);
      const q = Number(req.query.quarter);
      if (![1, 2, 3].includes(q)) return res.status(400).json({ error: 'Невалидно тримесечие (1–3)' });
      const pdf = await buildChl50Report({
        year, declarant: declarant(), rows: incomeForMonths(year, Q_MONTHS[q]),
        title: 'СПРАВКА ЗА АВАНСОВ ДАНЪК ВЪРХУ НАЕМ',
        subtitle: `Тримесечие ${q} / ${year} г. · за декларация по чл. 55 ЗДДФЛ · срок ${Q_DEADLINE[q]} ${year} г.`,
        taxLabel: 'Дължим авансов данък (10%)',
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="avans-naem-chl55-${year}-Q${q}.pdf"`);
      res.send(pdf);
    } catch (e) { res.status(500).json({ error: 'Грешка при генериране' }); }
  });

  return router;
};
