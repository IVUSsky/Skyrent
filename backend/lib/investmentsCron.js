// Investments cron: hourly gold price check + alert evaluation, weekly + monthly
// Claude reports. All three are tied to ANTHROPIC_API_KEY availability for the
// reports and Resend for email delivery; price-check works without either.

const cron = require('node-cron');
const { getMetalPriceEUR } = require('./goldPrice');
const { buildReport, SUPPORTED_METALS, METAL_LABEL_BG } = require('../routes/investments');

function getAdminEmails(db) {
  return db.prepare("SELECT email FROM users WHERE role='admin' AND email IS NOT NULL AND email != ''").all().map(u => u.email);
}

function getIssuer(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='issuer'").get();
  if (!row) return {};
  try { return JSON.parse(row.value); } catch { return {}; }
}

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return { sent: false, reason: 'no_key_or_to' };
  const fromName  = 'Sky Capital';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'info@skycapital.pro';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [to], subject, html }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.warn('Resend investments email failed:', err.message || r.status);
      return { sent: false, reason: err.message || r.status };
    }
    return { sent: true };
  } catch (e) {
    console.warn('Resend exception:', e.message);
    return { sent: false, reason: e.message };
  }
}

function emailShell(bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">
        <tr><td style="background:#1a1a2e;padding:18px 32px;font-size:18px;font-weight:bold;color:#fff;letter-spacing:2px;">SKY CAPITAL — INVESTMENTS</td></tr>
        <tr><td style="padding:32px 32px 24px;color:#1a1a2e;font-size:14px;line-height:1.7;">${bodyHtml}</td></tr>
        <tr><td style="background:#e8eaf2;padding:14px 32px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #d1d5db;">
          <strong>Sky Capital OOD</strong> · info@skycapital.pro
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Render Claude markdown report as basic HTML (headings + paragraphs only)
function markdownToHtml(md) {
  return md
    .replace(/^### (.+)$/gm, '<h3 style="color:#1a1a2e;margin:14px 0 6px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#1a1a2e;margin:16px 0 8px;">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="color:#1a1a2e;margin:18px 0 10px;">$1</h1>')
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .split('\n\n')
    .map(p => p.startsWith('<') ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

const METAL_ICON = { gold: '🥇', silver: '🥈', platinum: '⚪' };

async function processMetal(db, metal) {
  const price = await getMetalPriceEUR(metal);
  if (!price) { console.warn(`[metals cron] ${metal} price fetch failed`); return; }
  db.prepare('INSERT INTO gold_price_history (метал, цена_usd, цена_eur, промяна_24h) VALUES (?,?,?,?)')
    .run(metal, price.usd || null, price.eur || null, price.change24h || 0);
  console.log(`[metals cron] ${metal} price: €${Number(price.eur).toFixed(2)} (${price.source})`);

  const alerts = db.prepare(`SELECT * FROM gold_alerts WHERE метал=? AND активна=1 AND задействана=0`).all(metal);
  for (const a of alerts) {
    const triggered =
      (a.посока === 'под' && price.eur <= a.цена_eur) ||
      (a.посока === 'над' && price.eur >= a.цена_eur);
    if (!triggered) continue;

    const icon = METAL_ICON[metal] || '📈';
    const body = `
      <h2>🚨 Алармата за ${METAL_LABEL_BG[metal]} се задейства</h2>
      <table cellpadding="0" cellspacing="0" style="margin:18px 0;border-collapse:collapse;border:1px solid #d1d5db;border-radius:6px;overflow:hidden;width:100%;">
        <tr><td style="background:#f9fafb;padding:8px 14px;border-bottom:1px solid #d1d5db;color:#6b7280;font-size:12px;">Метал</td>
            <td style="padding:8px 14px;border-bottom:1px solid #d1d5db;font-weight:bold;">${icon} ${METAL_LABEL_BG[metal]}</td></tr>
        <tr><td style="background:#f9fafb;padding:8px 14px;border-bottom:1px solid #d1d5db;color:#6b7280;font-size:12px;">Условие</td>
            <td style="padding:8px 14px;border-bottom:1px solid #d1d5db;font-weight:bold;">Цена ${a.посока} €${Number(a.цена_eur).toFixed(0)}/oz</td></tr>
        <tr><td style="background:#f9fafb;padding:8px 14px;border-bottom:1px solid #d1d5db;color:#6b7280;font-size:12px;">Текуща цена</td>
            <td style="padding:8px 14px;border-bottom:1px solid #d1d5db;font-weight:bold;color:#166534;">€${Number(price.eur).toFixed(2)}/oz</td></tr>
        ${a.количество_oz ? `<tr><td style="background:#f9fafb;padding:8px 14px;border-bottom:1px solid #d1d5db;color:#6b7280;font-size:12px;">Препоръчано количество</td>
            <td style="padding:8px 14px;border-bottom:1px solid #d1d5db;font-weight:bold;">${a.количество_oz} oz ≈ €${(a.количество_oz * price.eur).toFixed(0)}</td></tr>` : ''}
        <tr><td style="background:#f9fafb;padding:8px 14px;color:#6b7280;font-size:12px;">Време</td>
            <td style="padding:8px 14px;">${new Date().toLocaleString('bg-BG')}</td></tr>
      </table>
      ${a.съобщение ? `<p style="background:#fef3c7;border:1px solid #fcd34d;padding:10px 14px;border-radius:6px;">${a.съобщение}</p>` : ''}
    `;
    for (const adminEmail of getAdminEmails(db)) {
      await sendEmail({ to: adminEmail, subject: `${icon} ${METAL_LABEL_BG[metal]} alert: €${Number(price.eur).toFixed(0)}/oz`, html: emailShell(body) });
    }
    db.prepare("UPDATE gold_alerts SET задействана=1, задействана_на=datetime('now') WHERE id=?").run(a.id);
    console.log(`[metals cron] ${metal} alert ${a.id} triggered at €${price.eur.toFixed(2)}`);
  }
}

function startInvestmentsCron(db) {
  // ── 1) Twice-daily price check + alert evaluation for ALL metals ────────
  // Mon–Fri only: COMEX / LBMA / NYMEX are closed on weekends, so spot price
  // is frozen at Friday close until Monday — saves API budget on duplicates.
  // 08:00 + 20:00 Europe/Sofia (server TZ). Budget: 2 metals × 2 calls × ~22
  // weekdays/month ≈ 88 calls — fits in goldapi.io free tier (100).
  cron.schedule('0 8,20 * * 1-5', async () => {
    for (const metal of SUPPORTED_METALS) {
      try { await processMetal(db, metal); }
      catch (e) { console.error(`[metals cron] scheduled ${metal} error:`, e.message); }
    }
  });

  // ── 2) Monday 09:00 — weekly Claude summary ──────────────────────────────
  cron.schedule('0 9 * * 1', async () => {
    if (!process.env.ANTHROPIC_API_KEY) { console.warn('[gold cron] skipping weekly report — no API key'); return; }
    try {
      console.log('[gold cron] generating weekly investment report');
      const report = await buildReport(db, 'weekly');
      const body = `<h2>📊 Седмично инвестиционно резюме</h2>${markdownToHtml(report.съдържание || '')}`;
      for (const adminEmail of getAdminEmails(db)) {
        await sendEmail({ to: adminEmail, subject: `📈 Skyrent: седмично инвестиционно резюме`, html: emailShell(body) });
      }
    } catch (e) { console.error('[gold cron] weekly report error:', e.message); }
  });

  // ── 3) 1st of month 08:00 — monthly Claude report ────────────────────────
  cron.schedule('0 8 1 * *', async () => {
    if (!process.env.ANTHROPIC_API_KEY) { console.warn('[gold cron] skipping monthly report — no API key'); return; }
    try {
      console.log('[gold cron] generating monthly investment report');
      const report = await buildReport(db, 'monthly');
      const body = `<h2>📊 Месечен инвестиционен доклад</h2>${markdownToHtml(report.съдържание || '')}`;
      for (const adminEmail of getAdminEmails(db)) {
        await sendEmail({ to: adminEmail, subject: `📈 Skyrent: месечен инвестиционен доклад`, html: emailShell(body) });
      }
    } catch (e) { console.error('[gold cron] monthly report error:', e.message); }
  });

  // Fire a price-check 60s after boot too — keeps history populated on fresh installs
  setTimeout(async () => {
    for (const metal of SUPPORTED_METALS) {
      try { await processMetal(db, metal); }
      catch (e) { console.error(`[metals cron] startup ${metal} error:`, e.message); }
    }
  }, 60 * 1000);

  console.log('[metals cron] schedules installed for', SUPPORTED_METALS.join(', '), '(Mon-Fri 08:00+20:00, Mon 09:00 weekly, 1st 08:00 monthly)');
}

module.exports = { startInvestmentsCron };
