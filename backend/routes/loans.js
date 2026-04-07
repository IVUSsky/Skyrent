const express = require('express');
module.exports = function(db) {
  const router = express.Router();
  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM loans ORDER BY id').all());
  });
  return router;
};
