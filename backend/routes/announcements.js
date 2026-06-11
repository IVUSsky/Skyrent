// Клиентска страна на платформените оферти/новини (Phase 5).
// Org админите виждат активните анонси; "Интересувам се" → lead за платформата.
const express = require('express');

module.exports = function (controlDb) {
  const router = express.Router();

  // GET /api/announcements — активни, без отхвърлените от този потребител
  router.get('/', (req, res) => {
    try {
      const rows = controlDb.prepare(`
        SELECT a.id, a.type, a.title, a.body, a.cta_label
        FROM announcements a
        WHERE a.active = 1
          AND NOT EXISTS (SELECT 1 FROM announcement_dismissals d
                          WHERE d.announcement_id = a.id AND d.user_id = ?)
        ORDER BY a.id DESC LIMIT 5
      `).all(req.user.id);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/announcements/:id/interest — клиентът иска офертата → lead
  router.post('/:id/interest', (req, res) => {
    try {
      const a = controlDb.prepare('SELECT * FROM announcements WHERE id=? AND active=1').get(req.params.id);
      if (!a) return res.status(404).json({ error: 'Офертата не е намерена' });
      const u = controlDb.prepare('SELECT username, email FROM users WHERE id=?').get(req.user.id) || {};
      const org = controlDb.prepare('SELECT name FROM organizations WHERE id=?').get(req.user.organization_id) || {};
      controlDb.prepare(`INSERT INTO announcement_leads
        (announcement_id, organization_id, user_id, username, email, org_name, note)
        VALUES (?,?,?,?,?,?,?)`)
        .run(a.id, req.user.organization_id, req.user.id, u.username || req.user.username,
             u.email || '', org.name || '', (req.body?.note || '').slice(0, 500));
      // уведоми платформата по имейл (best-effort)
      if (process.env.RESEND_API_KEY) {
        const to = process.env.ADMIN_EMAIL || process.env.SECURITY_EMAIL || 'ivollazarov@gmail.com';
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `Skyrent Platform <${process.env.RESEND_FROM_EMAIL || 'info@skycapital.pro'}>`,
            to: [to],
            subject: `🎯 Нов lead: ${a.title}`,
            html: `<h2>🎯 Нов интерес към оферта</h2>
              <p><b>Оферта:</b> ${a.title} (${a.type})</p>
              <p><b>Организация:</b> ${org.name || '—'} (#${req.user.organization_id})</p>
              <p><b>Потребител:</b> ${u.username || ''} · ${u.email || 'няма имейл'}</p>
              ${req.body?.note ? `<p><b>Бележка:</b> ${String(req.body.note).slice(0, 500)}</p>` : ''}`,
          }),
        }).catch(() => {});
      }
      res.status(201).json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/announcements/:id/dismiss — скрий за този потребител
  router.post('/:id/dismiss', (req, res) => {
    try {
      controlDb.prepare('INSERT OR IGNORE INTO announcement_dismissals (announcement_id, user_id) VALUES (?,?)')
        .run(req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
