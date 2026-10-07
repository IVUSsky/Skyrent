// Споделени помощници за имейл изпращане (Resend).

// Почиства входа до масив от ЧИСТИ имейл адреса. Поддържа няколко адреса,
// разделени с , ; или нов ред; trim-ва интервали. Ако адресът е във формат
// 'Име <mail@x.bg>', изважда само 'mail@x.bg' (Resend отказва display-име с
// кирилица/спец. символи → суров 422 'Invalid `to` field'). Хвърля Error с
// ясно българско съобщение кой адрес е невалиден.
const EMAIL_RE = /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/;
const ANGLE_RE = /<\s*([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)\s*>/;

function parseRecipients(raw) {
  // settings стойностите се пазят JSON-кодирани (JSON.stringify) → цялата
  // стойност може да е обвита в кавички: "mail@x.bg". Маха се преди парсване.
  let s = String(raw || '').trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  const parts = s.split(/[;,\n]/).map(x => x.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error('Няма валиден имейл адрес');
  const out = [];
  for (const p of parts) {
    const cleaned = p.replace(/^["']+|["']+$/g, '').trim(); // и per-адрес кавички
    const m = cleaned.match(ANGLE_RE);
    const email = m ? m[1] : cleaned;
    if (!EMAIL_RE.test(email)) {
      throw new Error(`Невалиден имейл: "${p}". Формат: email@example.com`);
    }
    out.push(email);
  }
  return out;
}

// Подателят на изходящите писма.
//
// Напомнянията за наем ползваха smtp.user от настройките, а той е празен →
// пращаха се от onboarding@resend.dev. Това е тестовият адрес на Resend: от
// него може да се пише САМО на собственика на акаунта, затова писмата до
// наематели не тръгваха (07.10.2026 — гараж 62). Останалата система ползва
// RESEND_FROM_EMAIL. Тук редът е еднакъв за всички.
function resolveSender(smtp = {}) {
  const configured = String(smtp.user || '').trim();
  return process.env.RESEND_FROM_EMAIL || configured || 'info@skycapital.pro';
}

module.exports = { parseRecipients, EMAIL_RE, resolveSender };
