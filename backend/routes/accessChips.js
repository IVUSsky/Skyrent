const express = require('express');

module.exports = function(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare(`
      SELECT c.*, p.адрес AS property_address
      FROM access_chips c LEFT JOIN properties p ON p.id = c.property_id
      ORDER BY c.created_at DESC
    `).all();
    res.json(rows);
  });

  router.post('/', (req, res) => {
    try {
      const b = req.body;
      if (!b.label || !b.uid) return res.status(400).json({ error: 'label и uid са задължителни' });
      const r = db.prepare(`
        INSERT INTO access_chips (property_id, label, chip_type, uid, keys_json, dump_b64, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        b.property_id ? Number(b.property_id) : null,
        b.label, b.chip_type || 'MIFARE Classic 1K', b.uid.toUpperCase(),
        b.keys_json || null, b.dump_b64 || null, b.notes || ''
      );
      res.json({ ok: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/:id', (req, res) => {
    try {
      const cur = db.prepare('SELECT * FROM access_chips WHERE id=?').get(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Не е намерен' });
      const b = req.body;
      db.prepare(`
        UPDATE access_chips SET property_id=?, label=?, chip_type=?, uid=?, keys_json=?, dump_b64=?, notes=?
        WHERE id=?
      `).run(
        b.property_id !== undefined ? (b.property_id ? Number(b.property_id) : null) : cur.property_id,
        b.label !== undefined ? b.label : cur.label,
        b.chip_type !== undefined ? b.chip_type : cur.chip_type,
        b.uid !== undefined ? b.uid.toUpperCase() : cur.uid,
        b.keys_json !== undefined ? b.keys_json : cur.keys_json,
        b.dump_b64 !== undefined ? b.dump_b64 : cur.dump_b64,
        b.notes !== undefined ? b.notes : cur.notes,
        req.params.id
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/:id', (req, res) => {
    try { db.prepare('DELETE FROM access_chips WHERE id=?').run(req.params.id); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
};
