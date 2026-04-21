const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '../data/logos/sky_capital_logo.png');

module.exports = function(db) {
  const router = express.Router();

  function getSmtpSettings() {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'smtp'").get();
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return null; }
  }

  function createTransport(smtp) {
    return nodemailer.createTransport({
      host:   smtp.host,
      port:   Number(smtp.port) || 587,
      secure: smtp.port == 465,
      auth:   { user: smtp.user, pass: smtp.pass },
      tls:    { rejectUnauthorized: false },
    });
  }

  function buildHtml(bodyHtml, senderName) {
    const hasLogo = fs.existsSync(LOGO_PATH);
    const logoTag = hasLogo
      ? `<img src="cid:skylogo" alt="Sky Capital" style="height:44px;display:block;">`
      : `<span style="color:#e8eaf2;font-size:16px;font-weight:bold;letter-spacing:2px;">SKY CAPITAL</span>`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">
        <!-- Header -->
        <tr><td style="background:#1a1a2e;padding:18px 32px;">
          ${logoTag}
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 32px 24px;color:#1a1a2e;font-size:14px;line-height:1.7;">
          ${bodyHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#e8eaf2;padding:14px 32px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #d1d5db;">
          <strong>${senderName || 'Sky Capital OOD'}</strong> &nbsp;|&nbsp; info@skycapital.pro &nbsp;|&nbsp; +359 888 64 64 20
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }

  function logoAttachment() {
    if (!fs.existsSync(LOGO_PATH)) return [];
    return [{ filename: 'logo.png', path: LOGO_PATH, cid: 'skylogo' }];
  }

  // Test SMTP connection
  router.post('/test', async (req, res) => {
    const smtp = getSmtpSettings();
    if (!smtp) return res.status(400).json({ error: 'SMTP не е конфигуриран' });
    try {
      const transporter = createTransport(smtp);
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout — провери host/port или дали портът е блокиран')), 10000)
      );
      await Promise.race([transporter.verify(), timeout]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Send reminder to one tenant
  router.post('/reminder', async (req, res) => {
    const { to, tenant_name, property_address, amount, month_label, from_name } = req.body;
    if (!to) return res.status(400).json({ error: 'Липсва email адрес' });

    const smtp = getSmtpSettings();
    if (!smtp) return res.status(400).json({ error: 'SMTP не е конфигуриран в Настройки' });

    const subject = `Напомняне за наем — ${month_label}`;
    const bodyHtml = `
      <p>Уважаеми/а <strong>${tenant_name}</strong>,</p>
      <p>Напомняме Ви, че наемът за <strong>${month_label}</strong> за имот
      <strong>${property_address}</strong> в размер на <strong>${amount} €</strong>
      все още не е постъпил по нашата сметка.</p>
      <p>Моля, наредете плащането възможно най-скоро.</p>
      <p>При въпроси не се колебайте да се свържете с нас.</p>
      <p style="margin-top:24px;">С уважение,<br><strong>${from_name || 'Sky Capital'}</strong></p>`;

    try {
      const transporter = createTransport(smtp);
      await transporter.sendMail({
        from: `"${from_name || 'Sky Capital'}" <${smtp.user}>`,
        to,
        subject,
        text: `Уважаеми/а ${tenant_name},\n\nНапомняме Ви, че наемът за ${month_label} за имот ${property_address} в размер на ${amount} € все още не е постъпил.\n\nМоля наредете плащането.\n\nС уважение,\n${from_name || 'Sky Capital'}`,
        html: buildHtml(bodyHtml, from_name),
        attachments: logoAttachment(),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Send reminders to all unpaid tenants (bulk)
  router.post('/reminder-bulk', async (req, res) => {
    const { tenants, month_label, from_name } = req.body;
    if (!tenants || !tenants.length) return res.status(400).json({ error: 'Няма наематели' });

    const smtp = getSmtpSettings();
    if (!smtp) return res.status(400).json({ error: 'SMTP не е конфигуриран в Настройки' });

    const transporter = createTransport(smtp);
    const results = [];

    for (const t of tenants) {
      if (!t.email) { results.push({ name: t.name, ok: false, error: 'Няма email' }); continue; }
      const bodyHtml = `
        <p>Уважаеми/а <strong>${t.name}</strong>,</p>
        <p>Напомняме Ви, че наемът за <strong>${month_label}</strong> за имот
        <strong>${t.address}</strong> в размер на <strong>${t.amount} €</strong>
        все още не е постъпил по нашата сметка.</p>
        <p>Моля, наредете плащането възможно най-скоро.</p>
        <p style="margin-top:24px;">С уважение,<br><strong>${from_name || 'Sky Capital'}</strong></p>`;
      try {
        await transporter.sendMail({
          from: `"${from_name || 'Sky Capital'}" <${smtp.user}>`,
          to: t.email,
          subject: `Напомняне за наем — ${month_label}`,
          text: `Уважаеми/а ${t.name},\n\nНапомняме Ви, че наемът за ${month_label} за имот ${t.address} в размер на ${t.amount} € все още не е постъпил.\n\nС уважение,\n${from_name || 'Sky Capital'}`,
          html: buildHtml(bodyHtml, from_name),
          attachments: logoAttachment(),
        });
        results.push({ name: t.name, ok: true });
      } catch (err) {
        results.push({ name: t.name, ok: false, error: err.message });
      }
    }
    res.json({ results });
  });

  return router;
};
