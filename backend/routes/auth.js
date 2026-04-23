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
    const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Грешно потребителско име или парола' });
    }
    const secret = process.env.JWT_SECRET || 'skyrent-secret';
    const token  = jwt.sign({ id: user.id, username: user.username, role: user.role }, secret, { expiresIn: '7d' });
    res.json({ token, role: user.role, name: user.name || user.username });
  });

  return router;
};
