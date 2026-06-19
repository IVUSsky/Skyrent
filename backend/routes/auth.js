const express   = require('express');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');
const { authenticator } = require('otplib');
const QRCode    = require('qrcode');
const JWT_SECRET = require('../lib/jwtSecret'); // fail-closed; без слаб fallback

// 6-digit codes, 30-second window, allow ±1 step (default) for clock drift
authenticator.options = { window: 1 };

// Per-IP login rate limit — protects against brute force / credential stuffing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Твърде много неуспешни опита. Опитайте след 15 минути.' },
  standardHeaders: true,
  legacyHeaders: false,
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

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function generateBackupCodes(n = 8) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 hex chars
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

function consumeBackupCode(db, userId, code) {
  const row = db.prepare('SELECT totp_backup_codes FROM users WHERE id=?').get(userId);
  if (!row?.totp_backup_codes) return false;
  let hashes;
  try { hashes = JSON.parse(row.totp_backup_codes); } catch { return false; }
  if (!Array.isArray(hashes)) return false;
  const target = sha256(code.replace(/[-\s]/g, '').toUpperCase());
  const idx = hashes.indexOf(target);
  if (idx === -1) return false;
  hashes.splice(idx, 1);
  db.prepare('UPDATE users SET totp_backup_codes=? WHERE id=?').run(JSON.stringify(hashes), userId);
  return true;
}

// Inline auth middleware (so this router can self-protect a subset of routes)
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

// Multi-tenant (Phase 1): users + login_audit живеят в control.db → модулът
// получава controlDb (като `db` — заявките остават непроменени) + getOrgDb
// за org-специфични неща (issuer/branding от org settings таблицата).
module.exports = function(controlDb, getOrgDb) {
  const db = controlDb;
  const orgDbOf = (u) => getOrgDb(Number(u?.organization_id) || 1);
  const router = express.Router();

  // ── Signup (Phase 2, закрита бета) ───────────────────────────────────
  // Нова организация + owner акаунт + auto-login. Изисква SIGNUP_CODE (env).
  // Без env код → 403 (signup изключен). Кодът се сменя/маха само от Railway.
  router.post('/signup', loginLimiter, async (req, res) => {
    try {
      const { signup_code, org_name, username, password, email, name } = req.body || {};
      const required = process.env.SIGNUP_CODE;
      if (!required) return res.status(403).json({ error: 'Регистрацията е затворена в момента' });
      if (String(signup_code || '') !== required) {
        logAttempt(db, { username, success: false, ip: clientIp(req), userAgent: req.headers['user-agent'], reason: 'bad_signup_code' });
        return res.status(403).json({ error: 'Невалиден код за достъп' });
      }
      const { createOrg } = require('../lib/createOrg');
      const r = createOrg(db, getOrgDb, {
        name: org_name, owner_username: username, owner_password: password,
        owner_email: email, owner_name: name,
      });
      const token = jwt.sign({ id: r.owner_user_id, username, role: 'admin',
        organization_id: r.organization_id, is_superadmin: 0 }, JWT_SECRET, { expiresIn: '7d' });
      logAttempt(db, { user: { id: r.owner_user_id, username }, username, success: true, ip: clientIp(req), userAgent: req.headers['user-agent'] });
      // welcome email — не блокира при липсващ ключ/грешка
      if (process.env.RESEND_API_KEY && email) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `Skyrent <${process.env.RESEND_FROM_EMAIL || 'info@skycapital.pro'}>`,
            to: [email],
            subject: 'Добре дошъл в Skyrent 🏠',
            html: `<h2>Добре дошъл, ${name || username}!</h2>
              <p>Организацията <b>${org_name}</b> е създадена. Пробен период: 30 дни.</p>
              <p>Започни с добавяне на първия си имот от таб <b>Портфолио</b>.</p>`,
          }),
        }).catch(() => {});
      }
      res.status(201).json({ token, role: 'admin', name: name || username, organization_id: r.organization_id, must_change_password: false });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // ── Step 1: username + password ──────────────────────────────────────
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

    // If 2FA enabled → return a short-lived stage token, don't issue full JWT yet
    if (user.totp_enabled) {
      const stageToken = jwt.sign({ id: user.id, stage: 'totp' }, JWT_SECRET, { expiresIn: '5m' });
      logAttempt(db, { user, username: ident, success: false, ip, userAgent, reason: 'totp_required' });
      return res.json({ requires_totp: true, stage_token: stageToken });
    }

    // No 2FA — issue full JWT immediately
    try { db.prepare("UPDATE users SET last_login_at=datetime('now') WHERE id=?").run(user.id); } catch (_) {}
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role,
      organization_id: user.organization_id || 1, is_superadmin: user.is_superadmin || 0 }, JWT_SECRET, { expiresIn: '7d' });
    logAttempt(db, { user, username: ident, success: true, ip, userAgent, totpUsed: false });
    if (user.role === 'admin') {
      sendAdminLoginAlert(orgDbOf(user), { user, ip, userAgent, totpUsed: false }).catch(() => {});
    }
    res.json({
      token,
      role: user.role,
      name: user.name || user.username,
      must_change_password: !!user.must_change_password,
    });
  });

  // ── Step 2: TOTP / backup code ───────────────────────────────────────
  router.post('/login-2fa', loginLimiter, async (req, res) => {
    const { stage_token, code } = req.body;
    const ip        = clientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    if (!stage_token || !code) return res.status(400).json({ error: 'Липсва код' });

    let stage;
    try { stage = jwt.verify(stage_token, JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Сесията изтече — започни от начало' }); }
    if (stage.stage !== 'totp') return res.status(401).json({ error: 'Invalid stage token' });

    const user = db.prepare('SELECT * FROM users WHERE id=?').get(stage.id);
    if (!user || !user.totp_enabled || !user.totp_secret) {
      return res.status(400).json({ error: '2FA не е активирано за този потребител' });
    }

    const cleanCode = String(code).replace(/\s/g, '');
    let ok = false;
    let usedBackup = false;
    if (/^\d{6}$/.test(cleanCode)) {
      ok = authenticator.check(cleanCode, user.totp_secret);
    } else {
      ok = consumeBackupCode(db, user.id, cleanCode);
      usedBackup = ok;
    }

    if (!ok) {
      logAttempt(db, { user, username: user.username, success: false, ip, userAgent, totpUsed: true, reason: 'bad_totp' });
      return res.status(401).json({ error: 'Грешен код' });
    }

    try { db.prepare("UPDATE users SET last_login_at=datetime('now') WHERE id=?").run(user.id); } catch (_) {}
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role,
      organization_id: user.organization_id || 1, is_superadmin: user.is_superadmin || 0 }, JWT_SECRET, { expiresIn: '7d' });
    logAttempt(db, { user, username: user.username, success: true, ip, userAgent, totpUsed: true });
    if (user.role === 'admin') {
      sendAdminLoginAlert(orgDbOf(user), { user, ip, userAgent, totpUsed: true }).catch(() => {});
    }
    res.json({
      token,
      role: user.role,
      name: user.name || user.username,
      must_change_password: !!user.must_change_password,
      used_backup_code: usedBackup,
    });
  });

  // ── 2FA setup (authenticated) ─────────────────────────────────────────
  router.get('/2fa/status', requireAuth, (req, res) => {
    const u = db.prepare('SELECT totp_enabled FROM users WHERE id=?').get(req.user.id);
    res.json({ enabled: !!u?.totp_enabled });
  });

  // Generate (or re-generate) a pending secret + QR. NOT yet enabled.
  router.post('/2fa/setup', requireAuth, async (req, res) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Forbidden' });
    const u = db.prepare('SELECT id, username, totp_enabled FROM users WHERE id=?').get(req.user.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.totp_enabled) return res.status(400).json({ error: '2FA вече е активирано. Изключи го преди да настроиш ново.' });
    const secret = authenticator.generateSecret();
    // Store secret as "pending" — we don't flip totp_enabled until verify
    db.prepare("UPDATE users SET totp_secret=? WHERE id=?").run(secret, u.id);
    const issuer = getIssuer(orgDbOf(req.user)).name || 'Sky Capital';
    const otpauth = authenticator.keyuri(u.username, `Skyrent (${issuer})`, secret);
    const qr = await QRCode.toDataURL(otpauth);
    res.json({ secret, otpauth_url: otpauth, qr_data_url: qr });
  });

  // Verify the first TOTP code → flip totp_enabled + generate backup codes (shown ONCE).
  router.post('/2fa/verify-setup', requireAuth, (req, res) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Forbidden' });
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Липсва код' });
    const u = db.prepare('SELECT id, totp_secret, totp_enabled FROM users WHERE id=?').get(req.user.id);
    if (!u?.totp_secret) return res.status(400).json({ error: 'Първо стартирай setup' });
    if (u.totp_enabled) return res.status(400).json({ error: 'Вече е активирано' });
    const ok = authenticator.check(String(code).replace(/\s/g, ''), u.totp_secret);
    if (!ok) return res.status(401).json({ error: 'Грешен код. Опитай отново.' });
    const codes = generateBackupCodes(8);
    const hashes = codes.map(c => sha256(c.replace(/-/g, '')));
    db.prepare("UPDATE users SET totp_enabled=1, totp_backup_codes=? WHERE id=?")
      .run(JSON.stringify(hashes), u.id);
    res.json({ enabled: true, backup_codes: codes });
  });

  // Disable 2FA — requires current password + a valid TOTP code (or backup code)
  router.post('/2fa/disable', requireAuth, (req, res) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Forbidden' });
    const { password, code } = req.body || {};
    if (!password || !code) return res.status(400).json({ error: 'Парола и код са задължителни' });
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (!u?.totp_enabled) return res.status(400).json({ error: '2FA не е активирано' });
    if (!bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({ error: 'Грешна парола' });
    const clean = String(code).replace(/\s/g, '');
    let ok = /^\d{6}$/.test(clean) ? authenticator.check(clean, u.totp_secret) : consumeBackupCode(db, u.id, clean);
    if (!ok) return res.status(401).json({ error: 'Грешен 2FA код' });
    db.prepare("UPDATE users SET totp_enabled=0, totp_secret=NULL, totp_backup_codes=NULL WHERE id=?").run(u.id);
    res.json({ ok: true, enabled: false });
  });

  // Regenerate backup codes (requires TOTP — invalidates old codes)
  router.post('/2fa/regenerate-backup-codes', requireAuth, (req, res) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Forbidden' });
    const { code } = req.body || {};
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (!u?.totp_enabled) return res.status(400).json({ error: '2FA не е активирано' });
    if (!code || !authenticator.check(String(code).replace(/\s/g, ''), u.totp_secret)) {
      return res.status(401).json({ error: 'Грешен 2FA код' });
    }
    const codes = generateBackupCodes(8);
    const hashes = codes.map(c => sha256(c.replace(/-/g, '')));
    db.prepare("UPDATE users SET totp_backup_codes=? WHERE id=?").run(JSON.stringify(hashes), u.id);
    res.json({ backup_codes: codes });
  });

  return router;
};
