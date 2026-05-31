const express   = require('express');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');

// Per-IP login rate limit — protects against brute force / credential stuffing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Твърде много неуспешни опита. Опитайте след 15 минути.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't count successful logins against the limit
  skipSuccessfulRequests: true,
});

function clientIp(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || req.connection?.remoteAddress || '';
}

function logAttempt(db, { user, username, success, ip, userAgent, totpUsed, reason }) {
  try {
    db.prepare(`
      INSERT INTO login_audit (user_id, username, success, ip, user_agent, totp_used, failure_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      user?.id || null,
      username || (user?.username || ''),
      success ? 1 : 0,
      ip || '',
      (userAgent || '').slice(0, 250),
      totpUsed ? 1 : 0,
      reason || null,
    );
  } catch (e) {
    console.warn('[auth] logAttempt failed:', e.message);
  }
}

function getIssuer(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='issuer'").get();
  if (!row) return {};
  try { return JSON.parse(row.value); } catch { return {}; }
}

async function sendAdminLoginAlert(db, { user, ip, userAgent, totpUsed }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.SECURITY_EMAIL || process.env.BACKUP_EMAIL || process.env.ADMIN_EMAIL || user?.email || 'ivollazarov@gmail.com';
  if (!apiKey || !to) return;
  const issuer    = getIssuer(db);
  const fromName  = issuer.name || 'Sky Capital';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'info@skycapital.pro';
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${fromName} Security <${fromEmail}>`,
        to: [to],
        subject: `🔐 Skyrent admin login — ${user.username}`,
        html: `
          <h2 style="margin:0 0 10px">🔐 Успешен admin вход</h2>
          <p><b>Потребител:</b> ${user.username} (${user.name || '—'})</p>
          <p><b>Време:</b> ${new Date().toLocaleString('bg-BG')}</p>
          <p><b>IP:</b> ${ip || 'unknown'}</p>
          <p><b>Браузър:</b> ${(userAgent || 'unknown').slice(0, 200)}</p>
          <p><b>2FA използвано:</b> ${totpUsed ? 'да' : '<span style="color:#c00">не</span>'}</p>
          <p style="font-size:12px;color:#888;margin-top:18px">
            Ако НЕ си се логвал ти — смени паролата веднага и (ако още не е активирано) включи 2FA от Settings.
          </p>
        `,
      }),
    });
  } catch (e) {
    console.warn('[auth] admin login alert email failed:', e.message);
  }
}

module.exports = function(db) {
  const router = express.Router();

  router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    const ip        = clientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    if (!username || !password) {
      logAttempt(db, { username, success: false, ip, userAgent, reason: 'missing_credentials' });
      return res.status(400).json({ error: 'Въведете потребителско име и парола' });
    }
    const ident = String(username).trim();
    const user = db.prepare('SELECT * FROM users WHERE username=? OR LOWER(email)=LOWER(?)').get(ident, ident);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      logAttempt(db, { user, username: ident, success: false, ip, userAgent, reason: 'bad_credentials' });
      return res.status(401).json({ error: 'Грешно потребителско име или парола' });
    }
    try { db.prepare("UPDATE users SET last_login_at=datetime('now') WHERE id=?").run(user.id); } catch (_) {}
    const secret = process.env.JWT_SECRET || 'skyrent-secret';
    const token  = jwt.sign({ id: user.id, username: user.username, role: user.role }, secret, { expiresIn: '7d' });
    logAttempt(db, { user, username: ident, success: true, ip, userAgent, totpUsed: false });
    if (user.role === 'admin') {
      sendAdminLoginAlert(db, { user, ip, userAgent, totpUsed: false }).catch(() => {});
    }
    res.json({
      token,
      role: user.role,
      name: user.name || user.username,
      must_change_password: !!user.must_change_password,
    });
  });

  return router;
};
