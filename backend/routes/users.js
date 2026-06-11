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
    // username е глобално UNIQUE (control.db, всички org-и)
    const existing = db.control.prepare('SELECT id FROM users WHERE username=?').get(username);
    if (existing) return res.status(400).json({ error: 'Потребителят вече съществува' });
    const hash = bcrypt.hashSync(password, 10);
    // users записи → control.db с organization_id на текущата org
    const r = db.control.prepare('INSERT INTO users (username, password_hash, role, name, email, organization_id) VALUES (?,?,?,?,?,?)')
      .run(username, hash, role || 'broker', name || '', email || '', db.orgId);
    res.status(201).json({ id: r.lastInsertRowid });
  });

  // Update user (admin only)
  router.put('/:id', adminOnly, (req, res) => {
    const { role, name, email, password } = req.body;
    // AND organization_id — org-admin не може да пипа users на чужда org
    if (password) {
      db.control.prepare('UPDATE users SET role=?, name=?, email=?, password_hash=? WHERE id=? AND organization_id=?')
        .run(role, name || '', email || '', bcrypt.hashSync(password, 10), req.params.id, db.orgId);
    } else {
      db.control.prepare('UPDATE users SET role=?, name=?, email=? WHERE id=? AND organization_id=?')
        .run(role, name || '', email || '', req.params.id, db.orgId);
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
    db.control.prepare('DELETE FROM users WHERE id=? AND organization_id=?').run(req.params.id, db.orgId);
    res.json({ ok: true });
  });

  return router;
};
