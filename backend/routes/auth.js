const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минути
  max: 10,                   // максимум 10 опита
  message: { error: 'Твърде много неуспешни опита. Опитайте след 15 минути.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = function() {
  const router = express.Router();

  router.post('/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    const validUser = process.env.APP_USERNAME || 'admin';
    const validPass = process.env.APP_PASSWORD || 'skyrent2024';

    if (username === validUser && password === validPass) {
      const token = jwt.sign({ username }, process.env.JWT_SECRET || 'skyrent-secret', { expiresIn: '7d' });
      res.json({ token });
    } else {
      res.status(401).json({ error: 'Грешно потребителско име или парола' });
    }
  });

  return router;
};
