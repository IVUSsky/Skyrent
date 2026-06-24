// Собственици на имоти — Agency функция (capability 'multi_owner').
// Агенцията управлява чужди портфейли: всеки имот може да има собственик.
// CRUD; при изтриване имотите се отвързват (owner_id → NULL), не се трият.

const express = require('express');

module.exports = function (db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const owners = db.prepare('SELECT * FROM owners ORDER BY name').all();
    const counts = {};
    try {
      db.prepare('SELECT owner_id, COUNT(*) AS c FROM properties WHERE owner_id IS NOT NULL GROUP BY owner_id')
        .all().forEach(r => { counts[r.owner_id] = r.c; });
    } catch (_) {}
    res.json(owners.map(o => ({ ...o, property_count: counts[o.id] || 0 })));
  });

  router.post('/', (req, res) => {
    const { name, egn_eik, email, phone, iban, notes } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Името е задължително' });
    const r = db.prepare('INSERT INTO owners (name, egn_eik, email, phone, iban, notes) VALUES (?,?,?,?,?,?)')
      .run(String(name).trim(), egn_eik || '', email || '', phone || '', iban || '', notes || '');
    res.status(201).json({ id: r.lastInsertRowid });
  });

  router.patch('/:id', (req, res) => {
    const cur = db.prepare('SELECT * FROM owners WHERE id=?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Не е намерен' });
    const b = req.body || {};
    const v = (k) => (b[k] !== undefined ? b[k] : cur[k]);
    if (b.name !== undefined && !String(b.name).trim()) return res.status(400).json({ error: 'Името е задължително' });
    db.prepare('UPDATE owners SET name=?, egn_eik=?, email=?, phone=?, iban=?, notes=? WHERE id=?')
      .run(String(v('name')).trim(), v('egn_eik') || '', v('email') || '', v('phone') || '', v('iban') || '', v('notes') || '', req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    try { db.prepare('UPDATE properties SET owner_id=NULL WHERE owner_id=?').run(req.params.id); } catch (_) {}
    db.prepare('DELETE FROM owners WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
