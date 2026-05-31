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

  // GET /api/chat-learning/stats — chat usage overview for admin
  router.get('/stats', (req, res) => {
    try {
      // Message volumes
      const v7  = db.prepare("SELECT COUNT(*) AS c FROM tenant_chat_messages WHERE created_at >= datetime('now', '-7 days')").get();
      const v30 = db.prepare("SELECT COUNT(*) AS c FROM tenant_chat_messages WHERE created_at >= datetime('now', '-30 days')").get();
      const userMsgs7  = db.prepare("SELECT COUNT(*) AS c FROM tenant_chat_messages WHERE role='user' AND created_at >= datetime('now', '-7 days')").get();
      const userMsgs30 = db.prepare("SELECT COUNT(*) AS c FROM tenant_chat_messages WHERE role='user' AND created_at >= datetime('now', '-30 days')").get();

      // Unique active tenants
      const active7  = db.prepare("SELECT COUNT(DISTINCT tenant_user_id) AS c FROM tenant_chat_messages WHERE created_at >= datetime('now', '-7 days')").get();
      const active30 = db.prepare("SELECT COUNT(DISTINCT tenant_user_id) AS c FROM tenant_chat_messages WHERE created_at >= datetime('now', '-30 days')").get();

      // "I don't know" rate — heuristic via answer phrases
      const dunnoPatterns = "'%нямам тази информация%' OR LOWER(content) LIKE '%нямам тази информац%' OR LOWER(content) LIKE '%не разполагам%' OR LOWER(content) LIKE '%не е попълнен%' OR LOWER(content) LIKE '%don''t have%' OR LOWER(content) LIKE '%i don''t know%'";
      const dunno7 = db.prepare(
        `SELECT COUNT(*) AS c FROM tenant_chat_messages
         WHERE role='assistant' AND created_at >= datetime('now', '-7 days')
           AND (LOWER(content) LIKE ${dunnoPatterns})`
      ).get();
      const totalAssist7 = db.prepare(
        "SELECT COUNT(*) AS c FROM tenant_chat_messages WHERE role='assistant' AND created_at >= datetime('now', '-7 days')"
      ).get();
      const dunnoRate7 = totalAssist7.c > 0 ? Math.round((dunno7.c / totalAssist7.c) * 100) : 0;

      // Top recent user questions (last 50, no clustering — admin gets a feel)
      const recentQs = db.prepare(`
        SELECT m.content, m.created_at, u.username, u.name
        FROM tenant_chat_messages m
        LEFT JOIN users u ON u.id = m.tenant_user_id
        WHERE m.role='user' AND m.created_at >= datetime('now', '-30 days')
        ORDER BY m.created_at DESC
        LIMIT 25
      `).all();

      // Learned FAQs count (how much has been promoted)
      const learnedTotal  = db.prepare("SELECT COUNT(*) AS c FROM chat_learned_faqs").get();
      const queueApproved = db.prepare("SELECT COUNT(*) AS c FROM chat_learning_queue WHERE status='approved'").get();
      const queueRejected = db.prepare("SELECT COUNT(*) AS c FROM chat_learning_queue WHERE status='rejected'").get();

      res.json({
        messages_7d:      v7.c,
        messages_30d:     v30.c,
        user_questions_7d:  userMsgs7.c,
        user_questions_30d: userMsgs30.c,
        active_tenants_7d:  active7.c,
        active_tenants_30d: active30.c,
        dunno_rate_7d:      dunnoRate7,
        learned_faqs_total: learnedTotal.c,
        queue_approved_total: queueApproved.c,
        queue_rejected_total: queueRejected.c,
        recent_questions:   recentQs,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
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
