const express = require('express');

module.exports = function(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare(`
      SELECT id, kind, title, body, link, ref_type, ref_id, read_at, created_at
      FROM notifications
      WHERE recipient_type='admin' AND recipient_user_id IS NULL
      ORDER BY created_at DESC
      LIMIT 50
    `).all();
    const unread = db.prepare(`
      SELECT COUNT(*) AS cnt FROM notifications
      WHERE recipient_type='admin' AND recipient_user_id IS NULL AND read_at IS NULL
    `).get().cnt;
    res.json({ items: rows, unread });
  });

  router.post('/mark-read', (req, res) => {
    const { id, all } = req.body || {};
    if (all) {
      db.prepare("UPDATE notifications SET read_at=datetime('now') WHERE recipient_type='admin' AND recipient_user_id IS NULL AND read_at IS NULL").run();
    } else if (id) {
      db.prepare("UPDATE notifications SET read_at=datetime('now') WHERE id=? AND recipient_type='admin' AND recipient_user_id IS NULL").run(id);
    }
    res.json({ ok: true });
  });

  return router;
};
