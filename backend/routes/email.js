const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

module.exports = function(db) {
  const router = express.Router();

  function getSmtpConfig() {
    const row = db.prepare("SELECT value FROM settings WHERE key='smtp'").get();
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return null; }
  }

  function createTransporter(smtp) {
    return nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port) || 587,
      secure: Number(smtp.port) === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      family: 4, // force IPv4 — Railway blocks IPv6 outbound
    });
  }

  function buildHtml(bodyHtml, senderName) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">
        <tr><td style="background:#1a1a2e;padding:18px 32px;">
          <span style="color:#e8eaf2;font-size:16px;font-weight:bold;letter-spacing:2px;">SKY CAPITAL</span>
        </td></tr>
        <tr><td style="padding:32px 32px 24px;color:#1a1a2e;font-size:14px;line-height:1.7;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="background:#e8eaf2;padding:14px 32px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #d1d5db;">
          <strong>${senderName || 'Sky Capital OOD'}</strong>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }

  // Test SMTP connection
  router.post('/test', async (req, res) => {
    const smtp = getSmtpConfig();
    if (!smtp || !smtp.host || !smtp.user || !smtp.pass) {
      return res.status(400).json({ error: 'SMTP настройките не са попълнени в Настройки' });
    }
    try {
      const transporter = createTransporter(smtp);
      await transporter.verify();
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Send reminder to one tenant
  router.post('/reminder', async (req, res) => {
    const { to, tenant_name, property_address, amount, month_label, from_name } = req.body;
    if (!to) return res.status(400).json({ error: 'Липсва email адрес' });

    const smtp = getSmtpConfig();
    if (!smtp || !smtp.host || !smtp.user || !smtp.pass) {
      return res.status(400).json({ error: 'SMTP настройките не са попълнени' });
    }

    const bodyHtml = `
      <p>Уважаеми/а <strong>${tenant_name}</strong>,</p>
      <p>Напомняме Ви, че наемът за <strong>${month_label}</strong> за имот
      <strong>${property_address}</strong> в размер на <strong>${amount} €</strong>
      все още не е постъпил по нашата сметка.</p>
      <p>Моля, наредете плащането възможно най-скоро.</p>
      <p>При въпроси не се колебайте да се свържете с нас.</p>
      <p style="margin-top:24px;">С уважение,<br><strong>${from_name || smtp.from_name || 'Sky Capital'}</strong></p>`;

    try {
      const transporter = createTransporter(smtp);
      await transporter.sendMail({
        from: `"${from_name || smtp.from_name || 'Sky Capital'}" <${smtp.user}>`,
        to,
        subject: `Напомняне за наем — ${month_label}`,
        html: buildHtml(bodyHtml, from_name || smtp.from_name),
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

    const smtp = getSmtpConfig();
    if (!smtp || !smtp.host || !smtp.user || !smtp.pass) {
      return res.status(400).json({ error: 'SMTP настройките не са попълнени' });
    }

    const transporter = createTransporter(smtp);
    const senderName = from_name || smtp.from_name || 'Sky Capital';
    const results = [];

    for (const t of tenants) {
      if (!t.email) { results.push({ name: t.name, ok: false, error: 'Няма email' }); continue; }
      const bodyHtml = `
        <p>Уважаеми/а <strong>${t.name}</strong>,</p>
        <p>Напомняме Ви, че наемът за <strong>${month_label}</strong> за имот
        <strong>${t.address}</strong> в размер на <strong>${t.amount} €</strong>
        все още не е постъпил по нашата сметка.</p>
        <p>Моля, наредете плащането възможно най-скоро.</p>
        <p style="margin-top:24px;">С уважение,<br><strong>${senderName}</strong></p>`;
      try {
        await transporter.sendMail({
          from: `"${senderName}" <${smtp.user}>`,
          to: t.email,
          subject: `Напомняне за наем — ${month_label}`,
          html: buildHtml(bodyHtml, senderName),
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
