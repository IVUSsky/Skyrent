const express = require('express');
const { orgContext } = require('../db/db');
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const { askAgent } = require('../lib/tenantAgent');
const { notifyAdmin } = require('../lib/notify');
const { getPropertyScope } = require('../lib/propertyScope');
const { getOrCreateAccount } = require('../lib/internetService');
const supportMod = require('./support');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
}

const DATA_DIR     = process.env.DATA_DIR || path.join(__dirname, '../data');
const CONTRACTS_DIR = path.join(DATA_DIR, 'contracts');
const INVOICES_DIR  = path.join(DATA_DIR, 'invoices');
const PHOTOS_DIR    = path.join(DATA_DIR, 'property_photos');
const TICKETS_DIR   = supportMod.TICKETS_DIR;

const ticketStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tid = req.params.id || req._created_ticket_id || 'new';
    const dir = path.join(TICKETS_DIR, String(tid));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const ticketUpload = multer({ storage: ticketStorage, limits: { fileSize: 10 * 1024 * 1024 } });

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

    // White-label: агенцията скрива Sky Capital логото и показва своя бранд.
    let white_label = false, brand = '';
    try { const w = db.prepare("SELECT value FROM settings WHERE key='white_label'").get(); white_label = !!w && (w.value === 'true' || w.value === '"true"'); } catch (_) {}
    try { const s = db.prepare("SELECT value FROM settings WHERE key='issuer'").get(); if (s) brand = (JSON.parse(s.value) || {}).name || ''; } catch (_) {}

    res.json({ user, contracts, properties, white_label, brand });
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
    db.control.prepare("UPDATE users SET password_hash=?, must_change_password=0 WHERE id=? AND organization_id=?")
      .run(bcrypt.hashSync(new_password, 10), req.user.id, db.orgId);
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

  // Връща Set от scope-ове за всички активни договори на наемателя.
  function tenantScopes(userId) {
    const rows = db.prepare(`
      SELECT p.тип FROM contracts c
      LEFT JOIN properties p ON p.id = c.property_id
      WHERE c.tenant_user_id=? AND c.status='active' AND c.property_id IS NOT NULL
    `).all(userId);
    const set = new Set();
    for (const r of rows) set.add(getPropertyScope(r['тип']));
    if (set.size === 0) set.add('residential'); // безопасен default
    return set;
  }

  // Връща property_id който отговаря на даден scope (за automatic attach при заявка)
  function tenantPropertyForScope(userId, scope) {
    const rows = db.prepare(`
      SELECT c.property_id, p.тип FROM contracts c
      LEFT JOIN properties p ON p.id = c.property_id
      WHERE c.tenant_user_id=? AND c.status='active' AND c.property_id IS NOT NULL
      ORDER BY c.created_at ASC
    `).all(userId);
    for (const r of rows) {
      if (getPropertyScope(r['тип']) === scope) return r.property_id;
    }
    return rows[0]?.property_id || null;
  }

  router.get('/addons/catalog', (req, res) => {
    const scopes = tenantScopes(req.user.id);
    const all = db.prepare(`
      SELECT id, name, description, icon, monthly_price, deposit_amount, currency, property_scope
      FROM addon_services
      WHERE active = 1
      ORDER BY sort_order ASC, id ASC
    `).all();
    const filtered = all.filter(s => {
      const sc = s.property_scope || 'all';
      return sc === 'all' || scopes.has(sc);
    });
    res.json(filtered);
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

      // Scope check — услугата трябва да е съвместима поне с един от scope-овете на наемателя
      const scope = svc.property_scope || 'all';
      const scopes = tenantScopes(req.user.id);
      if (scope !== 'all' && !scopes.has(scope)) {
        return res.status(400).json({ error: 'Услугата не е достъпна за вашия имот' });
      }

      // Block duplicate pending/active requests for same service
      const existing = db.prepare(`
        SELECT id, status FROM tenant_addons
        WHERE user_id=? AND service_id=? AND status IN ('pending','active')
      `).get(req.user.id, service_id);
      if (existing) return res.status(400).json({ error: `Вече имате ${existing.status === 'active' ? 'активна' : 'чакаща'} заявка за тази услуга` });

      // Прикачи към имота с правилния scope (или най-стария при 'all')
      const propId = scope === 'all'
        ? tenantPropertyId(req.user.id)
        : tenantPropertyForScope(req.user.id, scope);
      const r = db.prepare(`
        INSERT INTO tenant_addons (user_id, service_id, property_id, status)
        VALUES (?, ?, ?, 'pending')
      `).run(req.user.id, service_id, propId);

      const user = db.prepare('SELECT name, username FROM users WHERE id=?').get(req.user.id);
      const prop = propId ? db.prepare('SELECT адрес FROM properties WHERE id=?').get(propId) : null;
      notifyAdmin(db, {
        kind: 'addon_request',
        title: `${user?.name || user?.username || 'наемател'} заяви услуга: ${svc.icon || ''} ${svc.name}`.trim(),
        body: prop ? prop['адрес'] : null,
        link: 'addons', ref_type: 'addon', ref_id: r.lastInsertRowid,
      });

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

  // ── Support tickets (tenant side) ──────────────────────────
  router.get('/tickets', (req, res) => {
    const rows = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS message_count,
        (SELECT m.message FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT m.author_role FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_role,
        CASE
          WHEN t.last_tenant_read_at IS NULL THEN
            (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id AND m.author_role='admin')
          ELSE
            (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id AND m.author_role='admin' AND m.created_at > t.last_tenant_read_at)
        END AS unread_for_tenant
      FROM support_tickets t
      WHERE t.user_id = ?
      ORDER BY
        CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 WHEN 'closed' THEN 3 ELSE 4 END,
        t.updated_at DESC
    `).all(req.user.id);
    res.json(rows);
  });

  router.get('/tickets/:id', (req, res) => {
    const t = supportMod.fetchTicketWithDetails(db, req.params.id);
    if (!t || t.user_id !== req.user.id) return res.status(404).json({ error: 'Не е намерен' });
    db.prepare("UPDATE support_tickets SET last_tenant_read_at = datetime('now') WHERE id=?").run(req.params.id);
    res.json(t);
  });

  router.post('/tickets', ticketUpload.array('files', 5), orgContext, (req, res) => {
    try {
      const { title, description, category, priority } = req.body;
      if (!title || !title.trim()) return res.status(400).json({ error: 'Заглавието е задължително' });
      // Determine property
      const contract = db.prepare(`
        SELECT property_id FROM contracts
        WHERE tenant_user_id=? AND status='active' AND property_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1
      `).get(req.user.id);
      const propId = contract ? contract.property_id : null;

      const r = db.prepare(`
        INSERT INTO support_tickets (user_id, property_id, category, priority, title, description, status, last_tenant_read_at)
        VALUES (?, ?, ?, ?, ?, ?, 'open', datetime('now'))
      `).run(
        req.user.id, propId,
        category || 'other',
        priority || 'normal',
        title.trim(),
        description || ''
      );
      const ticketId = r.lastInsertRowid;

      // First message = description
      let firstMsgId = null;
      if (description && description.trim()) {
        const mr = db.prepare(`
          INSERT INTO support_messages (ticket_id, author_role, author_user_id, message)
          VALUES (?, 'tenant', ?, ?)
        `).run(ticketId, req.user.id, description.trim());
        firstMsgId = mr.lastInsertRowid;
      }

      // Move uploaded files to /tickets/<ticketId>/ — multer already stored them
      // but under 'new' if id wasn't known. Move now.
      if (req.files && req.files.length) {
        const newDir = path.join(TICKETS_DIR, String(ticketId));
        if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
        for (const f of req.files) {
          const oldPath = f.path;
          const newPath = path.join(newDir, f.filename);
          try {
            if (oldPath !== newPath) fs.renameSync(oldPath, newPath);
          } catch (e) { console.warn('move attachment failed:', e.message); }
          db.prepare(`
            INSERT INTO support_attachments (ticket_id, message_id, filename, original_name, mime_type, size, uploaded_by_role, uploaded_by_user_id)
            VALUES (?, ?, ?, ?, ?, ?, 'tenant', ?)
          `).run(ticketId, firstMsgId, f.filename, f.originalname, f.mimetype, f.size, req.user.id);
        }
      }

      // Notify admin
      const user = db.prepare('SELECT name, username FROM users WHERE id=?').get(req.user.id);
      const prop = propId ? db.prepare('SELECT адрес FROM properties WHERE id=?').get(propId) : null;
      notifyAdmin(db, {
        kind: 'ticket_new',
        title: `Нов сигнал от ${user?.name || user?.username || 'наемател'}`,
        body: `${title}${prop ? ` (${prop['адрес']})` : ''}`,
        link: `tickets/${ticketId}`,
        ref_type: 'ticket', ref_id: ticketId,
      });

      res.json({ ok: true, id: ticketId });
    } catch (err) {
      console.error('tenant create ticket error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/tickets/:id/messages', ticketUpload.array('files', 5), orgContext, (req, res) => {
    try {
      const ticket = db.prepare('SELECT * FROM support_tickets WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
      if (!ticket) return res.status(404).json({ error: 'Не е намерен' });
      const message = (req.body.message || '').trim();
      if (!message && !(req.files && req.files.length)) return res.status(400).json({ error: 'Празно съобщение' });

      const r = db.prepare(`
        INSERT INTO support_messages (ticket_id, author_role, author_user_id, message)
        VALUES (?, 'tenant', ?, ?)
      `).run(req.params.id, req.user.id, message || '');

      if (req.files) for (const f of req.files) {
        db.prepare(`
          INSERT INTO support_attachments (ticket_id, message_id, filename, original_name, mime_type, size, uploaded_by_role, uploaded_by_user_id)
          VALUES (?, ?, ?, ?, ?, ?, 'tenant', ?)
        `).run(req.params.id, r.lastInsertRowid, f.filename, f.originalname, f.mimetype, f.size, req.user.id);
      }
      db.prepare(`
        UPDATE support_tickets SET updated_at=datetime('now'), last_tenant_read_at=datetime('now'),
          status = CASE WHEN status='resolved' THEN 'in_progress' ELSE status END
        WHERE id=?
      `).run(req.params.id);

      const user = db.prepare('SELECT name, username FROM users WHERE id=?').get(req.user.id);
      notifyAdmin(db, {
        kind: 'ticket_reply',
        title: `Нов отговор по сигнал #${ticket.id} от ${user?.name || user?.username || 'наемател'}`,
        body: message ? message.slice(0, 120) : '(прикачен файл)',
        link: `tickets/${ticket.id}`,
        ref_type: 'ticket', ref_id: ticket.id,
      });

      res.json({ ok: true, id: r.lastInsertRowid });
    } catch (err) {
      console.error('tenant reply error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/tickets/:id/close', (req, res) => {
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!ticket) return res.status(404).json({ error: 'Не е намерен' });
    db.prepare("UPDATE support_tickets SET status='closed', resolved_at=COALESCE(resolved_at, datetime('now')), updated_at=datetime('now') WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  });

  // Tenant attachment download — гард по ticket.user_id
  router.get('/support-attachments/:id', (req, res) => {
    const att = db.prepare(`
      SELECT a.*, t.user_id AS ticket_user_id
      FROM support_attachments a
      LEFT JOIN support_tickets t ON t.id = a.ticket_id
      WHERE a.id = ?
    `).get(req.params.id);
    if (!att || att.ticket_user_id !== req.user.id) return res.status(404).json({ error: 'Не е намерен' });
    const fp = path.join(TICKETS_DIR, String(att.ticket_id), att.filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Файлът липсва' });
    if (att.mime_type) res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.original_name || att.filename)}"`);
    res.sendFile(fp);
  });

  // ── Internet (tenant side) ────────────────────────────────
  router.get('/internet', (req, res) => {
    const propId = tenantPropertyId(req.user.id);
    const account = getOrCreateAccount(db, req.user.id, propId);
    // Плановете се предлагат само ако имотът има инсталиран рутер —
    // иначе наемателят би платил за услуга, която няма как да получи
    const hasRouter = !!(propId && db.prepare('SELECT id FROM routers WHERE property_id=?').get(propId));
    const plans = !hasRouter ? [] : db.prepare(`
      SELECT id, name, description, duration_days, price, speed_down_mbps, speed_up_mbps, currency
      FROM internet_plans WHERE active = 1
      ORDER BY sort_order ASC, id ASC
    `).all();
    const purchases = db.prepare(`
      SELECT id, plan_name, amount, currency, status, paid_at, valid_from, valid_until, created_at
      FROM internet_purchases
      WHERE account_id=? AND status IN ('paid','pending')
      ORDER BY created_at DESC LIMIT 10
    `).all(account.id);
    res.json({
      account: {
        id: account.id, username: account.username, password: account.password,
        mac_address: account.mac_address, status: account.status,
        valid_from: account.valid_from, valid_until: account.valid_until,
        total_paid: account.total_paid,
      },
      has_router: hasRouter,
      plans,
      purchases,
    });
  });

  router.post('/internet/mac', (req, res) => {
    const mac = (req.body.mac_address || '').trim().toUpperCase();
    if (mac && !/^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/.test(mac)) {
      return res.status(400).json({ error: 'MAC адресът трябва да е във формат AA:BB:CC:DD:EE:FF' });
    }
    const propId = tenantPropertyId(req.user.id);
    const account = getOrCreateAccount(db, req.user.id, propId);
    db.prepare('UPDATE internet_accounts SET mac_address=? WHERE id=?')
      .run(mac || null, account.id);
    res.json({ ok: true, mac_address: mac || null });
  });

  router.post('/internet/buy', async (req, res) => {
    try {
      const s = getStripe();
      if (!s) return res.status(500).json({ error: 'Stripe не е конфигуриран' });
      const plan = db.prepare('SELECT * FROM internet_plans WHERE id=? AND active=1').get(req.body.plan_id);
      if (!plan) return res.status(404).json({ error: 'Планът не е намерен или е неактивен' });

      const propId = tenantPropertyId(req.user.id);
      if (!propId || !db.prepare('SELECT id FROM routers WHERE property_id=?').get(propId)) {
        return res.status(400).json({ error: 'Интернет услугата не е налична за този имот' });
      }
      const account = getOrCreateAccount(db, req.user.id, propId);
      const user = db.prepare('SELECT email FROM users WHERE id=?').get(req.user.id);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      const pr = db.prepare(`
        INSERT INTO internet_purchases (account_id, plan_id, plan_name, amount, duration_days, currency, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `).run(account.id, plan.id, plan.name, Number(plan.price), Number(plan.duration_days), plan.currency || 'EUR');

      const session = await s.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: user?.email || undefined,
        line_items: [{
          price_data: {
            currency: (plan.currency || 'EUR').toLowerCase(),
            product_data: {
              name: `Интернет — ${plan.name}`,
              description: `${plan.duration_days} дни${plan.speed_down_mbps ? ` · ${plan.speed_down_mbps} Mbps` : ''}`,
            },
            unit_amount: Math.round(Number(plan.price) * 100),
          },
          quantity: 1,
        }],
        metadata: {
          kind: 'internet',
          purchase_id: String(pr.lastInsertRowid),
          account_id: String(account.id),
          tenant_user_id: String(req.user.id),
        },
        success_url: `${frontendUrl}/?internet_success=1&purchase=${pr.lastInsertRowid}`,
        cancel_url:  `${frontendUrl}/?internet_cancel=1&purchase=${pr.lastInsertRowid}`,
      });

      db.prepare('UPDATE internet_purchases SET stripe_session_id=? WHERE id=?')
        .run(session.id, pr.lastInsertRowid);

      res.json({ url: session.url, session_id: session.id, purchase_id: pr.lastInsertRowid });
    } catch (err) {
      console.error('internet buy failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── In-app notifications (tenant) ─────────────────────────
  router.get('/notifications', (req, res) => {
    const rows = db.prepare(`
      SELECT id, kind, title, body, link, ref_type, ref_id, read_at, created_at
      FROM notifications
      WHERE recipient_type='tenant_user' AND recipient_user_id=?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.id);
    const unread = db.prepare(`
      SELECT COUNT(*) AS cnt FROM notifications
      WHERE recipient_type='tenant_user' AND recipient_user_id=? AND read_at IS NULL
    `).get(req.user.id).cnt;
    res.json({ items: rows, unread });
  });

  router.post('/notifications/mark-read', (req, res) => {
    const { id, all } = req.body || {};
    if (all) {
      db.prepare("UPDATE notifications SET read_at=datetime('now') WHERE recipient_type='tenant_user' AND recipient_user_id=? AND read_at IS NULL").run(req.user.id);
    } else if (id) {
      db.prepare("UPDATE notifications SET read_at=datetime('now') WHERE id=? AND recipient_type='tenant_user' AND recipient_user_id=?").run(id, req.user.id);
    }
    res.json({ ok: true });
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
