// White-label настройка — agency функция (capability 'white_label').
// Когато е включена, „Powered by Skyrent" се скрива на публичните обяви на
// тази организация (и в бъдеще: tenant портал, имейли). GET е достъпен за
// всички (за да покаже locked/upgrade състоянието); POST е gated.

const express = require('express');
const { hasCapability } = require('../lib/plans');

module.exports = function (db) {
  const router = express.Router();

  const orgPlan = () => {
    try { return db.control.prepare('SELECT plan FROM organizations WHERE id=?').get(db.orgId)?.plan || 'basic'; }
    catch { return 'basic'; }
  };
  const canUse = () => db.orgId === 1 || hasCapability(orgPlan(), 'white_label');
  const readEnabled = () => {
    try { const r = db.prepare("SELECT value FROM settings WHERE key='white_label'").get(); return !!r && (r.value === 'true' || r.value === '"true"'); }
    catch { return false; }
  };

  router.get('/', (req, res) => {
    const available = canUse();
    res.json({ available, enabled: available && readEnabled() });
  });

  router.post('/', (req, res) => {
    if (!canUse()) return res.status(402).json({ error: 'White-label е налично в Agency плана', capability: 'white_label' });
    const enabled = !!(req.body && req.body.enabled);
    try { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('white_label', ?)").run(enabled ? 'true' : 'false'); } catch (_) {}
    res.json({ ok: true, enabled });
  });

  return router;
};
