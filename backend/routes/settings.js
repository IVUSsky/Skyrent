const express = require('express');
module.exports = function(db) {
  const router = express.Router();
  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const result = {};
    rows.forEach(r => { try { result[r.key] = JSON.parse(r.value); } catch { result[r.key] = r.value; } });
    res.json(result);
  });
  router.put('/', (req, res) => {
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const upsertMany = db.transaction((data) => {
      for (const [k, v] of Object.entries(data)) upsert.run(k, JSON.stringify(v));
    });
    upsertMany(req.body);
    res.json({ ok: true });
  });
  return router;
};
