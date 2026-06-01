const express = require('express');
const { notifyAdmin, notifyTenant } = require('../lib/notify');

module.exports = function(db) {
  const router = express.Router();

  // ── Catalog (admin) ─────────────────────────────────────────
  router.get('/catalog', (req, res) => {
    const rows = db.prepare(`
      SELECT * FROM addon_services
      ORDER BY active DESC, sort_order ASC, id ASC
    `).all();
    res.json(rows);
  });

  router.post('/catalog', (req, res) => {
    try {
      const { name, description, icon, monthly_price, deposit_amount, currency, active, sort_order, property_scope } = req.body;
      if (!name) return res.status(400).json({ error: 'name е задължително' });
      const scope = ['all', 'residential', 'storage'].includes(property_scope) ? property_scope : 'all';
      const r = db.prepare(`
        INSERT INTO addon_services (name, description, icon, monthly_price, deposit_amount, currency, active, sort_order, property_scope)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        name, description || '', icon || '',
        Number(monthly_price) || 0, Number(deposit_amount) || 0,
        currency || 'EUR',
        active !== undefined ? (active ? 1 : 0) : 1,
        Number(sort_order) || 0,
        scope
      );
      res.json({ id: r.lastInsertRowid, ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/catalog/:id', (req, res) => {
    try {
      const cur = db.prepare('SELECT * FROM addon_services WHERE id=?').get(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Услугата не е намерена' });
      const b = req.body;
      const scope = b.property_scope !== undefined
        ? (['all', 'residential', 'storage'].includes(b.property_scope) ? b.property_scope : cur.property_scope || 'all')
        : (cur.property_scope || 'all');
      db.prepare(`
        UPDATE addon_services SET
          name = ?, description = ?, icon = ?,
          monthly_price = ?, deposit_amount = ?, currency = ?,
          active = ?, sort_order = ?, property_scope = ?
        WHERE id = ?
      `).run(
        b.name !== undefined ? b.name : cur.name,
        b.description !== undefined ? b.description : cur.description,
        b.icon !== undefined ? b.icon : cur.icon,
        b.monthly_price !== undefined ? Number(b.monthly_price) : cur.monthly_price,
        b.deposit_amount !== undefined ? Number(b.deposit_amount) : cur.deposit_amount,
        b.currency || cur.currency,
        b.active !== undefined ? (b.active ? 1 : 0) : cur.active,
        b.sort_order !== undefined ? Number(b.sort_order) : cur.sort_order,
        scope,
        req.params.id
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/catalog/:id', (req, res) => {
    try {
      // Soft delete — deactivate if there are subscriptions; hard delete only if no subs
      const subCount = db.prepare('SELECT COUNT(*) as cnt FROM tenant_addons WHERE service_id=?').get(req.params.id).cnt;
      if (subCount > 0) {
        db.prepare('UPDATE addon_services SET active=0 WHERE id=?').run(req.params.id);
        return res.json({ ok: true, deactivated: true, message: `Услугата е деактивирана (${subCount} абонамента я ползват/ползвали).` });
      }
      db.prepare('DELETE FROM addon_services WHERE id=?').run(req.params.id);
      res.json({ ok: true, deleted: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Subscriptions (admin view) ──────────────────────────────
  router.get('/subscriptions', (req, res) => {
    const { status } = req.query;
    const where = status ? 'WHERE ta.status = ?' : '';
    const params = status ? [status] : [];
    const rows = db.prepare(`
      SELECT ta.*,
        s.name AS service_name, s.icon AS service_icon,
        s.monthly_price AS service_monthly_price, s.deposit_amount AS service_deposit_amount,
        u.name AS user_name, u.username AS user_username, u.email AS user_email,
        p.адрес AS property_address
      FROM tenant_addons ta
      LEFT JOIN addon_services s ON s.id = ta.service_id
      LEFT JOIN users u ON u.id = ta.user_id
      LEFT JOIN properties p ON p.id = ta.property_id
      ${where}
      ORDER BY
        CASE ta.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 WHEN 'stopped' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END,
        ta.requested_at DESC
    `).all(...params);
    res.json(rows);
  });

  // PATCH /subscriptions/:id — admin actions: approve / reject / stop / refund-deposit
  router.patch('/subscriptions/:id', (req, res) => {
    try {
      const sub = db.prepare('SELECT * FROM tenant_addons WHERE id=?').get(req.params.id);
      if (!sub) return res.status(404).json({ error: 'Абонаментът не е намерен' });
      const { action, admin_notes } = req.body;
      const now = new Date().toISOString();

      const svc = db.prepare('SELECT name, icon FROM addon_services WHERE id=?').get(sub.service_id);
      const svcLabel = `${svc?.icon || ''} ${svc?.name || 'услуга'}`.trim();
      switch (action) {
        case 'approve':
          if (sub.status !== 'pending') return res.status(400).json({ error: `Не може да се одобри (текущ статус: ${sub.status})` });
          db.prepare('UPDATE tenant_addons SET status=?, activated_at=?, admin_notes=? WHERE id=?')
            .run('active', now, admin_notes || sub.admin_notes, req.params.id);
          notifyTenant(db, sub.user_id, {
            kind: 'addon_approved',
            title: `Заявката за ${svcLabel} е одобрена`,
            body: 'Услугата ще се добави към следващата ви фактура' + (admin_notes ? ' · ' + admin_notes : ''),
            link: 'addons', ref_type: 'addon', ref_id: sub.id,
          });
          break;
        case 'reject':
          if (sub.status !== 'pending') return res.status(400).json({ error: `Не може да се отхвърли (текущ статус: ${sub.status})` });
          db.prepare('UPDATE tenant_addons SET status=?, admin_notes=? WHERE id=?')
            .run('rejected', admin_notes || sub.admin_notes, req.params.id);
          notifyTenant(db, sub.user_id, {
            kind: 'addon_rejected',
            title: `Заявката за ${svcLabel} е отказана`,
            body: admin_notes || null,
            link: 'addons', ref_type: 'addon', ref_id: sub.id,
          });
          break;
        case 'stop':
          if (sub.status !== 'active') return res.status(400).json({ error: `Не може да се спре (текущ статус: ${sub.status})` });
          db.prepare('UPDATE tenant_addons SET status=?, stopped_at=?, admin_notes=? WHERE id=?')
            .run('stopped', now, admin_notes || sub.admin_notes, req.params.id);
          notifyTenant(db, sub.user_id, {
            kind: 'addon_stopped',
            title: `${svcLabel} е спряна`,
            body: admin_notes || 'Услугата вече не се начислява.',
            link: 'addons', ref_type: 'addon', ref_id: sub.id,
          });
          break;
        case 'refund-deposit':
          if (!sub.deposit_charged) return res.status(400).json({ error: 'Депозитът не е удържан' });
          if (sub.deposit_refunded) return res.status(400).json({ error: 'Депозитът вече е върнат' });
          db.prepare('UPDATE tenant_addons SET deposit_refunded=1, admin_notes=? WHERE id=?')
            .run(admin_notes || sub.admin_notes, req.params.id);
          break;
        case 'reactivate':
          if (sub.status !== 'stopped' && sub.status !== 'rejected') return res.status(400).json({ error: `Не може да се активира отново (текущ статус: ${sub.status})` });
          db.prepare('UPDATE tenant_addons SET status=?, activated_at=?, stopped_at=NULL, admin_notes=? WHERE id=?')
            .run('active', now, admin_notes || sub.admin_notes, req.params.id);
          break;
        default:
          return res.status(400).json({ error: `Непознато действие: ${action}` });
      }
      const updated = db.prepare('SELECT * FROM tenant_addons WHERE id=?').get(req.params.id);
      res.json({ ok: true, subscription: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/subscriptions/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM tenant_addons WHERE id=?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
