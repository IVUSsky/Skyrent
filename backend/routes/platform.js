// Платформени route-ове (SaaS Phase 1) — само superadmin (ти).
// Провизиране и преглед на организации. Публичен signup = Phase 2.
const express = require('express');

module.exports = function (controlDb, getOrgDb) {
  const router = express.Router();

  // Guard: само superadmin (claim-ът влиза в JWT при login)
  router.use((req, res, next) => {
    if (!req.user?.is_superadmin) return res.status(403).json({ error: 'Forbidden' });
    next();
  });

  // GET /api/platform/orgs — списък организации + брой потребители
  router.get('/orgs', (req, res) => {
    try {
      const orgs = controlDb.prepare(`
        SELECT o.id, o.name, o.status, o.created_at,
               (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id) AS user_count
        FROM organizations o ORDER BY o.id
      `).all();
      res.json(orgs);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/platform/orgs — нова организация + owner акаунт
  // Body: { name, owner_username, owner_password, owner_email? , owner_name? }
  router.post('/orgs', (req, res) => {
    try {
      const { createOrg } = require('../lib/createOrg');
      const r = createOrg(controlDb, getOrgDb, req.body || {});
      res.status(201).json({ ok: true, ...r });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  // PATCH /api/platform/orgs/:id — статус (active|suspended)
  router.patch('/orgs/:id', (req, res) => {
    try {
      const { status, name } = req.body || {};
      if (status && !['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'status: active|suspended' });
      if (Number(req.params.id) === 1 && status === 'suspended') return res.status(400).json({ error: 'Org 1 не може да се suspend-не' });
      const sets = [], vals = [];
      if (status) { sets.push('status=?'); vals.push(status); }
      if (name)   { sets.push('name=?');   vals.push(name); }
      if (!sets.length) return res.status(400).json({ error: 'нищо за промяна' });
      vals.push(req.params.id);
      controlDb.prepare('UPDATE organizations SET ' + sets.join(', ') + ' WHERE id=?').run(...vals);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
