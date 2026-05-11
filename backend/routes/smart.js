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

  // Sort query params alphabetically — required by Tuya signing algorithm
  function sortedPath(path) {
    const idx = path.indexOf('?');
    if (idx === -1) return path;
    const base   = path.slice(0, idx);
    const sorted = path.slice(idx + 1).split('&').sort().join('&');
    return base + '?' + sorted;
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
    if (!tokenData.success) throw new Error('Tuya token error: ' + (tokenData.msg || JSON.stringify(tokenData)));
    const token = tokenData.result.access_token;

    // ── Step 2: Make actual request ───────────────────────────
    const t2       = Date.now().toString();
    const nonce2   = crypto.randomBytes(8).toString('hex');
    const bodyStr  = body ? JSON.stringify(body) : '';
    const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
    const signPath = sortedPath(path); // sort query params for signing
    const stringToSign = [method, bodyHash, '', signPath].join('\n');
    const signStr  = ACCESS_ID + token + t2 + nonce2 + stringToSign;
    const reqSign  = crypto.createHmac('sha256', ACCESS_SECRET).update(signStr).digest('hex').toUpperCase();

    const res = await fetch(`${BASE_URL}${signPath}`, {
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

  // ── PATCH /api/smart/devices/:id ────────────────────────────
  router.patch('/devices/:id', (req, res) => {
    try {
      const { name, type, property_id } = req.body;
      db.prepare('UPDATE smart_devices SET name=COALESCE(?,name), type=COALESCE(?,type), property_id=COALESCE(?,property_id) WHERE id=?')
        .run(name || null, type || null, property_id || null, req.params.id);
      res.json({ ok: true });
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
        power_w:     dps['cur_power']   != null ? dps['cur_power']   / 10  : null,
        voltage_v:   dps['cur_voltage'] != null ? dps['cur_voltage'] / 10  : null,
        current_ma:  dps['cur_current'] != null ? dps['cur_current']       : null,
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
        commands: [{ code: 'switch', value: !!on }]
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

      const { month } = req.query;
      const m    = month || new Date().toISOString().slice(0, 7);
      const from = new Date(m + '-01T00:00:00Z').getTime();
      const to   = new Date(new Date(from).setMonth(new Date(from).getMonth() + 1)).getTime() - 1;

      const data = await tuyaRequest('GET',
        `/v1.0/devices/${dev.tuya_device_id}/logs?codes=add_ele&start_row_key=&start_time=${from}&end_time=${to}&size=100`
      );

      res.json({ ok: data.success, month: m, logs: data.result || [] });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ── POST /api/smart/devices/:id/report — send monthly email ──
  router.post('/devices/:id/report', async (req, res) => {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      if (!process.env.RESEND_API_KEY) return res.status(400).json({ error: 'RESEND_API_KEY не е зададен' });

      const dev = db.prepare('SELECT s.*, p.адрес FROM smart_devices s LEFT JOIN properties p ON p.id=s.property_id WHERE s.id=?').get(req.params.id);
      if (!dev) return res.status(404).json({ error: 'Device not found' });

      const { month, to_email } = req.body;
      const m    = month || new Date().toISOString().slice(0, 7);
      const from = new Date(m + '-01T00:00:00Z').getTime();
      const to   = new Date(new Date(from).setMonth(new Date(from).getMonth() + 1)).getTime() - 1;

      // Get live status for current readings
      const statusData = await tuyaRequest('GET', `/v1.0/devices/${dev.tuya_device_id}/status`);
      const dps = {};
      for (const dp of (statusData.result || [])) dps[dp.code] = dp.value;
      const totalKwh   = dps['add_ele'] != null ? dps['add_ele'] / 100 : 0;
      const voltageV   = dps['cur_voltage'] != null ? dps['cur_voltage'] / 10 : 0;
      const powerW     = dps['cur_power']   != null ? dps['cur_power']   / 10 : 0;

      // Get energy logs for the month
      const logsData = await tuyaRequest('GET',
        `/v1.0/devices/${dev.tuya_device_id}/logs?codes=add_ele&start_row_key=&start_time=${from}&end_time=${to}&size=200`
      );
      const logs = (logsData.result?.logs || logsData.result || []);

      // Calculate monthly consumption from log difference
      let monthlyKwh = 0;
      if (logs.length >= 2) {
        const sorted = [...logs].sort((a, b) => a.event_time - b.event_time);
        const first  = parseInt(sorted[0].value) / 100;
        const last   = parseInt(sorted[sorted.length - 1].value) / 100;
        monthlyKwh   = Math.max(0, last - first);
      }

      const monthNames = ['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември'];
      const [y, mo] = m.split('-');
      const monthLabel = `${monthNames[parseInt(mo)-1]} ${y}`;
      const costBgn    = (monthlyKwh * 0.30).toFixed(2);
      const costEur    = (monthlyKwh * 0.15).toFixed(2);
      const smtpRow    = db.prepare("SELECT value FROM settings WHERE key='smtp'").get();
      const smtp       = smtpRow ? JSON.parse(smtpRow.value) : {};
      const fromEmail  = smtp.user || 'onboarding@resend.dev';
      const fromName   = smtp.from_name || 'Sky Capital';

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
          <div style="background:#0e3d52;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h2 style="color:#fff;margin:0;font-size:22px;">⚡ Месечен енергиен отчет</h2>
            <p style="color:#7ec8de;margin:6px 0 0;">${monthLabel}</p>
          </div>
          <div style="background:#f8fafc;padding:24px 32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Имот</td>
                  <td style="padding:8px 0;font-weight:bold;text-align:right;">${dev.адрес || '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Устройство</td>
                  <td style="padding:8px 0;font-weight:bold;text-align:right;">${dev.name}</td></tr>
              <tr style="border-top:1px solid #e2e8f0;">
                <td style="padding:12px 0;color:#64748b;font-size:14px;">Консумация за месеца</td>
                <td style="padding:12px 0;font-weight:bold;text-align:right;font-size:20px;color:#0e3d52;">${monthlyKwh.toFixed(2)} kWh</td></tr>
              <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Обща консумация (брояч)</td>
                  <td style="padding:8px 0;font-weight:bold;text-align:right;">${totalKwh.toFixed(2)} kWh</td></tr>
              <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Текущо напрежение</td>
                  <td style="padding:8px 0;font-weight:bold;text-align:right;">${voltageV.toFixed(1)} V</td></tr>
              <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Текуща мощност</td>
                  <td style="padding:8px 0;font-weight:bold;text-align:right;">${powerW.toFixed(1)} W</td></tr>
              <tr style="border-top:1px solid #e2e8f0;">
                <td style="padding:12px 0;color:#64748b;font-size:14px;">Прогнозна стойност</td>
                <td style="padding:12px 0;font-weight:bold;text-align:right;color:#059669;">${costBgn} лв / ${costEur} €</td></tr>
            </table>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
              * Прогнозната стойност е изчислена при 0.30 лв/kWh (0.15 €/kWh).<br>
              Генерирано автоматично от Skyrent — Sky Capital OOD
            </p>
          </div>
        </div>`;

      const recipient = to_email || smtp.user;
      if (!recipient) return res.status(400).json({ error: 'Няма email адрес за изпращане' });

      const { error } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: recipient,
        subject: `⚡ Енергиен отчет — ${dev.адрес || dev.name} — ${monthLabel}`,
        html,
      });

      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true, monthly_kwh: monthlyKwh, sent_to: recipient });
    } catch(err) { console.error('[Smart] report error:', err.message); res.status(500).json({ error: err.message }); }
  });

  // ── GET /api/smart/devices/:id/lock/records — unlock history ─
  router.get('/devices/:id/lock/records', async (req, res) => {
    try {
      const dev = db.prepare('SELECT * FROM smart_devices WHERE id=?').get(req.params.id);
      if (!dev) return res.status(404).json({ error: 'Device not found' });

      // jtmspro hotel locks don't support /logs or /door-lock/records via consumer API
      res.json({ ok: false, records: [], unsupported: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ── GET /api/smart/devices/:id/lock/status — lock state ─────
  router.get('/devices/:id/lock/status', async (req, res) => {
    try {
      const dev = db.prepare('SELECT * FROM smart_devices WHERE id=?').get(req.params.id);
      if (!dev) return res.status(404).json({ error: 'Device not found' });
      const data = await tuyaRequest('GET', `/v1.0/devices/${dev.tuya_device_id}/status`);
      console.log('[Smart] lock status raw:', JSON.stringify(data));
      const dps = {};
      for (const dp of (data.result || [])) dps[dp.code] = dp.value;
      // Determine locked state from available DPs
      // lock_motor_state / switch_1 / lock / closed — standard DPs (may not exist on all locks)
      // arming_switch — alarm armed state (armed = more secure, proxy for locked)
      // Default to "locked" (true) since door locks auto-relock after brief unlock
      let locked = true;
      if ('lock_motor_state' in dps) locked = dps['lock_motor_state'] === 'close';
      else if ('switch_1' in dps)    locked = !dps['switch_1'];
      else if ('lock' in dps)        locked = dps['lock'];
      else if ('closed' in dps)      locked = dps['closed'];
      // If none of the above, locked = true (assume locked by default)

      const battery = dps['residual_electricity'] ?? dps['battery_percentage'] ?? null;
      const armed   = dps['arming_switch'] ?? null;
      res.json({ ok: data.success, locked, battery, armed, dps });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ── POST /api/smart/devices/:id/lock/control — lock/unlock ───
  router.post('/devices/:id/lock/control', async (req, res) => {
    try {
      const dev = db.prepare('SELECT * FROM smart_devices WHERE id=?').get(req.params.id);
      if (!dev) return res.status(404).json({ error: 'Device not found' });

      const { unlock } = req.body;

      if (unlock) {
        // jtmspro hotel lock: read current remote_no_pd_setkey value from status,
        // then send it as remote_no_dp_key to trigger unlock
        const statusData = await tuyaRequest('GET', `/v1.0/devices/${dev.tuya_device_id}/status`);
        const dps = {};
        for (const dp of (statusData.result || [])) dps[dp.code] = dp.value;
        const setKey = dps['remote_no_pd_setkey'] || 'AAAB';
        console.log('[Smart] remote_no_pd_setkey value:', setKey);

        const data = await tuyaRequest('POST', `/v1.0/devices/${dev.tuya_device_id}/commands`, {
          commands: [{ code: 'remote_no_dp_key', value: setKey }]
        });
        console.log('[Smart] remote_no_dp_key unlock result:', JSON.stringify(data));
        if (data.success) return res.json({ ok: true, result: data, method: 'remote_no_dp_key', key: setKey });

        // Fallback: try with empty string
        const r2 = await tuyaRequest('POST', `/v1.0/devices/${dev.tuya_device_id}/commands`, {
          commands: [{ code: 'remote_no_dp_key', value: '' }]
        });
        console.log('[Smart] remote_no_dp_key empty fallback:', JSON.stringify(r2));
        res.json({ ok: r2.success, result: r2, method: 'remote_no_dp_key_empty', first_error: data.msg });
      } else {
        // Lock — jtmspro locks auto-relock; arming_switch is the only writable boolean
        const data = await tuyaRequest('POST', `/v1.0/devices/${dev.tuya_device_id}/commands`, {
          commands: [{ code: 'arming_switch', value: true }]
        });
        console.log('[Smart] lock arming result:', JSON.stringify(data));
        res.json({ ok: data.success, result: data, method: 'arming_switch' });
      }
    } catch(err) { console.error('[Smart] lock control error:', err.message); res.status(500).json({ error: err.message }); }
  });

  // ── GET /api/smart/devices/:id/lock/members — password users ─
  router.get('/devices/:id/lock/members', async (req, res) => {
    try {
      const dev = db.prepare('SELECT * FROM smart_devices WHERE id=?').get(req.params.id);
      if (!dev) return res.status(404).json({ error: 'Device not found' });

      const data = await tuyaRequest('GET', `/v1.0/devices/${dev.tuya_device_id}/door-lock/password-users`);
      console.log('[Smart] lock members:', JSON.stringify(data));
      res.json({ ok: data.success, members: data.result || [] });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ── POST /api/smart/devices/:id/lock/temp-password — temp pwd ─
  router.post('/devices/:id/lock/temp-password', async (req, res) => {
    try {
      const dev = db.prepare('SELECT * FROM smart_devices WHERE id=?').get(req.params.id);
      if (!dev) return res.status(404).json({ error: 'Device not found' });

      const { name, effective_time, invalid_time } = req.body;
      // effective_time and invalid_time are unix timestamps in seconds
      const now = Math.floor(Date.now() / 1000);
      const data = await tuyaRequest('POST', `/v1.0/devices/${dev.tuya_device_id}/door-lock/temp-passwords`, {
        name:           name || 'Временен код',
        effective_time: effective_time || now,
        invalid_time:   invalid_time   || now + 24 * 3600, // 24h default
        password_type:  'ticket',
      });
      console.log('[Smart] temp password:', JSON.stringify(data));
      res.json({ ok: data.success, result: data.result });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  return router;
};
