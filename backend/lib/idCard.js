// Проверка и подреждане на данните, извлечени от документ за самоличност.
//
// Поводът (28.09.2026): в „Номер на документа" излизаше ДАТА, а истинският
// номер изобщо не се попълваше. Две причини:
//   1) формата връзваше полето „Номер на документа" към tenant_doc_date, а
//      извличането слагаше там датата на издаване (id_number се изхвърляше);
//   2) моделът понякога бърка реда „Валидна до" с номера — на българската ЛК
//      номерът е на ЛИЦЕВАТА страна долу дясно, 9 цифри, без разделители.
//
// Тук се пази втората линия на защита: каквото и да върне моделът, номер, който
// изглежда като дата (или съвпада с дата от документа), се отхвърля, а когато
// има MRZ (машинно четимата зона на гърба) той е източникът на истината —
// MRZ носи и контролни цифри, така че грешка в четенето се хваща.

// ── MRZ ────────────────────────────────────────────────────────────────────
// TD1 (лична карта): 3 реда по 30 знака. TD3 (паспорт): 2 реда по 44.
const WEIGHTS = [7, 3, 1];
const charVal = (c) => {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55; // A=10
  return 0; // '<' и всичко останало
};
function checkDigit(s) {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += charVal(s[i]) * WEIGHTS[i % 3];
  return String(sum % 10);
}
// ГГММДД → ГГГГ-ММ-ДД. pivot: рождените дати са в миналото, валидността — напред.
function mrzDate(yymmdd, kind) {
  if (!/^\d{6}$/.test(yymmdd)) return '';
  const yy = Number(yymmdd.slice(0, 2)), mm = yymmdd.slice(2, 4), dd = yymmdd.slice(4, 6);
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return '';
  const cur = new Date().getFullYear() % 100;
  const century = kind === 'expiry' ? (yy <= cur + 30 ? 2000 : 1900) : (yy <= cur ? 2000 : 1900);
  return `${century + yy}-${mm}-${dd}`;
}

// text: суровите редове на MRZ (както ги е прочел моделът).
// → { ok, format, doc_number, doc_number_valid, egn, birth_date, expiry_date, sex, nationality, warnings }
function parseMrz(text) {
  const lines = String(text || '')
    .toUpperCase().split(/[\r\n]+/)
    .map(l => l.replace(/\s+/g, '').replace(/[«»]/g, '<'))
    .filter(l => l.length >= 28);
  if (!lines.length) return { ok: false, warnings: ['няма MRZ'] };
  const warnings = [];

  if (lines.length >= 2 && lines[0].length >= 40) { // TD3 — паспорт
    const l2 = lines[1];
    const doc = l2.slice(0, 9).replace(/</g, '');
    const okDoc = checkDigit(l2.slice(0, 9)) === l2[9];
    if (!okDoc) warnings.push('контролната цифра на номера в MRZ не съвпада');
    return {
      ok: true, format: 'TD3', doc_number: doc, doc_number_valid: okDoc,
      egn: '', nationality: l2.slice(10, 13).replace(/</g, ''),
      birth_date: mrzDate(l2.slice(13, 19), 'birth'), sex: l2[20] === 'F' ? 'Ж' : l2[20] === 'M' ? 'М' : '',
      expiry_date: mrzDate(l2.slice(21, 27), 'expiry'), warnings,
    };
  }

  if (lines.length < 3) return { ok: false, warnings: ['непълна MRZ (очаквам 3 реда)'] };
  const [l1, l2] = lines;
  const doc = l1.slice(5, 14).replace(/</g, '');
  const okDoc = checkDigit(l1.slice(5, 14)) === l1[14];
  if (!okDoc) warnings.push('контролната цифра на номера в MRZ не съвпада');
  // Български ЛК: в опционалното поле стои ЕГН
  const egn = (l1.slice(15, 30).match(/\d{10}/) || [''])[0];
  const birth = mrzDate(l2.slice(0, 6), 'birth');
  const expiry = mrzDate(l2.slice(8, 14), 'expiry');
  if (checkDigit(l2.slice(0, 6)) !== l2[6]) warnings.push('контролната цифра на рождената дата не съвпада');
  if (checkDigit(l2.slice(8, 14)) !== l2[14]) warnings.push('контролната цифра на валидността не съвпада');
  return {
    ok: true, format: 'TD1', doc_number: doc, doc_number_valid: okDoc, egn,
    birth_date: birth, expiry_date: expiry,
    sex: l2[7] === 'F' ? 'Ж' : l2[7] === 'M' ? 'М' : '',
    nationality: l2.slice(15, 18).replace(/</g, ''), warnings,
  };
}

// ── ЕГН ────────────────────────────────────────────────────────────────────
const EGN_W = [2, 4, 8, 5, 10, 9, 7, 3, 6];
function validateEgn(egn) {
  const s = String(egn || '').replace(/\D/g, '');
  if (s.length !== 10) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(s[i]) * EGN_W[i];
  if (String(sum % 11 % 10) !== s[9]) return false;
  // месецът носи века: 01-12 = 1900, 21-32 = 1800, 41-52 = 2000
  let m = Number(s.slice(2, 4));
  if (m > 40) m -= 40; else if (m > 20) m -= 20;
  const d = Number(s.slice(4, 6));
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

// ── Дати и номер ───────────────────────────────────────────────────────────
// Всичко, което прилича на дата: 2030-05-12, 12.05.2030, 12/05/30, 120530…
function isDateLike(v) {
  const s = String(v || '').trim();
  if (!s) return false;
  if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(s)) return true;
  if (/^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/.test(s)) return true;
  if (/^\d{6}$/.test(s) && mrzDate(s, 'expiry')) return true; // ГГММДД
  return false;
}
function normalizeDate(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2})$/);
  if (m) return `${Number(m[3]) <= 50 ? '20' : '19'}${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}
// Маха етикети и разделители: „№ 641 228 123", „AB 1234567" → „641228123"
function cleanDocNumber(v) {
  return String(v || '')
    .replace(/[№#]/g, ' ')
    // кирилските етикети без \b — в JS границата на дума е само за ASCII,
    // затова „л.к. № 641…" оставаше като „ЛК641…"
    .replace(/(номер|документ|док\.?|лична\s*карта|л\s*\.?\s*к\s*\.?|паспорт)/gi, ' ')
    .replace(/\b(no|nr|id|card|passport)\b\.?/gi, ' ')
    .replace(/[\s\-–—.]/g, '')
    .trim().toUpperCase();
}
// Българска ЛК: точно 9 цифри. Паспорт/чужд документ: 6-12 букви и цифри.
function looksLikeDocNumber(v, { bulgarian = true } = {}) {
  const s = cleanDocNumber(v);
  if (!s) return false;
  if (isDateLike(v)) return false;
  return bulgarian ? /^\d{9}$/.test(s) : /^[A-Z0-9]{6,12}$/.test(s);
}

// ── Подреждане на извлечените данни ────────────────────────────────────────
// raw: JSON-ът от модела (може да съдържа и поле `mrz`).
// → { data, warnings } — data е готова за формата, warnings се показват на Иво.
function normalizeIdCard(raw = {}) {
  const warnings = [];
  const out = {
    tenant_name: String(raw.tenant_name || '').trim(),
    egn: String(raw.egn || '').replace(/\s/g, '').trim(),
    id_number: '',
    id_issued_by: String(raw.id_issued_by || '').trim(),
    id_issued_date: normalizeDate(raw.id_issued_date),
    id_valid_until: normalizeDate(raw.id_valid_until),
    birth_date: normalizeDate(raw.birth_date),
    permanent_address: String(raw.permanent_address || '').trim(),
  };
  const mrz = raw.mrz ? parseMrz(raw.mrz) : { ok: false };
  const bulgarian = !mrz.ok || mrz.format === 'TD1';

  // 1) Номер — MRZ е с предимство (има контролна цифра)
  const claimed = cleanDocNumber(raw.id_number);
  if (mrz.ok && mrz.doc_number) {
    out.id_number = mrz.doc_number;
    if (!mrz.doc_number_valid) warnings.push('Номерът от MRZ не мина проверката на контролната цифра — сверѝ го с картата.');
    if (claimed && claimed !== mrz.doc_number && looksLikeDocNumber(claimed, { bulgarian })) {
      warnings.push(`Номерът отпред (${claimed}) се различава от този в MRZ (${mrz.doc_number}) — сверѝ го.`);
    }
  } else if (looksLikeDocNumber(raw.id_number, { bulgarian })) {
    out.id_number = claimed;
  } else if (claimed) {
    // Класическата грешка: в номера е попаднала дата (валидност/издаване)
    if (isDateLike(raw.id_number)) {
      warnings.push('В полето за номер на документа беше разчетена дата — номерът е на лицевата страна долу дясно (9 цифри). Въведи го ръчно.');
      const d = normalizeDate(raw.id_number);
      if (!out.id_valid_until && d) out.id_valid_until = d;
    } else {
      warnings.push(`Номерът на документа не изглежда валиден (${claimed}) — провери го.`);
      out.id_number = claimed;
    }
  } else {
    warnings.push('Номерът на документа не беше разчетен — въведи го ръчно (лицева страна, долу дясно).');
  }
  // Номерът не може да съвпада с дата от документа
  if (out.id_number && [out.id_valid_until, out.id_issued_date, out.birth_date].some(d => d && cleanDocNumber(d) === out.id_number)) {
    warnings.push('Разчетеният номер съвпада с дата от документа — въведи номера ръчно.');
    out.id_number = '';
  }

  // 2) ЕГН — контролна сума; MRZ допълва/поправя
  if (mrz.ok && mrz.egn && mrz.egn !== out.egn) {
    if (!out.egn || !validateEgn(out.egn)) out.egn = mrz.egn;
    else warnings.push(`ЕГН отпред (${out.egn}) се различава от това в MRZ (${mrz.egn}) — сверѝ го.`);
  }
  if (out.egn && !validateEgn(out.egn)) warnings.push('ЕГН не минава проверката на контролната цифра — сверѝ го цифра по цифра.');

  // 3) Дати — MRZ допълва липсващите
  if (mrz.ok) {
    if (!out.birth_date && mrz.birth_date) out.birth_date = mrz.birth_date;
    if (!out.id_valid_until && mrz.expiry_date) out.id_valid_until = mrz.expiry_date;
  }
  if (out.id_issued_date && out.id_valid_until && out.id_issued_date > out.id_valid_until) {
    warnings.push('Датата на издаване е след валидността — разменени са.');
    [out.id_issued_date, out.id_valid_until] = [out.id_valid_until, out.id_issued_date];
  }
  if (!out.tenant_name) warnings.push('Името не беше разчетено.');

  return { data: out, warnings, mrz: mrz.ok ? { format: mrz.format, doc_number: mrz.doc_number } : null };
}

module.exports = { parseMrz, validateEgn, isDateLike, normalizeDate, cleanDocNumber, looksLikeDocNumber, normalizeIdCard, checkDigit };
