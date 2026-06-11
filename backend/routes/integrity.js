const express = require('express');
const { runChecks } = require('../lib/integrityChecks');

module.exports = (db) => {
  const router = express.Router();
  const block = (req, res) => { if (req.user?.role === 'tenant') { res.status(403).json({ error: 'Forbidden' }); return true; } return false; };

  const load = () => ({
    transactions: db.prepare('SELECT * FROM transactions').all(),
    properties: db.prepare('SELECT * FROM properties').all(),
    expenses: db.prepare('SELECT * FROM expense_invoices').all(),
    acks: db.prepare('SELECT signature, status FROM integrity_acks').all(),
  });

  // GET /api/integrity  (?all=1 включва acked)
  router.get('/', (req, res) => {
    if (block(req, res)) return;
    try {
      const data = load();
      const findings = req.query.all === '1'
        ? runChecks({ ...data, acks: [] })
        : runChecks(data);
      const summary = {};
      for (const f of findings) summary[f.check] = (summary[f.check] || 0) + 1;
      res.json({ generated_at: new Date().toISOString(), summary, findings });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/integrity/ack  {signature, status, note}
  router.post('/ack', (req, res) => {
    if (block(req, res)) return;
    try {
      const { signature, status = 'accepted', note } = req.body || {};
      if (!signature) return res.status(400).json({ error: 'signature required' });
      const exist = db.prepare('SELECT id FROM integrity_acks WHERE signature=?').get(signature);
      if (exist) db.prepare('UPDATE integrity_acks SET status=?, note=?, acked_at=? WHERE signature=?')
        .run(status, note || null, new Date().toISOString(), signature);
      else db.prepare('INSERT INTO integrity_acks (signature, status, note, acked_at) VALUES (?,?,?,?)')
        .run(signature, status, note || null, new Date().toISOString());
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/integrity/ack/:signature
  router.delete('/ack/:signature', (req, res) => {
    if (block(req, res)) return;
    try { const r = db.prepare('DELETE FROM integrity_acks WHERE signature=?').run(req.params.signature); res.json({ ok: true, deleted: r.changes }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/integrity/check-batch  {rows:[...]} — проверка на staged импорт
  router.post('/check-batch', (req, res) => {
    if (block(req, res)) return;
    try {
      const rows = (req.body?.rows || []).map((r, i) => ({ id: 'new' + i, ...r }));
      const existing = db.prepare('SELECT дата, сума, operation, контрагент FROM transactions').all();
      const dupKeys = new Set(existing.map(t => [t.дата, Math.round(Number(t.сума) * 100), t.operation, (t.контрагент || '').trim().toUpperCase()].join('|')));
      const properties = db.prepare('SELECT * FROM properties').all();
      const findings = runChecks({ transactions: rows, properties, expenses: [], acks: [] });
      for (const r of rows) {
        const k = [r.дата, Math.round(Number(r.сума) * 100), r.operation, (r.контрагент || '').trim().toUpperCase()].join('|');
        if (dupKeys.has(k)) findings.push({ check: 'duplicate_existing', severity: 'high', property_id: r.property_id ?? null,
          месец: r.месец || (r.дата || '').slice(0, 7), title: 'Вече съществува в базата',
          detail: `${r.дата} ${r.сума} ${r.operation} ${(r.контрагент || '').slice(0, 24)}`, tx_ids: [r.id], fix: null });
      }
      const byRow = {};
      for (const f of findings) for (const id of f.tx_ids) (byRow[id] = byRow[id] || []).push({ check: f.check, severity: f.severity, title: f.title });
      res.json({ ok: true, byRow });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
