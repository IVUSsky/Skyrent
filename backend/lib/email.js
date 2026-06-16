// Споделени помощници за имейл изпращане (Resend).

// Почиства входа до масив от ЧИСТИ имейл адреса. Поддържа няколко адреса,
// разделени с , ; или нов ред; trim-ва интервали. Ако адресът е във формат
// 'Име <mail@x.bg>', изважда само 'mail@x.bg' (Resend отказва display-име с
// кирилица/спец. символи → суров 422 'Invalid `to` field'). Хвърля Error с
// ясно българско съобщение кой адрес е невалиден.
const EMAIL_RE = /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/;
const ANGLE_RE = /<\s*([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)\s*>/;

function parseRecipients(raw) {
  const parts = String(raw || '').split(/[;,\n]/).map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error('Няма валиден имейл адрес');
  const out = [];
  for (const p of parts) {
    const m = p.match(ANGLE_RE);
    const email = m ? m[1] : p;
    if (!EMAIL_RE.test(email)) {
      throw new Error(`Невалиден имейл: "${p}". Формат: email@example.com`);
    }
    out.push(email);
  }
  return out;
}

module.exports = { parseRecipients, EMAIL_RE };
