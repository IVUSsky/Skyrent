const express = require('express');
module.exports = function(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM properties ORDER BY id').all();
    res.json(rows);
  });

  router.put('/:id', (req, res) => {
    try {
      console.log('PUT body:', JSON.stringify(req.body));
      const cols = db.prepare('PRAGMA table_info(properties)').all();
      console.log('Columns:', cols.map(c => c.name));

      const id = parseInt(req.params.id);
      const body = req.body;

      // Вземи текущия запис първо
      const current = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
      if (!current) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Merge - ако ново поле липсва, пази старото
      const наем       = body.наем       !== undefined ? body.наем       : current.наем;
      const наемател   = body.наемател   !== undefined ? body.наемател   : current.наемател;
      const статус     = body.статус     !== undefined ? body.статус     : current.статус;
      const market_val = body.market_val !== undefined ? body.market_val : current.market_val;
      const тип        = body.тип        !== undefined ? body.тип        : current.тип;
      const площ       = body.площ       !== undefined ? body.площ       : current.площ;
      const покупна    = body.покупна    !== undefined ? body.покупна    : current.покупна;
      const ремонт     = body.ремонт     !== undefined ? body.ремонт     : current.ремонт;

      db.prepare(`
        UPDATE properties
        SET наем=?, наемател=?, статус=?, market_val=?, тип=?, площ=?, покупна=?, ремонт=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(наем, наемател, статус, market_val, тип, площ, покупна, ремонт, id);

      const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
      console.log('Saved тип:', updated.тип, '| покупна:', updated.покупна, '| ремонт:', updated.ремонт);

      res.json({ success: true, property: updated });
    } catch (err) {
      console.error('PUT error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
