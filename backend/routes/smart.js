const express = require('express');
const crypto  = require('crypto');
const fetch   = require('node-fetch');

module.exports = function(db) {
  const router = express.Router();

  const ACCESS_ID     = process.env.TUYA_ACCESS_ID;
  const ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET;
  const BASE_URL      = process.env.TUYA_BASE_URL || 'https://openapi.tuyaeu.com';

  // ── Tuya API signing ────────────────────────────────────────
  function sign(method, path, body, token, t, nonce) {
    const bodyHash   = crypto.createHash('sha256').update(body || '').digest('hex');
    const stringToSign = [method, bodyHash, '', path].join('\n');
    const signStr = ACCESS_ID + token + t + nonce + stringToSign;
    return crypto.createHmac('sha256', ACCESS_SECRET).update(signStr).digest('hex').toUpperCase();
  }

  async function tuyaRequest(method, path, body) {
    const t     = Date.now().toString();
    const nonce = crypto.randomBytes(8).toString('hex');

    // ── Step 1: Get access token ──────────────────────────────
    const tokenPath = '/v1.0/token?grant_type=1';
    const tokenStringToSign = ['GET', crypto.createHash('sha256').update('').digest('hex'), '', tokenPath].join('\n');
    const tokenSignStr = ACCESS_ID + t + nonce + tokenStringToSign;
    const tokenSign = crypto.createHmac('sha256', ACCESS_SECRET).update(tokenSignStr).digest('hex').toUpperCase();

    const tokenRes = await fetch(`${BASE_URL}${tokenPath}`, {
      headers: {
        'client_id':   ACCESS_ID,
        'sign':        tokenSign,
        't':           t,
        'sign_method': 'HMAC-SHA256',
        'nonce':       nonce,
      }
    });
    const tokenData = await tokenRes.json();
    console.log('[Tuya] token response:', JSON.stringify(tokenData));
    if (!tokenData.success) throw new Error('Tuya token error: ' + (tokenData.msg || JSON.stringify(tokenData)));
    const token = tokenData.result.access_token;

    // ── Step 2: Make actual request ───────────────────────────
    const t2      = Date.now().toString();
    const nonce2  = crypto.randomBytes(8).toString('hex');
    const bodyStr = body ? JSON.stringify(body) : '';
    const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
    const stringToSign = [method, bodyHash, '', path].join('\n');
    const signStr = ACCESS_ID + token + t2 + nonce2 + stringToSign;
    const reqSign = crypto.createHmac('sha256', ACCESS_SECRET).update(signStr).digest('hex').toUpperCase();

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'client_id':    ACCESS_ID,
        'access_token': token,
        'sign':         reqSign,
        't':            t2,
        'sign_method':  'HMAC-SHA256',
        'nonce':        nonce2,
        'Content-Type': 'application/json',
      },
      body: body ? bodyStr : undefined,
    });
    const result = await res.json();
    console.log('[Tuya]', method, path, '->', JSON.stringify(result));
    return result;
  }

  // ── DB migrations ───────────────────────────────────────────
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS smart_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER,
      tuya_device_id TEXT UNIQUE,
      name TEXT,
      type TEXT DEFAULT 'breaker',
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch(_) {}

  // ── GET /api/smart/devices — list configured devices ────────
  router.get('/devices', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT s.*, p.адрес
        FROM smart_devices s
        LEFT JOIN properties p ON p.id = s.property_id
        ORDER BY s.id
      `).all();
      res.json(rows);
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ── POST /api/smart/devices — add device ────────────────────
  router.post('/devices', (req, res) => {
    try {
      const { property_id, tuya_device_id, name, type } = req.body;
      if (!tuya_device_id) return res.status(400).json({ error: 'tuya_device_id required' });
      const r = db.prepare(
        'INSERT OR REPLACE INTO smart_devices (property_id, tuya_device_id, name, type) VALUES (?,?,?,?)'
      ).run(property_id || null, tuya_device_id, name || tuya_device_id, type || 'breaker');
      res.json({ ok: true, id: r.lastInsertRowid });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ── DELETE /api/smart/devices/:id ───────────────────────────
  router.delete('/devices/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM smart_devices WHERE id=?').run(req.params.id);
      res.json({ ok: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ── GET /api/smart/devices/:id/status — live status ─────────
  router.get('/devices/:id/status', async (req, res) => {
    try {
      const dev = db.prepare('SELECT * FROM smart_devices WHERE id=?').get(req.params.id);
      if (!dev) return res.status(404).json({ error: 'Device not found' });

      const data = await tuyaRequest('GET', `/v1.0/devices/${dev.tuya_device_id}/status`);
      if (!data.success) return res.status(500).json({ error: data.msg });

      // Parse DPs into readable format
      const dps = {};
      for (const dp of (data.result || [])) { dps[dp.code] = dp.value; }

      res.json({
        online:      true,
        switch:      dps['switch'] ?? dps['switch_1'] ?? null,
        power_w:     dps['cur_power']   != null ? dps['cur_power']   / 10 : null,
        voltage_v:   dps['cur_voltage'] != null ? dps['cur_voltage'] / 10 : null,
        current_ma:  dps['cur_current'] ?? null,
        energy_kwh:  dps['add_ele']     != null ? dps['add_ele']     / 100 : null,
        raw: dps,
      });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ── POST /api/smart/devices/:id/control — on/off ────────────
  router.post('/devices/:id/control', async (req, res) => {
    try {
      const dev = db.prepare('SELECT * FROM smart_devices WHERE id=?').get(req.params.id);
      if (!dev) return res.status(404).json({ error: 'Device not found' });

      const { on } = req.body; // true = on, false = off
      if (on == null) return res.status(400).json({ error: 'on (boolean) required' });

      // Try switch_1 first, some devices use 'switch'
      const data = await tuyaRequest('POST', `/v1.0/devices/${dev.tuya_device_id}/commands`, {
        commands: [{ code: 'switch_1', value: !!on }]
      });
      console.log('[Smart] control result:', JSON.stringify(data));

      // Log the action
      try {
        db.prepare(`CREATE TABLE IF NOT EXISTS smart_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id INTEGER,
          action TEXT,
          value TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`).run();
        db.prepare('INSERT INTO smart_logs (device_id, action, value) VALUES (?,?,?)')
          .run(dev.id, on ? 'on' : 'off', JSON.stringify(data));
      } catch(_) {}

      res.json({ ok: data.success, result: data });
    } catch(err) { console.error('[Smart] control error:', err.message); res.status(500).json({ error: err.message }); }
  });

  // ── GET /api/smart/devices/:id/energy — monthly energy ──────
  router.get('/devices/:id/energy', async (req, res) => {
    try {
      const dev = db.prepare('SELECT * FROM smart_devices WHERE id=?').get(req.params.id);
      if (!dev) return res.status(404).json({ error: 'Device not found' });

      const { month } = req.query; // YYYY-MM, defaults to current month
      const m    = month || new Date().toISOString().slice(0, 7);
      const from = new Date(m + '-01T00:00:00Z').getTime();
      const to   = new Date(new Date(from).setMonth(new Date(from).getMonth() + 1)).getTime() - 1;

      const data = await tuyaRequest('GET',
        `/v1.0/devices/${dev.tuya_device_id}/logs?codes=add_ele&start_row_key=&start_time=${from}&end_time=${to}&size=100`
      );

      res.json({ ok: data.success, month: m, logs: data.result || [] });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  return router;
};
