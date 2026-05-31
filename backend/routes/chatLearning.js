const express = require('express');
const { runWeeklyAnalysis, approveQueueItem, rejectQueueItem } = require('../lib/tenantChatLearner');

module.exports = function(db) {
  const router = express.Router();

  // Admin-only — tenant role blocked
  router.use((req, res, next) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Само за администратори' });
    next();
  });

  // GET /api/chat-learning?status=pending|approved|rejected (default pending)
  router.get('/', (req, res) => {
    const status = req.query.status || 'pending';
    const rows = db.prepare(`
      SELECT q.*, u.username AS reviewed_by_username
      FROM chat_learning_queue q
      LEFT JOIN users u ON u.id = q.reviewed_by
      WHERE q.status = ?
      ORDER BY q.created_at DESC
      LIMIT 200
    `).all(status);

    // Resolve property_ids → addresses for UI display
    const allPropIds = new Set();
    const parsed = rows.map(r => {
      let ids = [];
      try { ids = JSON.parse(r.property_ids || '[]'); } catch(_) {}
      ids.forEach(i => allPropIds.add(i));
      return { ...r, property_ids: ids };
    });
    let propMap = {};
    if (allPropIds.size) {
      const ids = [...allPropIds];
      const placeholders = ids.map(() => '?').join(',');
      const props = db.prepare(`SELECT id, адрес FROM properties WHERE id IN (${placeholders})`).all(...ids);
      for (const p of props) propMap[p.id] = p['адрес'];
    }
    parsed.forEach(r => { r.property_addresses = r.property_ids.map(i => propMap[i] || `#${i}`); });
    res.json(parsed);
  });

  // GET /api/chat-learning/pending-count — for the admin badge
  router.get('/pending-count', (req, res) => {
    const row = db.prepare("SELECT COUNT(*) AS c FROM chat_learning_queue WHERE status='pending'").get();
    res.json({ count: row.c });
  });

  // POST /api/chat-learning/run — manual trigger (also useful for testing)
  router.post('/run', async (req, res) => {
    try {
      const days = Number(req.body?.days) || 7;
      const result = await runWeeklyAnalysis(db, { days });
      res.json(result);
    } catch (err) {
      console.error('Manual chat learning run failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/chat-learning/:id — edit pending suggestion before approve
  router.patch('/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = db.prepare("SELECT id, status FROM chat_learning_queue WHERE id=?").get(id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (row.status !== 'pending') return res.status(400).json({ error: `Already ${row.status}` });
      const b = req.body || {};
      const fields = [];
      const values = [];
      for (const k of ['question', 'proposed_answer', 'scope', 'reasoning']) {
        if (b[k] !== undefined) { fields.push(`${k}=?`); values.push(String(b[k])); }
      }
      if (b.property_ids !== undefined) {
        fields.push('property_ids=?');
        values.push(JSON.stringify(Array.isArray(b.property_ids) ? b.property_ids : []));
      }
      if (fields.length === 0) return res.json({ ok: true });
      values.push(id);
      db.prepare(`UPDATE chat_learning_queue SET ${fields.join(', ')} WHERE id=?`).run(...values);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/chat-learning/:id/approve — promote to chat_learned_faqs
  router.post('/:id/approve', (req, res) => {
    try {
      const result = approveQueueItem(db, Number(req.params.id), req.body || {}, req.user.id);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/chat-learning/:id/reject
  router.post('/:id/reject', (req, res) => {
    try {
      const result = rejectQueueItem(db, Number(req.params.id), req.user.id);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
};
