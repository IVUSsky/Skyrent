const express = require('express');
const bcrypt  = require('bcryptjs');

module.exports = function(db) {
  const router = express.Router();

  // Admin-only guard
  function adminOnly(req, res, next) {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Само за администратори' });
    next();
  }

  // List users (admin only)
  router.get('/', adminOnly, (req, res) => {
    res.json(db.prepare('SELECT id, username, role, name, email, created_at FROM users ORDER BY id').all());
  });

  // Create user (admin only)
  router.post('/', adminOnly, (req, res) => {
    const { username, password, role, name, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username и password са задължителни' });
    const existing = db.prepare('SELECT id FROM users WHERE username=?').get(username);
    if (existing) return res.status(400).json({ error: 'Потребителят вече съществува' });
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('INSERT INTO users (username, password_hash, role, name, email) VALUES (?,?,?,?,?)')
      .run(username, hash, role || 'broker', name || '', email || '');
    res.status(201).json({ id: r.lastInsertRowid });
  });

  // Update user (admin only)
  router.put('/:id', adminOnly, (req, res) => {
    const { role, name, email, password } = req.body;
    if (password) {
      db.prepare('UPDATE users SET role=?, name=?, email=?, password_hash=? WHERE id=?')
        .run(role, name || '', email || '', bcrypt.hashSync(password, 10), req.params.id);
    } else {
      db.prepare('UPDATE users SET role=?, name=?, email=? WHERE id=?')
        .run(role, name || '', email || '', req.params.id);
    }
    res.json({ ok: true });
  });

  // Delete user (admin only, cannot delete last admin)
  router.delete('/:id', adminOnly, (req, res) => {
    const user   = db.prepare('SELECT role FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (user.role === 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin'").get().c;
      if (adminCount <= 1) return res.status(400).json({ error: 'Не може да изтриете последния администратор' });
    }
    db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
