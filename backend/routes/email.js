const express = require('express');
const { Resend } = require('resend');
const { resolveSender } = require('../lib/email');
const { getIssuer, brandEmailHtml } = require('../lib/branding');
const { isOverdue, dueDayMap } = require('../lib/rentDue');
const { withTenantEmail } = require('../lib/tenantEmailFallback');
const {
  remindable, reminderSubject, reminderBody, monthName, paidSignForMonth, alreadySent,
} = require('../lib/rentReminder');

module.exports = function(db) {
  const router = express.Router();

  function getResend() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return null;
    return new Resend(apiKey);
  }

  function getSmtpConfig() {
    const row = db.prepare("SELECT value FROM settings WHERE key='smtp'").get();
    if (!row) return {};
    try { return JSON.parse(row.value); } catch { return {}; }
  }

  // Test connection
  router.post('/test', async (req, res) => {
    const resend = getResend();
    if (!resend) return res.status(400).json({ error: 'RESEND_API_KEY не е зададен в Railway environment variables' });
    try {
      const { data, error } = await resend.domains.list();
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true, domains: (data?.data || []).map(d => d.name) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── Напомняния за забавен наем ───────────────────────────────────────────
  //
  // Иво (02.11.2026): напомнянето отива до наемателя, но след ЕГО преглед.
  // Затова има две стъпки: `prepare` показва кой закъснява и какво ще пише в
  // писмото, `/reminder` праща ЕДНО писмо на ЕДИН адрес.
  //
  // Дотук бутонът пращаше веднага, с текст, зашит в този файл, и „до всички"
  // хващаше всеки неплатил — включително хората, чийто падеж още не е дошъл
  // (Стефан плаща към 15-о, Атанас към 18-о). Проверките по-долу са в
  // сървъра нарочно: екранът може да е отпреди половин час.

  const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]
  ));
  // Писмото се пише и преглежда като обикновен текст; тук става HTML.
  const textToHtml = (text) => String(text || '').split(/\n{2,}/)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');

  const thisMonth = () => new Date().toISOString().slice(0, 7);

  // Редовете за избрания месец: кой закъснява, какво ще му пишем, пращано ли
  // е вече. Без никакво изпращане.
  function prepareRows(month, ids) {
    const issuer = getIssuer(db);
    const dueDays = dueDayMap(db);
    const where = ids && ids.length ? ` AND id IN (${ids.map(() => '?').join(',')})` : '';
    const props = withTenantEmail(db, db.prepare(
      `SELECT * FROM properties
        WHERE статус = '✅' AND наемател IS NOT NULL AND наемател != ''${where}
        ORDER BY адрес`
    ).all(...(ids && ids.length ? ids : [])));

    const marked = props.map(p => {
      const due_day = dueDays[p.id] || 5;
      return { ...p, due_day, is_overdue: isOverdue(month, due_day) };
    });

    const rows = remindable(marked, { month }).map(row => {
      const paid = paidSignForMonth(db, row.property_id, month);
      const sent = alreadySent(db, row.property_id, month);
      return {
        ...row,
        subject: reminderSubject(row),
        body: reminderBody(row, { name: issuer.name, iban: issuer.iban }),
        paid_sign: paid.paid ? paid.reason : null,
        already_sent_at: sent ? sent.created_at : null,
        already_sent_to: sent ? sent.sent_to : null,
        // Готов ли е за изпращане без повече мислене
        can_send: row.can_send && !paid.paid,
        blocked: row.blocked || (paid.paid ? `има ${paid.reason}` : null),
      };
    });

    // Готовите за изпращане напред, после непратените, после вече пратените.
    const rank = (r) => (r.can_send ? 0 : 2) + (r.already_sent_at ? 1 : 0);
    return rows.sort((a, b) => rank(a) - rank(b) || b.days_late - a.days_late);
  }

  // Кой закъснява и какво ще му се прати — за прегледа.
  router.get('/reminders', (req, res) => {
    try {
      const month = req.query.month || thisMonth();
      const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean);
      res.json({ month, month_label: monthName(month), reminders: prepareRows(month, ids) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Изпраща ЕДНО напомняне, след преглед. `subject`/`body` идват от прегледа,
  // за да може Иво да е поправил текста; ако не дойдат, се ползва готовият.
  router.post('/reminder', async (req, res) => {
    const month = req.body.month || thisMonth();
    const propertyId = Number(req.body.property_id) || null;
    const force = req.body.force === true;

    // Старият път (само `to`, без property_id) вече не се поддържа: без имот
    // не може да се провери дали човекът не е платил междувременно.
    if (!propertyId) return res.status(400).json({ error: 'Липсва имот (property_id) — не може да се провери плащането' });

    const row = prepareRows(month, [propertyId])[0];
    if (!row) return res.status(400).json({ error: 'Имотът не е в списъка на закъснелите за този месец' });

    const to = String(req.body.to || row.email || '').trim();
    if (!to) return res.status(400).json({ error: 'Липсва имейл адрес' });
    if (row.paid_sign) return res.status(409).json({ error: `Не е изпратено: ${row.paid_sign}` });
    if (row.already_sent_at && !force) {
      return res.status(409).json({ error: `Вече е изпратено на ${row.already_sent_at}`, already_sent_at: row.already_sent_at });
    }

    const resend = getResend();
    if (!resend) return res.status(400).json({ error: 'RESEND_API_KEY не е зададен в Railway' });

    const smtp = getSmtpConfig();
    const issuer = getIssuer(db);
    const senderName = req.body.from_name || smtp.from_name || issuer.name || 'Skyrent';
    const fromEmail = resolveSender(smtp);
    const subject = String(req.body.subject || row.subject);
    const body = String(req.body.body || row.body);

    try {
      const { error } = await resend.emails.send({
        from: `${senderName} <${fromEmail}>`,
        to,
        subject,
        html: brandEmailHtml(textToHtml(body), issuer),
      });
      if (error) return res.status(500).json({ error: error.message });
      try {
        db.prepare(`INSERT INTO rent_reminders (property_id, month, sent_to, subject, body, sent_by)
                    VALUES (?, ?, ?, ?, ?, ?)`)
          .run(propertyId, month, to, subject, body, req.user?.username || null);
      } catch (e) { console.error('напомнянето е пратено, но не се записа:', e.message); }
      res.json({ ok: true, to, property_id: propertyId, month });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
