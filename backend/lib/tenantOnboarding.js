const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function getIssuer(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='issuer'").get();
  if (!row) return {};
  try { return JSON.parse(row.value); } catch { return {}; }
}

function genUsername(db, email, name) {
  const base = (email && email.includes('@') ? email.split('@')[0] : (name || 'tenant'))
    .toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24) || 'tenant';
  let candidate = base;
  let i = 1;
  while (db.prepare('SELECT 1 FROM users WHERE username=?').get(candidate)) {
    candidate = `${base}${i++}`;
    if (i > 99) { candidate = `${base}_${crypto.randomBytes(2).toString('hex')}`; break; }
  }
  return candidate;
}

function genTempPassword() {
  return crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10);
}

function ensureTenantUser(db, contract) {
  if (!contract.tenant_email) return { user: null, isNew: false, tempPassword: null };
  const email = contract.tenant_email.trim().toLowerCase();

  let user = db.prepare("SELECT * FROM users WHERE LOWER(email)=? OR LOWER(username)=?").get(email, email);
  let tempPassword = null;

  if (user) {
    if (user.role === 'admin' || user.role === 'broker') return { user, isNew: false, tempPassword: null };
    if (user.role !== 'tenant') {
      db.prepare("UPDATE users SET role='tenant' WHERE id=?").run(user.id);
      user.role = 'tenant';
    }
  } else {
    tempPassword = genTempPassword();
    const username = genUsername(db, email, contract.tenant_name);
    const hash = bcrypt.hashSync(tempPassword, 10);
    const r = db.prepare(
      "INSERT INTO users (username, password_hash, role, name, email, phone, must_change_password) VALUES (?,?,?,?,?,?,1)"
    ).run(username, hash, 'tenant', contract.tenant_name || '', email, contract.tenant_phone || '');
    user = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
  }

  db.prepare("UPDATE contracts SET tenant_user_id=? WHERE id=? AND tenant_user_id IS NULL").run(user.id, contract.id);
  return { user, isNew: !!tempPassword, tempPassword };
}

async function sendWelcomeEmail(db, { user, contract, tempPassword }) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !user?.email) return { sent: false, reason: 'no_key_or_email' };

  const issuer  = getIssuer(db);
  const fromName  = issuer.name || 'Sky Capital';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'info@skycapital.pro';
  const portalUrl = process.env.TENANT_PORTAL_URL || process.env.FRONTEND_URL || 'https://skyrent-production.up.railway.app';

  const credsBlock = tempPassword
    ? `<table cellpadding="0" cellspacing="0" style="margin:18px 0;border-collapse:collapse;border:1px solid #d1d5db;border-radius:8px;overflow:hidden;">
         <tr><td style="background:#f9fafb;padding:8px 14px;font-size:12px;color:#6b7280;border-bottom:1px solid #d1d5db;">Потребителско име</td>
             <td style="padding:8px 14px;font-size:13px;font-weight:bold;color:#111827;border-bottom:1px solid #d1d5db;">${user.username}</td></tr>
         <tr><td style="background:#f9fafb;padding:8px 14px;font-size:12px;color:#6b7280;">Временна парола</td>
             <td style="padding:8px 14px;font-size:13px;font-weight:bold;color:#111827;font-family:monospace;">${tempPassword}</td></tr>
       </table>
       <p style="font-size:12px;color:#6b7280;margin:0 0 18px;">При първото влизане ще бъдете подканени да смените паролата.</p>`
    : '<p>Можете да използвате съществуващите си данни за вход.</p>';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">
        <tr><td style="background:#1a1a2e;padding:18px 32px;font-size:18px;font-weight:bold;color:#fff;letter-spacing:2px;">${fromName}</td></tr>
        <tr><td style="padding:32px 32px 24px;color:#1a1a2e;font-size:14px;line-height:1.7;">
          <p>Здравейте, <strong>${contract.tenant_name || ''}</strong>,</p>
          <p>Вашият договор за наем <strong>№ ${contract.contract_number}</strong> за имота на адрес
          <strong>${contract.property_address || ''}</strong> е активиран.</p>
          <p>Създадохме за Вас личен онлайн профил, чрез който можете:</p>
          <ul style="margin:8px 0 16px 18px;padding:0;color:#374151;">
            <li>Да преглеждате информация за имота и снимки</li>
            <li>Да изтегляте подписания договор</li>
            <li>Да следите фактурите си за наем</li>
            <li>Да получавате важни известия</li>
          </ul>
          ${credsBlock}
          <p style="text-align:center;margin:24px 0;">
            <a href="${portalUrl}" style="background:#4AABCC;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;display:inline-block;">Влез в профила</a>
          </p>
          <p style="margin-top:24px;font-size:13px;color:#6b7280;">При въпроси можете да отговорите на този имейл.</p>
          <p style="margin-top:16px;">С уважение,<br><strong>${fromName}</strong></p>
        </td></tr>
        <tr><td style="background:#e8eaf2;padding:14px 32px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #d1d5db;">
          <strong>${fromName}</strong>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [user.email],
      subject: `Достъп до профил — договор ${contract.contract_number}`,
      html,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, reason: result.message || 'resend_error' };
  return { sent: true };
}

async function sendRenewalNotice(db, { user, contract, daysLeft }) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !user?.email) return { sent: false, reason: 'no_key_or_email' };

  const issuer  = getIssuer(db);
  const fromName  = issuer.name || 'Sky Capital';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'info@skycapital.pro';
  const portalUrl = process.env.TENANT_PORTAL_URL || process.env.FRONTEND_URL || 'https://skyrent-production.up.railway.app';

  // Suggest renewal rate from market — use current monthly_rent +5% as default placeholder
  const currentRent = Number(contract.monthly_rent || 0);
  const suggestedRent = Math.round(currentRent * 1.05 * 100) / 100;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">
        <tr><td style="background:#1a1a2e;padding:18px 32px;font-size:18px;font-weight:bold;color:#fff;letter-spacing:2px;">${fromName}</td></tr>
        <tr><td style="padding:32px 32px 24px;color:#1a1a2e;font-size:14px;line-height:1.7;">
          <p>Уважаеми/а <strong>${contract.tenant_name || ''}</strong>,</p>
          <p>Договорът Ви за наем <strong>№ ${contract.contract_number}</strong> за имот
          <strong>${contract.property_address || ''}</strong> изтича на
          <strong>${contract.end_date}</strong> (${daysLeft} дни).</p>
          <p>Ако желаете да продължите наема, моля свържете се с нас за подновяване.
          Предложена нова цена при подновяване: <strong>${suggestedRent.toLocaleString('bg-BG')} ${contract.currency || 'EUR'}/мес.</strong></p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${portalUrl}" style="background:#4AABCC;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;display:inline-block;">Отвори профила</a>
          </p>
          <p style="margin-top:24px;">С уважение,<br><strong>${fromName}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [user.email],
      subject: `Подновяване на договор ${contract.contract_number} — изтича след ${daysLeft} дни`,
      html,
    }),
  });
  if (!response.ok) {
    const r = await response.json().catch(() => ({}));
    return { sent: false, reason: r.message || 'resend_error' };
  }
  return { sent: true };
}

module.exports = { ensureTenantUser, sendWelcomeEmail, sendRenewalNotice };
