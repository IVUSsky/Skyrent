const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = function() {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const validUser = process.env.APP_USERNAME || 'admin';
    const validPass = process.env.APP_PASSWORD || 'skyrent2024';

    if (username === validUser && password === validPass) {
      const token = jwt.sign({ username }, process.env.JWT_SECRET || 'skyrent-secret', { expiresIn: '30d' });
      res.json({ token });
    } else {
      res.status(401).json({ error: 'Грешно потребителско име или парола' });
    }
  });

  return router;
};
