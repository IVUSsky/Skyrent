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
    // Тип лице: 'individual' (физическо, без фактури) | 'company' (по подразбиране)
    let entity_type = 'company';
    try { const e = db.prepare("SELECT value FROM settings WHERE key='entity_type'").get(); if (e && String(e.value).replace(/^"|"$/g, '') === 'individual') entity_type = 'individual'; } catch (_) {}
    const hasProfile = !!(issuer.name && issuer.eik);
    const property = exists('SELECT 1 FROM properties LIMIT 1');
    let dismissed = false;
    try { const d = db.prepare("SELECT value FROM settings WHERE key='onboarding_dismissed'").get(); dismissed = !!d && (d.value === 'true' || d.value === '1' || d.value === '"true"'); } catch (_) {}
    // setup_done: дали клиентът е минал началния избор на сценарий (welcome wizard)
    let setup_done = false;
    try { const su = db.prepare("SELECT value FROM settings WHERE key='setup_done'").get(); setup_done = !!su && (su.value === 'true' || su.value === '"true"'); } catch (_) {}

    let steps, complete;
    if (entity_type === 'individual') {
      // Физическо лице → без стъпка „фактура" (декларира по чл.50, не фактурира)
      steps = { profile: hasProfile, property };
      complete = hasProfile && property;
    } else {
      const invoice = exists('SELECT 1 FROM rent_invoices LIMIT 1');
      steps = { company: hasProfile, property, invoice };
      complete = hasProfile && property && invoice;
    }
    res.json({ entity_type, steps, complete, dismissed, setup_done, has_property: property });
  });

  router.post('/dismiss', (req, res) => {
    try { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('onboarding_dismissed', 'true')").run(); } catch (_) {}
    res.json({ ok: true });
  });

  return router;
};
