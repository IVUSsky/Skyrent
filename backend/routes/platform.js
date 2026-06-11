// Платформени route-ове (SaaS Phase 1) — само superadmin (ти).
// Провизиране и преглед на организации. Публичен signup = Phase 2.
const express = require('express');
const bcrypt = require('bcryptjs');

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
      const { name, owner_username, owner_password, owner_email, owner_name } = req.body || {};
      if (!name || !owner_username || !owner_password) {
        return res.status(400).json({ error: 'name, owner_username и owner_password са задължителни' });
      }
      if (controlDb.prepare('SELECT id FROM users WHERE username=?').get(owner_username)) {
        return res.status(400).json({ error: 'owner_username вече съществува' });
      }
      const orgR = controlDb.prepare("INSERT INTO organizations (name, status) VALUES (?, 'active')").run(name);
      const orgId = Number(orgR.lastInsertRowid);
      getOrgDb(orgId); // създава orgs/<id>.db + пуска tenant миграциите
      const hash = bcrypt.hashSync(owner_password, 10);
      const uR = controlDb.prepare(
        'INSERT INTO users (username, password_hash, role, name, email, organization_id, is_superadmin) VALUES (?,?,?,?,?,?,0)'
      ).run(owner_username, hash, 'admin', owner_name || '', owner_email || '', orgId);
      res.status(201).json({ ok: true, organization_id: orgId, owner_user_id: Number(uR.lastInsertRowid) });
    } catch (e) { res.status(500).json({ error: e.message }); }
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
