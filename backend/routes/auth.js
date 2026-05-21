const express  = require('express');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Твърде много неуспешни опита. Опитайте след 15 минути.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = function(db) {
  const router = express.Router();

  router.post('/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Въведете потребителско име и парола' });
    // Allow login by either username or email (case-insensitive for email)
    const ident = String(username).trim();
    const user = db.prepare('SELECT * FROM users WHERE username=? OR LOWER(email)=LOWER(?)').get(ident, ident);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Грешно потребителско име или парола' });
    }
    try { db.prepare("UPDATE users SET last_login_at=datetime('now') WHERE id=?").run(user.id); } catch (_) {}
    const secret = process.env.JWT_SECRET || 'skyrent-secret';
    const token  = jwt.sign({ id: user.id, username: user.username, role: user.role }, secret, { expiresIn: '7d' });
    res.json({
      token,
      role: user.role,
      name: user.name || user.username,
      must_change_password: !!user.must_change_password,
    });
  });

  return router;
};
