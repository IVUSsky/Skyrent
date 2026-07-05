const express = require('express');
const { orgContext } = require('../db/db');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { notifyAdmin, notifyTenant } = require('../lib/notify');

const DATA_DIR     = process.env.DATA_DIR || path.join(__dirname, '../data');
const TICKETS_DIR  = path.join(DATA_DIR, 'tickets');
if (!fs.existsSync(TICKETS_DIR)) fs.mkdirSync(TICKETS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tid = req.params.id || req.body.ticket_id || 'new';
    const dir = path.join(TICKETS_DIR, String(tid));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safe = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, safe);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function fetchTicketWithDetails(db, ticketId) {
  const ticket = db.prepare(`
    SELECT t.*, u.name AS user_name, u.username AS user_username, u.email AS user_email,
           p.адрес AS property_address
    FROM support_tickets t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN properties p ON p.id = t.property_id
    WHERE t.id = ?
  `).get(ticketId);
  if (!ticket) return null;
  const messages = db.prepare(`
    SELECT m.*,
      u.name AS author_name, u.username AS author_username
    FROM support_messages m
    LEFT JOIN users u ON u.id = m.author_user_id
    WHERE m.ticket_id = ?
    ORDER BY m.created_at ASC, m.id ASC
  `).all(ticketId);
  const attachments = db.prepare(`
    SELECT id, ticket_id, message_id, filename, original_name, mime_type, size, uploaded_by_role, created_at
    FROM support_attachments
    WHERE ticket_id = ?
    ORDER BY created_at ASC
  `).all(ticketId);
  return { ...ticket, messages, attachments };
}

module.exports = function(db) {
  const router = express.Router();

  // ── Admin endpoints (/api/support) ──────────────────────────
  router.get('/', (req, res) => {
    const { status, priority, q } = req.query;
    const where = ['1=1'];
    const params = [];
    if (status)   { where.push('t.status = ?');   params.push(status); }
    if (priority) { where.push('t.priority = ?'); params.push(priority); }
    if (q) { where.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    const rows = db.prepare(`
      SELECT t.*,
        u.name AS user_name, u.username AS user_username, u.email AS user_email,
        p.адрес AS property_address,
        (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS message_count,
        (SELECT m.message FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT m.author_role FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_role,
        CASE
          WHEN t.last_admin_read_at IS NULL THEN 1
          WHEN EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id = t.id AND m.author_role='tenant' AND m.created_at > t.last_admin_read_at) THEN 1
          ELSE 0
        END AS has_unread_for_admin
      FROM support_tickets t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN properties p ON p.id = t.property_id
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 WHEN 'closed' THEN 3 ELSE 4 END,
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
        t.updated_at DESC
    `).all(...params);
    res.json(rows);
  });

  // Списък наематели-получатели за ново съобщение (landlord-initiated разговор).
  // ВАЖНО: преди /:id, иначе param рутът го хваща.
  router.get('/recipients', (req, res) => {
    const rows = db.prepare(`
      SELECT u.id, u.name, u.username, u.email,
        (SELECT p.адрес FROM contracts c JOIN properties p ON p.id=c.property_id
         WHERE c.tenant_user_id=u.id AND c.status='active' AND c.property_id IS NOT NULL
         ORDER BY c.created_at DESC LIMIT 1) AS property_address
      FROM users u WHERE u.role='tenant'
      ORDER BY u.name COLLATE NOCASE, u.username COLLATE NOCASE
    `).all();
    res.json(rows);
  });

  // Наемодателят започва нов разговор с наемател (не само отговаря на тикет).
  router.post('/', (req, res) => {
    try {
      const b = req.body || {};
      const userId = Number(b.user_id);
      const message = (b.message || '').trim();
      const title = (b.title || '').trim() || 'Съобщение от управителя';
      if (!userId || !message) return res.status(400).json({ error: 'Получател и съобщение са задължителни' });
      const tenant = db.prepare("SELECT id FROM users WHERE id=? AND role='tenant'").get(userId);
      if (!tenant) return res.status(404).json({ error: 'Наемателят не е намерен' });
      // Авто-свързване с активния имот на наемателя (ако има), освен ако е подаден изрично
      let propertyId = b.property_id ? Number(b.property_id) : null;
      if (!propertyId) {
        const pr = db.prepare(`
          SELECT property_id FROM contracts
          WHERE tenant_user_id=? AND status='active' AND property_id IS NOT NULL
          ORDER BY created_at DESC LIMIT 1
        `).get(userId);
        propertyId = pr?.property_id || null;
      }
      const t = db.prepare(`
        INSERT INTO support_tickets (user_id, property_id, category, priority, title, description, status, last_admin_read_at)
        VALUES (?, ?, 'message', 'normal', ?, ?, 'in_progress', datetime('now'))
      `).run(userId, propertyId, title, message);
      db.prepare(`
        INSERT INTO support_messages (ticket_id, author_role, author_user_id, message)
        VALUES (?, 'admin', ?, ?)
      `).run(t.lastInsertRowid, req.user.id, message);
      notifyTenant(db, userId, {
        kind: 'ticket_reply',
        title: 'Ново съобщение от управителя',
        body: message.slice(0, 120),
        link: `tickets/${t.lastInsertRowid}`,
        ref_type: 'ticket', ref_id: t.lastInsertRowid,
      });
      res.status(201).json({ ok: true, id: t.lastInsertRowid });
    } catch (err) {
      console.error('admin new conversation error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Съобщение до ВСИЧКИ наематели наведнъж (broadcast). Създава отделен разговор
  // за всеки, за да може всеки да отговори лично (не групов чат).
  router.post('/broadcast', (req, res) => {
    try {
      const b = req.body || {};
      const message = (b.message || '').trim();
      const title = (b.title || '').trim() || 'Съобщение от управителя';
      if (!message) return res.status(400).json({ error: 'Съобщението е задължително' });
      const tenants = db.prepare("SELECT id FROM users WHERE role='tenant'").all();
      if (!tenants.length) return res.status(400).json({ error: 'Няма наематели' });

      const insTicket = db.prepare(`
        INSERT INTO support_tickets (user_id, property_id, category, priority, title, description, status, last_admin_read_at)
        VALUES (?, ?, 'message', 'normal', ?, ?, 'in_progress', datetime('now'))
      `);
      const insMsg = db.prepare(`
        INSERT INTO support_messages (ticket_id, author_role, author_user_id, message) VALUES (?, 'admin', ?, ?)
      `);
      const propOf = db.prepare(`
        SELECT property_id FROM contracts WHERE tenant_user_id=? AND status='active' AND property_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1
      `);
      const created = [];
      const tx = db.transaction(() => {
        for (const t of tenants) {
          const pid = propOf.get(t.id)?.property_id || null;
          const r = insTicket.run(t.id, pid, title, message);
          insMsg.run(r.lastInsertRowid, req.user.id, message);
          created.push({ user_id: t.id, ticket_id: r.lastInsertRowid });
        }
      });
      tx();
      // Известия извън транзакцията (best-effort, да не блокира при имейл проблем)
      for (const c of created) {
        try {
          notifyTenant(db, c.user_id, {
            kind: 'ticket_reply', title: 'Ново съобщение от управителя',
            body: message.slice(0, 120), link: `tickets/${c.ticket_id}`,
            ref_type: 'ticket', ref_id: c.ticket_id,
          });
        } catch (_) {}
      }
      res.status(201).json({ ok: true, count: created.length });
    } catch (err) {
      console.error('broadcast error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', (req, res) => {
    const t = fetchTicketWithDetails(db, req.params.id);
    if (!t) return res.status(404).json({ error: 'Не е намерен' });
    // Mark as read by admin
    db.prepare("UPDATE support_tickets SET last_admin_read_at = datetime('now') WHERE id=?").run(req.params.id);
    res.json(t);
  });

  router.patch('/:id', (req, res) => {
    try {
      const cur = db.prepare('SELECT * FROM support_tickets WHERE id=?').get(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Не е намерен' });
      const b = req.body;
      const status   = b.status   !== undefined ? b.status   : cur.status;
      const priority = b.priority !== undefined ? b.priority : cur.priority;
      const category = b.category !== undefined ? b.category : cur.category;
      const resolved_at = status === 'resolved' && cur.status !== 'resolved'
        ? new Date().toISOString()
        : (status === 'open' || status === 'in_progress' ? null : cur.resolved_at);
      db.prepare(`
        UPDATE support_tickets SET status=?, priority=?, category=?, resolved_at=?, updated_at=datetime('now')
        WHERE id=?
      `).run(status, priority, category, resolved_at, req.params.id);

      // Notify tenant if status changed
      if (b.status !== undefined && b.status !== cur.status) {
        const STATUS_LABELS = { open: 'Отворен', in_progress: 'В процес', resolved: 'Разрешен', closed: 'Затворен' };
        notifyTenant(db, cur.user_id, {
          kind: 'ticket_status',
          title: `Сигналът ви #${cur.id} е "${STATUS_LABELS[b.status] || b.status}"`,
          body: cur.title,
          link: `tickets/${cur.id}`,
          ref_type: 'ticket', ref_id: cur.id,
        });
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:id/messages', upload.array('files', 5), orgContext, (req, res) => {
    try {
      const ticket = db.prepare('SELECT * FROM support_tickets WHERE id=?').get(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Не е намерен' });
      const message = (req.body.message || '').trim();
      if (!message && !(req.files && req.files.length)) {
        return res.status(400).json({ error: 'Празно съобщение' });
      }
      const r = db.prepare(`
        INSERT INTO support_messages (ticket_id, author_role, author_user_id, message)
        VALUES (?, 'admin', ?, ?)
      `).run(req.params.id, req.user.id, message || '');
      // Save attachments
      if (req.files) for (const f of req.files) {
        db.prepare(`
          INSERT INTO support_attachments (ticket_id, message_id, filename, original_name, mime_type, size, uploaded_by_role, uploaded_by_user_id)
          VALUES (?, ?, ?, ?, ?, ?, 'admin', ?)
        `).run(req.params.id, r.lastInsertRowid, f.filename, f.originalname, f.mimetype, f.size, req.user.id);
      }
      db.prepare("UPDATE support_tickets SET updated_at=datetime('now'), last_admin_read_at=datetime('now'), status = CASE WHEN status='open' THEN 'in_progress' ELSE status END WHERE id=?").run(req.params.id);

      notifyTenant(db, ticket.user_id, {
        kind: 'ticket_reply',
        title: `Управителят отговори на сигнала ви #${ticket.id}`,
        body: message ? message.slice(0, 120) : '(прикачен файл)',
        link: `tickets/${ticket.id}`,
        ref_type: 'ticket', ref_id: ticket.id,
      });

      res.json({ ok: true, id: r.lastInsertRowid });
    } catch (err) {
      console.error('admin reply error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Изтегли прикачен файл — admin може всичко
  router.get('/attachments/:id', (req, res) => {
    const att = db.prepare('SELECT * FROM support_attachments WHERE id=?').get(req.params.id);
    if (!att) return res.status(404).json({ error: 'Не е намерен' });
    const fp = path.join(TICKETS_DIR, String(att.ticket_id), att.filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Файлът липсва' });
    if (att.mime_type) res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.original_name || att.filename)}"`);
    res.sendFile(fp);
  });

  // Pending count за header bell на admin
  router.get('/stats/unread', (req, res) => {
    const row = db.prepare(`
      SELECT COUNT(*) AS cnt FROM support_tickets t
      WHERE t.status IN ('open','in_progress') AND (
        t.last_admin_read_at IS NULL OR
        EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id=t.id AND m.author_role='tenant' AND m.created_at > t.last_admin_read_at)
      )
    `).get();
    res.json({ unread: row.cnt });
  });

  return router;
};

module.exports.fetchTicketWithDetails = fetchTicketWithDetails;
module.exports.TICKETS_DIR = TICKETS_DIR;
module.exports.uploadHandler = upload;
