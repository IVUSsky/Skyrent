const express = require('express');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '../data/logos/sky_capital_logo.png');

module.exports = function(db) {
  const router = express.Router();

  function getResend() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return null;
    return new Resend(apiKey);
  }

  function getFromEmail() {
    return process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
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

  // Test connection
  router.post('/test', async (req, res) => {
    const resend = getResend();
    if (!resend) return res.status(400).json({ error: 'RESEND_API_KEY не е зададен в сървъра' });
    try {
      const result = await resend.domains.list();
      if (result.error) return res.status(400).json({ error: result.error.message });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Send reminder to one tenant
  router.post('/reminder', async (req, res) => {
    const { to, tenant_name, property_address, amount, month_label, from_name } = req.body;
    if (!to) return res.status(400).json({ error: 'Липсва email адрес' });

    const resend = getResend();
    if (!resend) return res.status(400).json({ error: 'RESEND_API_KEY не е зададен' });

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
      const { error } = await resend.emails.send({
        from: `${from_name || 'Sky Capital'} <${getFromEmail()}>`,
        to,
        subject,
        html: buildHtml(bodyHtml, from_name),
      });
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Send reminders to all unpaid tenants (bulk)
  router.post('/reminder-bulk', async (req, res) => {
    const { tenants, month_label, from_name } = req.body;
    if (!tenants || !tenants.length) return res.status(400).json({ error: 'Няма наематели' });

    const resend = getResend();
    if (!resend) return res.status(400).json({ error: 'RESEND_API_KEY не е зададен' });

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
        const { error } = await resend.emails.send({
          from: `${from_name || 'Sky Capital'} <${getFromEmail()}>`,
          to: t.email,
          subject: `Напомняне за наем — ${month_label}`,
          html: buildHtml(bodyHtml, from_name),
        });
        results.push({ name: t.name, ok: !error, error: error?.message });
      } catch (err) {
        results.push({ name: t.name, ok: false, error: err.message });
      }
    }
    res.json({ results });
  });

  return router;
};
