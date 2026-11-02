// Вторият наемател в шапката на договора — „между страните".
//
// Полетата за втори наемател се пазят от 02.11.2026, той получава ред за
// подпис и влиза в шапката на протокола. В САМИЯ ДОГОВОР обаче го нямаше:
// текстът идва от бланка в базата, а нито една бланка не ползваше
// {{НАЕМАТЕЛ2_ДАННИ}}. Резултат: човек, който се подписва отдолу, не е
// изписан горе като страна — подпис без страна.
//
// Затова вмъкването е в КОДА, а не в бланката: бланките са данни, всяка
// организация си има свои, а нова бланка утре пак няма да знае за втория.
// Ако бланката изрично ползва някой от плейсхолдърите за втори наемател,
// тук не се пипа нищо — авторът ѝ е решил сам къде да го сложи.

const PLACEHOLDERS = /\{\{\s*(НАЕМАТЕЛ2_[А-Я_]+|НАЕМАТЕЛИ)\s*\}\}/;

// Ползва ли бланката вече втория наемател сама.
const templateHasTenant2 = (text) => PLACEHOLDERS.test(String(text || ''));

// Двуезична ли е бланката — договорите „BG / EN" слагат двата езика на един
// ред, разделени с наклонена черта.
function looksBilingual(text) {
  const lines = String(text || '').split('\n');
  const en = lines.filter(l => /\/\s*[A-Z][A-Za-z]{2,}/.test(l)).length;
  return en >= 3;
}

const nz = (v) => String(v == null ? '' : v).trim();

// Данните на втория, в същия вид като на първия в бланката.
function tenant2Details(c = {}) {
  const bits = [];
  if (nz(c.tenant2_egn)) bits.push(`с ЕГН: ${nz(c.tenant2_egn)}`);
  if (nz(c.tenant2_doc_number)) {
    const kind = nz(c.tenant2_doc) || 'л.к.';
    const short = /лична/i.test(kind) ? 'л.к.' : kind;
    bits.push(`${short} № ${nz(c.tenant2_doc_number)}`);
  }
  if (nz(c.tenant2_doc_date)) bits.push(`изд. на: ${nz(c.tenant2_doc_date)} год.`);
  if (nz(c.tenant2_doc_country)) bits.push(`от ${nz(c.tenant2_doc_country)}`);
  if (nz(c.tenant2_address)) bits.push(`адрес: ${nz(c.tenant2_address)}`);
  if (nz(c.tenant2_dob)) bits.push(`роден на ${nz(c.tenant2_dob)}`);
  return bits.join(', ');
}

function tenant2DetailsEN(c = {}) {
  const bits = [];
  if (nz(c.tenant2_egn)) bits.push(`ID No: ${nz(c.tenant2_egn)}`);
  if (nz(c.tenant2_doc_number)) bits.push(`doc. No ${nz(c.tenant2_doc_number)}`);
  if (nz(c.tenant2_doc_date)) bits.push(`issued on ${nz(c.tenant2_doc_date)}`);
  if (nz(c.tenant2_address)) bits.push(`address: ${nz(c.tenant2_address)}`);
  if (nz(c.tenant2_dob)) bits.push(`born on ${nz(c.tenant2_dob)}`);
  return bits.join(', ');
}

// Клаузата, която държи втория отговорен наравно с първия. Без нея подписът
// му не значи нищо: наемодателят би могъл да търси сметка само от първия.
function jointClause(ordinals, bilingual) {
  const who = ordinals
    ? `Лицата по т. ${ordinals[0]} и т. ${ordinals[1]}`
    : 'Двете лица по-горе';
  const bg = `${who} се наричат заедно **Наемател**. Те отговарят солидарно за всички задължения по този договор — за заплащането на наемната цена, депозита и консумативите, както и за опазването на имота и на намиращото се в него имущество, за връщането му в състоянието по приемо-предавателния протокол и за действията и бездействията на всички ползватели на имота.`;
  if (!bilingual) return bg;
  const en = `They are jointly referred to as the "Tenant" and are jointly and severally liable for all obligations under this Agreement — payment of the rent, the deposit and the utilities, as well as the safekeeping of the property and of the belongings in it, its return in the condition recorded in the handover protocol, and the acts and omissions of all occupants.`;
  return `${bg} / ${en}`;
}

// Абзацът, който се вмъква. `label` повтаря номерирането на бланката
// („**3.**"), за да не изглежда прикачен отвън.
function tenant2Paragraph(contract, { label = '', bilingual = false, ordinals = null } = {}) {
  const name = nz(contract.tenant2_name);
  if (!name) return '';
  const details = tenant2Details(contract);
  const detailsEn = bilingual ? tenant2DetailsEN(contract) : '';
  const head = `**${label}${name}**${details ? ' ' + details : ''}${detailsEn ? ' / ' + detailsEn : ''}`;
  return ['и', '', head, '', jointClause(ordinals, bilingual)].join('\n');
}

// Вмъква втория наемател в шапката на бланката, ако тя сама не го ползва.
// Връща текста непроменен, когато няма втори наемател.
function ensureTenant2(templateText, contract = {}) {
  const text = String(templateText || '');
  if (!nz(contract.tenant2_name)) return text;
  if (templateHasTenant2(text)) return text;

  const lines = text.split('\n');
  const i = lines.findIndex(l => l.includes('{{НАЕМАТЕЛ_ИМЕ}}'));
  const bilingual = looksBilingual(text);

  // Номерът на първия наемател в бланката („**2. {{НАЕМАТЕЛ_ИМЕ}}**") дава
  // номера на втория. Бланка без номерация (интернет договорът пише
  // „**АБОНАТ:**") минава без номер.
  let label = '', ordinals = null;
  if (i >= 0) {
    const m = lines[i].match(/^\*\*(\d+)\./);
    if (m) { const n = Number(m[1]); label = `${n + 1}. `; ordinals = [n, n + 1]; }
  }

  const para = tenant2Paragraph(contract, { label, bilingual, ordinals });
  if (!para) return text;

  if (i >= 0) {
    // Бланката определя първия като „наричан за краткост **Наемател**".
    // Остане ли това, договорът казва на едно място, че Наемател е само
    // първият, а на друго — че са двамата. Кой отговаря става въпрос на
    // тълкуване точно когато има щета. Определението минава в общата клауза.
    lines[i] = lines[i].replace(
      /,?\s*нарич[а-я]*(?:\s+(?:за\s+краткост|по-долу))?\s*\*\*Наемател\*\*\s*\.?\s*$/u, '');
    lines.splice(i + 1, 0, '', para);
    return lines.join('\n');
  }
  // Няма ред с името на наемателя — слагаме абзаца преди първия раздел, за
  // да остане в уводната част, а не насред задълженията.
  const h = lines.findIndex(l => /^##\s/.test(l));
  if (h >= 0) { lines.splice(h, 0, para, ''); return lines.join('\n'); }
  // Съвсем непозната бланка: по-добре накрая, отколкото никъде.
  return `${text}\n\n${para}\n`;
}

module.exports = { ensureTenant2, tenant2Paragraph, templateHasTenant2, looksBilingual, tenant2Details };
