const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'skyrent-secret');
    req.user = payload; // { id, username, role }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
