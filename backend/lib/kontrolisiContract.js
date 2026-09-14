// Изпращане на договор към счетоводния (Kontrolisi) имейл.
//
// Отделен модул, а не вътре в routes/contracts.js, защото сглобяването на
// писмото е чиста функция и трябва да се тества: ако някое поле изчезне или
// сумата тръгне с грешна валута, счетоводителят осчетоводява грешно.
const fs = require('fs');
const path = require('path');
const { parseRecipients } = require('./email');
const { getIssuer } = require('./branding');

// Включено ли е авто-изпращане на договори.
// Нарочно ОТДЕЛНА настройка от `kontrolisi_auto` (той праща фактури): Skyrent е
// многофирмен и мълчаливото разширяване на съществуващ ключ би започнало да
// праща договорите на всички организации, които са включили фактурите.
function kontrolisiContractsOn(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='kontrolisi_contracts'").get();
  if (!row) return false;
  return row.value === 'true' || row.value === '1' || row.value === true;
}

const fmtDate = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? String(d)
    : `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}.${t.getFullYear()}`;
};
const fmtMoney = (n, cur) =>
  `${Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur || 'EUR'}`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Редовете, по които счетоводителят осчетоводява. Празните полета отпадат —
// по-добре липсващ ред, отколкото ред с „undefined".
function contractRows(contract) {
  return [
    ['Наемодател', contract.landlord_name],
    ['Наемател', contract.tenant_name],
    ['ЕГН / ЕИК на наемателя', contract.tenant_egn],
    ['Имот', contract.property_address],
    ['Срок', contract.start_date
      ? `${fmtDate(contract.start_date)} – ${contract.end_date ? fmtDate(contract.end_date) : 'безсрочен'}`
      : null],
    ['Месечен наем', Number(contract.monthly_rent) > 0 ? fmtMoney(contract.monthly_rent, contract.currency) : null],
    ['Депозит', Number(contract.deposit) > 0 ? fmtMoney(contract.deposit, contract.currency) : null],
    ['Падеж на наема', contract.payment_day ? `до ${contract.payment_day}-то число` : null],
    ['Начин на плащане', contract.payment_method],
    ['Активиран на', contract.activated_at ? fmtDate(contract.activated_at) : null],
  ].filter(([, v]) => v != null && v !== '');
}

function buildContractEmail(contract, issuerName) {
  const label = `Договор за наем № ${contract.contract_number || '#' + contract.id}`;
  const rows = contractRows(contract);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,sans-serif;color:#15151e;">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #dcd4c2;">
    <tr><td style="padding:18px 24px;border-bottom:2px solid #c9a24b;font-size:16px;font-weight:bold;">${esc(label)}</td></tr>
    <tr><td style="padding:20px 24px;font-size:13px;line-height:1.6;">
      <p style="margin:0 0 14px;">Договорът е активиран и е приложен към това писмо.</p>
      <table cellpadding="0" cellspacing="0" style="font-size:13px;">
        ${rows.map(([k, v]) =>
          `<tr><td style="padding:3px 16px 3px 0;color:#6e6a60;">${esc(k)}</td><td style="padding:3px 0;font-weight:bold;">${esc(v)}</td></tr>`
        ).join('')}
      </table>
    </td></tr>
    <tr><td style="padding:12px 24px;background:#f4f1ea;font-size:11px;color:#6e6a60;">${esc(issuerName)}</td></tr>
  </table>
</body></html>`;
  return {
    subject: `${label}${contract.tenant_name ? ' — ' + contract.tenant_name : ''}`,
    html,
    rows,
    attachmentName: `Договор_${contract.contract_number || contract.id}`,
  };
}

// Best-effort — ползва се и от ръчния бутон, и от авто-изпращането при
// активиране. Връща { ok, reason } вместо да хвърля: провалено писмо не бива
// да отменя активирането на договор, който вече е в сила.
async function sendContractToKontrolisi(db, contract, pdfDir) {
  const row = db.prepare("SELECT value FROM settings WHERE key='kontrolisi_email'").get();
  if (!row?.value) return { ok: false, reason: 'no_email' };
  let recipients;
  try { recipients = parseRecipients(row.value); }
  catch (e) { return { ok: false, reason: e.message }; }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, reason: 'no_resend' };
  if (!contract.pdf_path) return { ok: false, reason: 'no_pdf' };
  const filepath = path.join(pdfDir, contract.pdf_path);
  if (!fs.existsSync(filepath)) return { ok: false, reason: 'no_pdf' };

  const issuer = getIssuer(db);
  const fromName = issuer.name || 'Skyrent';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'info@skycapital.pro';
  const mail = buildContractEmail(contract, fromName);
  const ext = path.extname(contract.pdf_path) || '.pdf';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: recipients,
      subject: mail.subject,
      html: mail.html,
      attachments: [{
        filename: `${mail.attachmentName}${ext}`,
        content: fs.readFileSync(filepath).toString('base64'),
      }],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, reason: result.message || 'send_error' };
  return { ok: true };
}

module.exports = { kontrolisiContractsOn, buildContractEmail, contractRows, sendContractToKontrolisi };
