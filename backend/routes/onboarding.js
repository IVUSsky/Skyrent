// Onboarding статус за нов акаунт — кои първи стъпки са завършени.
// Захранва checklist-а в UI, който води новия наемодател до първа стойност:
//   1) фирмени данни (issuer) → 2) първи имот → 3) първа фактура.
// Org-scoped (dbProxy). Лек — само COUNT/EXISTS, без зареждане на списъци.

const express = require('express');

module.exports = function (db) {
  const router = express.Router();

  const exists = (sql) => { try { return !!db.prepare(sql).get(); } catch { return false; } };

  router.get('/', (req, res) => {
    let issuer = {};
    try { const r = db.prepare("SELECT value FROM settings WHERE key='issuer'").get(); if (r) issuer = JSON.parse(r.value) || {}; } catch (_) {}
    const company = !!(issuer.name && issuer.eik);
    const property = exists('SELECT 1 FROM properties LIMIT 1');
    const invoice = exists('SELECT 1 FROM rent_invoices LIMIT 1');
    let dismissed = false;
    try { const d = db.prepare("SELECT value FROM settings WHERE key='onboarding_dismissed'").get(); dismissed = !!d && (d.value === 'true' || d.value === '1' || d.value === '"true"'); } catch (_) {}
    res.json({ steps: { company, property, invoice }, complete: company && property && invoice, dismissed });
  });

  router.post('/dismiss', (req, res) => {
    try { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('onboarding_dismissed', 'true')").run(); } catch (_) {}
    res.json({ ok: true });
  });

  return router;
};
