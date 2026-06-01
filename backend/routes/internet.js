const express = require('express');
const { getRouterProvider } = require('../lib/routerProvider');
const { reconcileInternetAccounts } = require('../lib/internetCron');
const { extendAccount } = require('../lib/internetService');

module.exports = function(db) {
  const router = express.Router();

  // ── Plans ───────────────────────────────────────────────────
  router.get('/plans', (req, res) => {
    const rows = db.prepare(`
      SELECT * FROM internet_plans ORDER BY active DESC, sort_order ASC, id ASC
    `).all();
    res.json(rows);
  });

  router.post('/plans', (req, res) => {
    try {
      const b = req.body;
      if (!b.name || !b.duration_days || b.price == null) {
        return res.status(400).json({ error: 'name, duration_days и price са задължителни' });
      }
      const r = db.prepare(`
        INSERT INTO internet_plans (name, description, duration_days, price, speed_down_mbps, speed_up_mbps, currency, active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        b.name, b.description || '', Number(b.duration_days), Number(b.price),
        b.speed_down_mbps ? Number(b.speed_down_mbps) : null,
        b.speed_up_mbps   ? Number(b.speed_up_mbps)   : null,
        b.currency || 'EUR',
        b.active !== undefined ? (b.active ? 1 : 0) : 1,
        Number(b.sort_order) || 0
      );
      res.json({ ok: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/plans/:id', (req, res) => {
    try {
      const cur = db.prepare('SELECT * FROM internet_plans WHERE id=?').get(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Не е намерен' });
      const b = req.body;
      db.prepare(`
        UPDATE internet_plans SET
          name=?, description=?, duration_days=?, price=?,
          speed_down_mbps=?, speed_up_mbps=?, currency=?, active=?, sort_order=?
        WHERE id=?
      `).run(
        b.name !== undefined ? b.name : cur.name,
        b.description !== undefined ? b.description : cur.description,
        b.duration_days !== undefined ? Number(b.duration_days) : cur.duration_days,
        b.price !== undefined ? Number(b.price) : cur.price,
        b.speed_down_mbps !== undefined ? (b.speed_down_mbps ? Number(b.speed_down_mbps) : null) : cur.speed_down_mbps,
        b.speed_up_mbps !== undefined ? (b.speed_up_mbps ? Number(b.speed_up_mbps) : null) : cur.speed_up_mbps,
        b.currency || cur.currency,
        b.active !== undefined ? (b.active ? 1 : 0) : cur.active,
        b.sort_order !== undefined ? Number(b.sort_order) : cur.sort_order,
        req.params.id
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/plans/:id', (req, res) => {
    try {
      const used = db.prepare('SELECT COUNT(*) AS cnt FROM internet_purchases WHERE plan_id=?').get(req.params.id).cnt;
      if (used > 0) {
        db.prepare('UPDATE internet_plans SET active=0 WHERE id=?').run(req.params.id);
        return res.json({ ok: true, deactivated: true, message: 'Планът е деактивиран (има история на покупки).' });
      }
      db.prepare('DELETE FROM internet_plans WHERE id=?').run(req.params.id);
      res.json({ ok: true, deleted: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Accounts ────────────────────────────────────────────────
  router.get('/accounts', (req, res) => {
    const rows = db.prepare(`
      SELECT a.*,
        u.name AS user_name, u.username AS user_username, u.email AS user_email,
        p.адрес AS property_address, p.тип AS property_type
      FROM internet_accounts a
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN properties p ON p.id = a.property_id
      ORDER BY
        CASE a.status WHEN 'active' THEN 0 WHEN 'expired' THEN 1 WHEN 'inactive' THEN 2 ELSE 3 END,
        a.valid_until DESC NULLS LAST
    `).all();
    res.json(rows);
  });

  router.get('/accounts/:id', (req, res) => {
    const a = db.prepare(`
      SELECT a.*,
        u.name AS user_name, u.username AS user_username, u.email AS user_email,
        p.адрес AS property_address
      FROM internet_accounts a
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN properties p ON p.id = a.property_id
      WHERE a.id = ?
    `).get(req.params.id);
    if (!a) return res.status(404).json({ error: 'Не е намерен' });
    const purchases = db.prepare(`
      SELECT * FROM internet_purchases WHERE account_id=? ORDER BY created_at DESC
    `).all(req.params.id);
    res.json({ ...a, purchases });
  });

  router.post('/accounts/:id/extend', async (req, res) => {
    try {
      const days = Number(req.body.days);
      if (!days || days <= 0) return res.status(400).json({ error: 'days трябва да е положително число' });
      const newEnd = extendAccount(db, Number(req.params.id), days);
      res.json({ ok: true, valid_until: newEnd });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/accounts/:id/disable', async (req, res) => {
    try {
      const acc = db.prepare('SELECT * FROM internet_accounts WHERE id=?').get(req.params.id);
      if (!acc) return res.status(404).json({ error: 'Не е намерен' });
      const router_ = getRouterProvider();
      try { await router_.disableUser(db, { username: acc.username, mac_address: acc.mac_address, property_id: acc.property_id }); } catch (_) {}
      db.prepare(`UPDATE internet_accounts SET status='inactive', valid_until=datetime('now'), router_synced_at=datetime('now') WHERE id=?`)
        .run(req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.patch('/accounts/:id', (req, res) => {
    try {
      const cur = db.prepare('SELECT * FROM internet_accounts WHERE id=?').get(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Не е намерен' });
      const b = req.body;
      const mac = b.mac_address !== undefined ? (b.mac_address || null) : cur.mac_address;
      db.prepare(`UPDATE internet_accounts SET mac_address=?, notes=? WHERE id=?`)
        .run(mac, b.notes !== undefined ? b.notes : cur.notes, req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Router sync (manual trigger) ────────────────────────────
  router.post('/sync-all', async (req, res) => {
    try {
      const stats = await reconcileInternetAccounts(db, { silent: true });
      res.json({ ok: true, stats });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Routers (per-property hardware) ─────────────────────────
  router.get('/routers', (req, res) => {
    const rows = db.prepare(`
      SELECT r.*, p.адрес AS property_address, p.тип AS property_type
      FROM routers r LEFT JOIN properties p ON p.id = r.property_id
      ORDER BY p.адрес ASC
    `).all();
    res.json(rows);
  });

  router.post('/routers', (req, res) => {
    try {
      const b = req.body;
      if (!b.property_id || !b.host) return res.status(400).json({ error: 'property_id и host са задължителни' });
      const r = db.prepare(`
        INSERT INTO routers (property_id, name, model, host, api_port, api_user, api_pass, use_tls, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(b.property_id), b.name || '', b.model || 'MikroTik',
        b.host, Number(b.api_port) || 8728,
        b.api_user || 'admin', b.api_pass || '',
        b.use_tls ? 1 : 0, b.notes || ''
      );
      res.json({ ok: true, id: r.lastInsertRowid });
    } catch (err) {
      if (/UNIQUE constraint failed/.test(err.message)) {
        return res.status(400).json({ error: 'Този имот вече има конфигуриран рутер' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/routers/:id', (req, res) => {
    try {
      const cur = db.prepare('SELECT * FROM routers WHERE id=?').get(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Не е намерен' });
      const b = req.body;
      db.prepare(`
        UPDATE routers SET
          name=?, model=?, host=?, api_port=?, api_user=?, api_pass=?, use_tls=?, notes=?
        WHERE id=?
      `).run(
        b.name !== undefined ? b.name : cur.name,
        b.model !== undefined ? b.model : cur.model,
        b.host !== undefined ? b.host : cur.host,
        b.api_port !== undefined ? Number(b.api_port) : cur.api_port,
        b.api_user !== undefined ? b.api_user : cur.api_user,
        b.api_pass !== undefined ? b.api_pass : cur.api_pass,
        b.use_tls !== undefined ? (b.use_tls ? 1 : 0) : cur.use_tls,
        b.notes !== undefined ? b.notes : cur.notes,
        req.params.id
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/routers/:id', (req, res) => {
    try { db.prepare('DELETE FROM routers WHERE id=?').run(req.params.id); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/routers/:id/test', async (req, res) => {
    try {
      const result = await getRouterProvider().testRouter(db, Number(req.params.id));
      db.prepare(`
        UPDATE routers SET status=?, last_seen_at=CASE WHEN ? THEN datetime('now') ELSE last_seen_at END,
          last_error=?
        WHERE id=?
      `).run(result.ok ? 'online' : 'error', result.ok ? 1 : 0, result.ok ? null : (result.message || ''), req.params.id);
      res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
};
