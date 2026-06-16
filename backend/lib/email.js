// Споделени помощници за имейл изпращане (Resend).

// Почиства входния стринг до масив от валидни имейли. Поддържа няколко адреса,
// разделени с , ; или нов ред; trim-ва интервали. Разрешава 'Име <имейл>'.
// Хвърля Error с ясно (българско) съобщение кой адрес е невалиден — за да не
// гръмне Resend със суров 422 'Invalid `to` field'.
const EMAIL_RE = /^(?:[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+|.+<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>)$/;

function parseRecipients(raw) {
  const parts = String(raw || '').split(/[;,\n]/).map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error('Няма валиден имейл адрес');
  const bad = parts.filter(p => !EMAIL_RE.test(p));
  if (bad.length) throw new Error(`Невалиден имейл: "${bad.join('", "')}". Формат: email@example.com`);
  return parts;
}

module.exports = { parseRecipients, EMAIL_RE };
