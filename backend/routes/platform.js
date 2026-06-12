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

  // GET /api/platform/stats — бизнес метрики (Phase 5)
  router.get('/stats', (req, res) => {
    try {
      const { PLANS } = require('../lib/saasBilling');
      const orgs = controlDb.prepare('SELECT * FROM organizations WHERE id != 1').all();
      const byPlan = {}; let mrr = 0; let paying = 0; let trial = 0; let suspended = 0;
      for (const o of orgs) {
        byPlan[o.plan] = (byPlan[o.plan] || 0) + 1;
        if (o.status === 'suspended') { suspended++; continue; }
        if (o.plan === 'trial') trial++;
        else if (PLANS[o.plan]) { paying++; mrr += PLANS[o.plan].amount / 100; }
      }
      const newOrgs = (days) => controlDb.prepare(
        "SELECT COUNT(*) AS n FROM organizations WHERE id != 1 AND created_at >= datetime('now', ?)"
      ).get('-' + days + ' days').n;
      const leads = controlDb.prepare('SELECT COUNT(*) AS n FROM announcement_leads').get().n;
      res.json({
        total: orgs.length, trial, paying, suspended, mrr_eur: mrr, by_plan: byPlan,
        new_7d: newOrgs(7), new_30d: newOrgs(30), leads_total: leads,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/platform/orgs — списък организации + потребители/план/имоти/последен вход
  router.get('/orgs', (req, res) => {
    try {
      const orgs = controlDb.prepare(`
        SELECT o.id, o.name, o.status, o.plan, o.trial_ends_at, o.created_at,
               (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id) AS user_count,
               (SELECT MAX(u.last_login_at) FROM users u WHERE u.organization_id = o.id) AS last_login,
               (SELECT u.email FROM users u WHERE u.organization_id = o.id AND u.role='admin' ORDER BY u.id LIMIT 1) AS owner_email
        FROM organizations o ORDER BY o.id
      `).all();
      // брой имоти per org (от org базите; cached connections)
      for (const o of orgs) {
        try { o.property_count = getOrgDb(o.id).prepare('SELECT COUNT(*) AS n FROM properties').get().n; }
        catch (_) { o.property_count = null; }
      }
      res.json(orgs);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Broadcast оферти/новини (Phase 5) ─────────────────────────────────
  router.get('/announcements', (req, res) => {
    try {
      const rows = controlDb.prepare(`
        SELECT a.*, (SELECT COUNT(*) FROM announcement_leads l WHERE l.announcement_id = a.id) AS lead_count
        FROM announcements a ORDER BY a.id DESC
      `).all();
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/announcements', (req, res) => {
    try {
      const { type = 'news', title, body, cta_label } = req.body || {};
      if (!title || !body) return res.status(400).json({ error: 'title и body са задължителни' });
      const r = controlDb.prepare('INSERT INTO announcements (type, title, body, cta_label) VALUES (?,?,?,?)')
        .run(type, title, body, cta_label || null);
      res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.patch('/announcements/:id', (req, res) => {
    try {
      const { active, title, body, cta_label, type } = req.body || {};
      const sets = [], vals = [];
      if (active != null)    { sets.push('active=?');    vals.push(active ? 1 : 0); }
      if (title != null)     { sets.push('title=?');     vals.push(title); }
      if (body != null)      { sets.push('body=?');      vals.push(body); }
      if (cta_label !== undefined) { sets.push('cta_label=?'); vals.push(cta_label); }
      if (type != null)      { sets.push('type=?');      vals.push(type); }
      if (!sets.length) return res.status(400).json({ error: 'нищо за промяна' });
      vals.push(req.params.id);
      controlDb.prepare('UPDATE announcements SET ' + sets.join(', ') + ' WHERE id=?').run(...vals);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Leads от офертите (контакти на заинтересувани клиенти)
  router.get('/leads', (req, res) => {
    try {
      const rows = controlDb.prepare(`
        SELECT l.*, a.title AS announcement_title, a.type AS announcement_type
        FROM announcement_leads l JOIN announcements a ON a.id = l.announcement_id
        ORDER BY l.id DESC LIMIT 200
      `).all();
      res.json(rows);
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

  // POST /api/platform/users/reset-password — superadmin reset на парола на
  // потребител от КОЯТО И ДА Е организация (по username или email).
  // Употреба: клиент си е забравил паролата / тестови акаунти.
  router.post('/users/reset-password', (req, res) => {
    try {
      const bcrypt = require('bcryptjs');
      const { username_or_email, new_password } = req.body || {};
      if (!username_or_email || !new_password) return res.status(400).json({ error: 'username_or_email и new_password са задължителни' });
      if (String(new_password).length < 8) return res.status(400).json({ error: 'Паролата трябва да е поне 8 знака' });
      const ident = String(username_or_email).trim();
      const users = controlDb.prepare(
        'SELECT id, username, email, role, organization_id FROM users WHERE username=? OR (email != \'\' AND LOWER(email)=LOWER(?))'
      ).all(ident, ident);
      if (!users.length) return res.status(404).json({ error: 'Няма потребител с този username/email' });
      if (users.length > 1) {
        return res.status(409).json({ error: 'Няколко потребители с този email — ползвай username', candidates: users.map(u => ({ username: u.username, organization_id: u.organization_id })) });
      }
      const u = users[0];
      controlDb.prepare("UPDATE users SET password_hash=?, must_change_password=0, totp_enabled=0, totp_secret=NULL, totp_backup_codes=NULL WHERE id=?")
        .run(bcrypt.hashSync(new_password, 10), u.id);
      res.json({ ok: true, username: u.username, organization_id: u.organization_id, note: '2FA е нулирано (ако е имало)' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/platform/users?org=N — потребителите на организация (за lookup)
  router.get('/users', (req, res) => {
    try {
      const org = Number(req.query.org);
      const rows = org
        ? controlDb.prepare('SELECT id, username, email, role, organization_id, last_login_at FROM users WHERE organization_id=? ORDER BY id').all(org)
        : controlDb.prepare('SELECT id, username, email, role, organization_id, last_login_at FROM users ORDER BY organization_id, id').all();
      res.json(rows);
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
