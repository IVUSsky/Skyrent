const express = require('express');
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcryptjs');
const { askAgent } = require('../lib/tenantAgent');

const DATA_DIR     = process.env.DATA_DIR || path.join(__dirname, '../data');
const CONTRACTS_DIR = path.join(DATA_DIR, 'contracts');
const INVOICES_DIR  = path.join(DATA_DIR, 'invoices');
const PHOTOS_DIR    = path.join(DATA_DIR, 'property_photos');

module.exports = function(db) {
  const router = express.Router();

  // Tenant-only guard
  router.use((req, res, next) => {
    if (req.user?.role !== 'tenant') return res.status(403).json({ error: 'Само за наематели' });
    next();
  });

  // GET /api/tenant/me — profile + linked contracts + derived properties
  router.get('/me', (req, res) => {
    const user = db.prepare('SELECT id, username, name, email, phone, must_change_password FROM users WHERE id=?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Not found' });

    const contracts = db.prepare(`
      SELECT c.* FROM contracts c
      WHERE c.tenant_user_id=? AND c.status IN ('active','draft','sent')
      ORDER BY (c.status='active') DESC, c.created_at DESC
    `).all(req.user.id);

    const propertyIds = [...new Set(contracts.map(c => c.property_id).filter(Boolean))];
    const properties = propertyIds.length
      ? db.prepare(`SELECT id, адрес, район, тип, площ, наем, телефон, email,
                           абонат_ток, абонат_вода, абонат_тец, абонат_вход
                    FROM properties WHERE id IN (${propertyIds.map(() => '?').join(',')})`).all(...propertyIds)
      : [];

    res.json({ user, contracts, properties });
  });

  // POST /api/tenant/change-password — for must_change_password flow
  router.post('/change-password', (req, res) => {
    const { current_password, new_password } = req.body || {};
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Новата парола трябва да е поне 6 символа' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    // Skip current_password check if must_change_password is set (first login)
    if (!user.must_change_password) {
      if (!current_password || !bcrypt.compareSync(current_password, user.password_hash)) {
        return res.status(401).json({ error: 'Грешна текуща парола' });
      }
    }
    db.prepare("UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?")
      .run(bcrypt.hashSync(new_password, 10), req.user.id);
    res.json({ ok: true });
  });

  // GET /api/tenant/properties/:id/photos — photos of own property
  router.get('/properties/:id/photos', (req, res) => {
    const owns = db.prepare(
      "SELECT 1 FROM contracts WHERE tenant_user_id=? AND property_id=? AND status IN ('active','sent','draft')"
    ).get(req.user.id, req.params.id);
    if (!owns) return res.status(403).json({ error: 'Forbidden' });
    const photos = db.prepare('SELECT id, filename, caption, created_at FROM property_photos WHERE property_id=? ORDER BY created_at').all(req.params.id);
    res.json(photos);
  });

  // GET /api/tenant/photos/:id/file — serve single photo
  router.get('/photos/:id/file', (req, res) => {
    const photo = db.prepare('SELECT * FROM property_photos WHERE id=?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Not found' });
    const owns = db.prepare(
      "SELECT 1 FROM contracts WHERE tenant_user_id=? AND property_id=? AND status IN ('active','sent','draft')"
    ).get(req.user.id, photo.property_id);
    if (!owns) return res.status(403).json({ error: 'Forbidden' });
    const fp = path.join(PHOTOS_DIR, photo.filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing' });
    res.sendFile(fp);
  });

  // GET /api/tenant/contracts/:id/pdf — download own contract
  router.get('/contracts/:id/pdf', (req, res) => {
    const contract = db.prepare("SELECT * FROM contracts WHERE id=? AND tenant_user_id=?").get(req.params.id, req.user.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!contract.pdf_path) return res.status(404).json({ error: 'PDF не е генериран' });
    const fp = path.join(CONTRACTS_DIR, contract.pdf_path);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'PDF файл липсва' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contract_${contract.contract_number}.pdf"`);
    res.sendFile(fp);
  });

  // GET /api/tenant/invoices — list own rent invoices
  router.get('/invoices', (req, res) => {
    const invs = db.prepare(`
      SELECT i.id, i.invoice_number, i.type, i.month, i.amount, i.vat_amount, i.total,
             i.due_date, i.issued_at, i.pdf_path, i.paid_at, i.payment_method,
             i.addons_total, i.addons_json,
             p.адрес AS property_address,
             COALESCE(p.stripe_enabled, 1) AS stripe_enabled
      FROM rent_invoices i
      LEFT JOIN properties p ON p.id = i.property_id
      WHERE i.property_id IN (
        SELECT DISTINCT property_id FROM contracts
        WHERE tenant_user_id=? AND property_id IS NOT NULL
      )
      ORDER BY i.issued_at DESC, i.id DESC
    `).all(req.user.id);
    // Parse addons_json for frontend
    for (const inv of invs) {
      if (inv.addons_json) {
        try { inv.addons = JSON.parse(inv.addons_json); } catch { inv.addons = []; }
      } else {
        inv.addons = [];
      }
      delete inv.addons_json;
    }
    res.json(invs);
  });

  // ── AI Chat agent (Phase 2) ──────────────────────────────────────
  // POST /api/tenant/chat — send a message, get a reply
  router.post('/chat', async (req, res) => {
    try {
      const message = String(req.body?.message || '').trim();
      if (!message) return res.status(400).json({ error: 'message е задължително' });
      if (message.length > 2000) return res.status(400).json({ error: 'Съобщението е твърде дълго (макс. 2000 символа)' });
      const reply = await askAgent(db, req.user.id, message);
      res.json({ reply });
    } catch (err) {
      console.error('Tenant chat error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tenant/chat/history — full conversation (most recent first 50)
  router.get('/chat/history', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT id, role, content, created_at
        FROM tenant_chat_messages
        WHERE tenant_user_id=?
        ORDER BY created_at DESC, id DESC
        LIMIT 50
      `).all(req.user.id);
      res.json(rows.reverse());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Addons (tenant side) ──────────────────────────────────────
  // Helper: current property for tenant (от активен договор)
  function tenantPropertyId(userId) {
    const row = db.prepare(`
      SELECT property_id FROM contracts
      WHERE tenant_user_id=? AND status='active' AND property_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(userId);
    return row ? row.property_id : null;
  }

  router.get('/addons/catalog', (req, res) => {
    const rows = db.prepare(`
      SELECT id, name, description, icon, monthly_price, deposit_amount, currency
      FROM addon_services
      WHERE active = 1
      ORDER BY sort_order ASC, id ASC
    `).all();
    res.json(rows);
  });

  router.get('/addons/mine', (req, res) => {
    const rows = db.prepare(`
      SELECT ta.*,
        s.name AS service_name, s.icon AS service_icon, s.description AS service_description,
        s.monthly_price AS service_monthly_price, s.deposit_amount AS service_deposit_amount, s.currency
      FROM tenant_addons ta
      LEFT JOIN addon_services s ON s.id = ta.service_id
      WHERE ta.user_id = ?
      ORDER BY
        CASE ta.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 WHEN 'stopped' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END,
        ta.requested_at DESC
    `).all(req.user.id);
    res.json(rows);
  });

  router.post('/addons/request', (req, res) => {
    try {
      const { service_id } = req.body;
      if (!service_id) return res.status(400).json({ error: 'service_id е задължително' });
      const svc = db.prepare('SELECT * FROM addon_services WHERE id=? AND active=1').get(service_id);
      if (!svc) return res.status(404).json({ error: 'Услугата не е намерена или е деактивирана' });
      // Block duplicate pending/active requests for same service
      const existing = db.prepare(`
        SELECT id, status FROM tenant_addons
        WHERE user_id=? AND service_id=? AND status IN ('pending','active')
      `).get(req.user.id, service_id);
      if (existing) return res.status(400).json({ error: `Вече имате ${existing.status === 'active' ? 'активна' : 'чакаща'} заявка за тази услуга` });

      const propId = tenantPropertyId(req.user.id);
      const r = db.prepare(`
        INSERT INTO tenant_addons (user_id, service_id, property_id, status)
        VALUES (?, ?, ?, 'pending')
      `).run(req.user.id, service_id, propId);
      res.json({ ok: true, id: r.lastInsertRowid });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Tenant може да отмени само pending заявка
  router.delete('/addons/mine/:id', (req, res) => {
    try {
      const sub = db.prepare('SELECT * FROM tenant_addons WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
      if (!sub) return res.status(404).json({ error: 'Не е намерена' });
      if (sub.status !== 'pending') return res.status(400).json({ error: 'Може да се отменя само чакаща заявка' });
      db.prepare('DELETE FROM tenant_addons WHERE id=?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tenant/invoices/:id/pdf
  router.get('/invoices/:id/pdf', (req, res) => {
    const inv = db.prepare(`
      SELECT i.* FROM rent_invoices i
      WHERE i.id=? AND i.property_id IN (
        SELECT DISTINCT property_id FROM contracts
        WHERE tenant_user_id=? AND property_id IS NOT NULL
      )
    `).get(req.params.id, req.user.id);
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (!inv.pdf_path) return res.status(404).json({ error: 'PDF не е генериран' });
    const fp = path.join(INVOICES_DIR, inv.pdf_path);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'PDF файл липсва' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice_${inv.invoice_number}.pdf"`);
    res.sendFile(fp);
  });

  return router;
};
