// Per-org брандинг за транзакционни документи и имейли (multi-tenant white-label).
// Заменя твърдо закачения 'Sky Capital' — всяка организация издава документи и
// имейли със СВОИТЕ данни (issuer). Името по подразбиране е името на самата
// организация, никога чужда фирма.

const ESC = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, c => (
  { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]
));

// Зарежда issuer (фирмени данни) на текущата организация от settings. Ако името
// липсва → fallback към името на организацията от control.db (НЕ 'Sky Capital').
function getIssuer(db) {
  let issuer = {};
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='issuer'").get();
    if (row) issuer = JSON.parse(row.value) || {};
  } catch { issuer = {}; }
  if (!issuer.name) {
    try {
      const org = (db.control && db.orgId)
        ? db.control.prepare('SELECT name FROM organizations WHERE id=?').get(db.orgId)
        : null;
      if (org && org.name) issuer.name = org.name;
    } catch { /* извън request контекст — оставяме празно */ }
  }
  return issuer;
}

// Достатъчно ли е попълнен фирменият профил, за да се издават документи.
// Минимум: име + ЕИК/ЕГН (иначе фактурата/договорът излизат непълни).
function issuerComplete(issuer) {
  return !!(issuer && issuer.name && issuer.eik);
}

// Брандиран имейл шел за транзакционни документи. Хедър/футър = данните на
// ИЗДАВАЩАТА организация, не на платформата. Текстов wordmark (без вградено
// лого) → еднакво се рендира в SMTP и Resend, нула чужд брандинг.
function brandEmailHtml(bodyHtml, issuer = {}) {
  const name = ESC(issuer.name || 'Skyrent');
  const contact = [issuer.email, issuer.phone].filter(Boolean).map(ESC).join(' &nbsp;|&nbsp; ');
  const footer = contact ? `<strong>${name}</strong> &nbsp;|&nbsp; ${contact}` : `<strong>${name}</strong>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">
        <tr><td style="background:#1a1a2e;padding:18px 32px;font-size:18px;font-weight:bold;color:#ffffff;letter-spacing:1px;">${name}</td></tr>
        <tr><td style="padding:32px 32px 24px;color:#1a1a2e;font-size:14px;line-height:1.7;">${bodyHtml}</td></tr>
        <tr><td style="background:#e8eaf2;padding:14px 32px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #d1d5db;">${footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

module.exports = { getIssuer, issuerComplete, brandEmailHtml };
