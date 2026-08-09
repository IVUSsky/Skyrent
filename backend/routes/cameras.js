const express = require('express');
const path = require('path');
const fs = require('fs');
const { getMdState, testConnection } = require('../lib/reolinkClient');
const { getRouterProvider } = require('../lib/routerProvider');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');

module.exports = function(db) {
  const router = express.Router();

  // camera_pass никога не излиза в JSON отговор (само се записва) — същото
  // ниво на защита, което router.api_pass би трябвало да има.
  function strip(camera) {
    const { camera_pass, ...rest } = camera;
    return rest;
  }

  router.get('/', (req, res) => {
    const rows = db.prepare(`
      SELECT c.*, p.адрес AS property_address, r.name AS router_name, r.host AS router_host
      FROM cameras c
      LEFT JOIN properties p ON p.id = c.property_id
      LEFT JOIN routers r ON r.id = c.router_id
      ORDER BY p.адрес ASC
    `).all();
    res.json(rows.map(strip));
  });

  router.post('/', (req, res) => {
    try {
      const b = req.body;
      if (!b.property_id || !b.router_id) return res.status(400).json({ error: 'property_id и router_id са задължителни' });
      const r = db.prepare(`
        INSERT INTO cameras (property_id, router_id, name, model, local_ip, forwarded_port, camera_user, camera_pass)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(b.property_id), Number(b.router_id), b.name || '', b.model || 'Reolink D340W',
        b.local_ip || '', b.forwarded_port ? Number(b.forwarded_port) : null,
        b.camera_user || 'admin', b.camera_pass || ''
      );
      res.json({ ok: true, id: r.lastInsertRowid });
    } catch (err) {
      if (/UNIQUE constraint failed/.test(err.message)) {
        return res.status(400).json({ error: 'Този имот вече има конфигурирана камера' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', (req, res) => {
    try {
      const cur = db.prepare('SELECT * FROM cameras WHERE id=?').get(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Не е намерена' });
      const b = req.body;
      db.prepare(`
        UPDATE cameras SET
          property_id=?, router_id=?, name=?, model=?, local_ip=?, forwarded_port=?, camera_user=?, camera_pass=?
        WHERE id=?
      `).run(
        b.property_id !== undefined ? Number(b.property_id) : cur.property_id,
        b.router_id !== undefined ? Number(b.router_id) : cur.router_id,
        b.name !== undefined ? b.name : cur.name,
        b.model !== undefined ? b.model : cur.model,
        b.local_ip !== undefined ? b.local_ip : cur.local_ip,
        b.forwarded_port !== undefined ? Number(b.forwarded_port) : cur.forwarded_port,
        b.camera_user !== undefined ? b.camera_user : cur.camera_user,
        b.camera_pass ? b.camera_pass : cur.camera_pass,
        req.params.id
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/:id', (req, res) => {
    try { db.prepare('DELETE FROM cameras WHERE id=?').run(req.params.id); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/:id/test', async (req, res) => {
    const camera = db.prepare('SELECT * FROM cameras WHERE id=?').get(req.params.id);
    if (!camera) return res.status(404).json({ ok: false, message: 'Не е намерена' });
    const routerRow = db.prepare('SELECT * FROM routers WHERE id=?').get(camera.router_id);
    if (!routerRow) return res.status(400).json({ ok: false, message: 'Липсва свързан рутер' });
    const result = await testConnection(camera, routerRow);
    res.json(result);
  });

  router.post('/:id/setup-forward', async (req, res) => {
    const camera = db.prepare('SELECT * FROM cameras WHERE id=?').get(req.params.id);
    if (!camera) return res.status(404).json({ ok: false, message: 'Не е намерена' });
    const routerRow = db.prepare('SELECT * FROM routers WHERE id=?').get(camera.router_id);
    if (!routerRow) return res.status(400).json({ ok: false, message: 'Липсва свързан рутер' });
    if (!camera.local_ip || !camera.forwarded_port) {
      return res.status(400).json({ ok: false, message: 'Липсват local_ip/forwarded_port за камерата' });
    }
    try {
      const result = await getRouterProvider().setupCameraForward(routerRow, camera.local_ip, 80, camera.forwarded_port);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, message: err.message });
    }
  });

  router.get('/:id/events', (req, res) => {
    const before = req.query.before ? Number(req.query.before) : null;
    const rows = db.prepare(`
      SELECT e.*, u.name AS detected_user_name
      FROM camera_events e
      LEFT JOIN users u ON u.id = e.detected_user_id
      WHERE e.camera_id = ? ${before ? 'AND e.id < ?' : ''}
      ORDER BY e.id DESC LIMIT 50
    `).all(...(before ? [req.params.id, before] : [req.params.id]));
    res.json(rows);
  });

  // Служи snapshot файла за конкретно събитие (admin) — path-traversal защита:
  // basename-only, проверка че резултатът остава вътре в DATA_DIR.
  router.get('/events/:eventId/snapshot', (req, res) => {
    const ev = db.prepare('SELECT snapshot_path FROM camera_events WHERE id=?').get(req.params.eventId);
    if (!ev || !ev.snapshot_path) return res.status(404).end();
    const fp = path.join(DATA_DIR, 'camera_snapshots', path.basename(ev.snapshot_path));
    if (!fp.startsWith(path.join(DATA_DIR, 'camera_snapshots')) || !fs.existsSync(fp)) return res.status(404).end();
    res.sendFile(fp);
  });

  return router;
};
