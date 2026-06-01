// UniCredit Bulbank PDF извлечение → транзакции.
// Връща същия формат като probankingPdfParser.parseProBankingPdf().
//
// Layout на един запис (UniCredit EUR account):
//   <дата_сделка DD.MM.YYYY>
//   <ref_alphanumeric><сума_eur DD.DD><сума_bgn DD.DD>       ← компактно слепнато
//   -<описание>                                              ← 1-3 реда
//   <дата_вальор DD.MM.YYYY>
//   /КТ                                                       ← или /ДТ
//    CT                                                       ← или DT (English mirror)
//
// Описанието има 4 типа:
//   1. SEPA wire (Кт): "-Получен превод SEPA в ЕИП ... / <IBAN> / <ИМЕ>\nОснование///<BIC>/..."
//   2. POS карта (Дт): "-Операция с карта Основание: ПОС X.YY EUR авт.код:NNN-<MERCHANT>/<CITY>/<CC>/PAN:..."
//   3. Импринтер (Дт): "-Операция с карта Основание: Плащане /импринтер/ X.YY EUR..."
//   4. Периодична такса (Дт): "-Периодична такса Основание: Такса за пакет ..."

const pdfParse = require('pdf-parse');

const DATE_LINE_RE   = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const KT_DT_LINE_RE  = /^\/(КТ|ДТ)$/;
// Ref + amounts compact: UniCredit ref-ът е винаги 16 alphanumeric chars,
// последвани от <EUR>.NN<BGN>.NN. Фиксиране на 16 елиминира greedy match-а
// където цифри от сумата биваха погълнати в ref.
const REF_AMOUNT_RE  = /^([A-Z0-9]{16})([\d,]+\.\d{2})([\d,]+\.\d{2})$/;
const IBAN_RE        = /\b(BG\d{2}[A-Z]{4}[A-Z0-9]{14,18})\b/;
const BIC_RE         = /\b([A-Z]{4}BG[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/;
// Account currency: header has "разплащателна сметка в EUR"
const ACCT_CURRENCY_RE = /разплащателна\s+сметка\s+в\s+([A-Z]{3})/i;
// Account IBAN: "IBAN:BG11UNCR70001520361576"
const ACCT_IBAN_RE     = /IBAN\s*:\s*(BG\d{2}[A-Z]{4}[A-Z0-9]{14,18})/;

// POS merchant: "авт.код:NNN-MERCHANT/" (optional space след колоната).
const POS_MERCHANT_RE = /авт\.код:\s*\d+-\s*([^/]+?)\s*\//i;

async function parseUniCreditPdf(buffer) {
  const data = await pdfParse(buffer);
  const lines = data.text.split(/\r?\n/).map(l => l.trim());
  const curM = data.text.match(ACCT_CURRENCY_RE);
  const accountCurrency = curM ? curM[1].toUpperCase() : 'EUR';
  const ibanM = data.text.match(ACCT_IBAN_RE);
  const accountIban = ibanM ? ibanM[1] : null;
  // Opening balance: "50.81 / 99.38   Начално салдо (EUR)/(BGN)"
  const openM = data.text.match(/([\d.,]+)\s*\/\s*([\d.,]+)\s+Начално\s*салдо/);
  let openingBalance = null;
  if (openM) {
    const eur = parseFloat(openM[1].replace(/,/g, ''));
    const bgn = parseFloat(openM[2].replace(/,/g, ''));
    openingBalance = accountCurrency === 'BGN' ? bgn : eur;
  }

  // Find the transactions section header to skip preamble.
  // After lines like "Дата/Вальор" the records start.
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Дата/Вальор') /* Дата/Вальор */) {
      startIdx = i + 1;
      break;
    }
  }

  // Group records: each block is between a date line and a /КТ|/ДТ line.
  const records = [];
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    const dateM = line.match(DATE_LINE_RE);
    if (!dateM) { i++; continue; }
    const date = `${dateM[3]}-${dateM[2]}-${dateM[1]}`;

    // Next line must be ref+amounts
    const refLine = lines[i+1] || '';
    const refM = refLine.match(REF_AMOUNT_RE);
    if (!refM) { i++; continue; }
    const [, ref, eurStr, bgnStr] = refM;
    const eur = parseFloat(eurStr.replace(/,/g, ''));
    const bgn = parseFloat(bgnStr.replace(/,/g, ''));

    // Collect description lines until next date or /КТ|/ДТ
    const body = [];
    let j = i + 2;
    let valueDate = null, op = null;
    while (j < lines.length) {
      const cur = lines[j];
      if (KT_DT_LINE_RE.test(cur)) { op = cur.match(KT_DT_LINE_RE)[1]; j++; break; }
      const dm = cur.match(DATE_LINE_RE);
      if (dm) {
        // This is the value date (last line before /КТ|/ДТ)
        valueDate = `${dm[3]}-${dm[2]}-${dm[1]}`;
        j++;
        continue;
      }
      // Skip empty + English mirror line
      if (!cur || /^(CT|DT)$/.test(cur)) { j++; continue; }
      body.push(cur);
      j++;
    }
    // Skip English mirror line that follows /КТ|/ДТ (e.g. " CT")
    if (j < lines.length && /^(CT|DT)$/.test(lines[j])) j++;

    if (!op) { i = j; continue; }

    records.push({ date, valueDate, ref, eur, bgn, body, op });
    i = j;
  }

  const transactions = [];
  for (const rec of records) {
    transactions.push(recordToTransaction(rec, accountCurrency));
  }
  let closingBalance = null;
  if (openingBalance !== null) {
    let kt = 0, dt = 0;
    for (const t of transactions) {
      if (t.operation === 'Кт') kt += Number(t.сума) || 0;
      else if (t.operation === 'Дт') dt += Number(t.сума) || 0;
    }
    closingBalance = Number((openingBalance + kt - dt).toFixed(2));
  }

  return { transactions, unknownTenants: [], accountCurrency, accountIban, openingBalance, closingBalance };
}

function recordToTransaction(rec, accountCurrency) {
  const { date, ref, eur, bgn, body, op } = rec;
  const fullBody = body.join(' ').replace(/\s+/g, ' ').trim();

  // IBAN / BIC (търсене и в joined text)
  const ibanM = fullBody.match(IBAN_RE);
  const bicM  = fullBody.match(BIC_RE);
  const iban  = ibanM ? ibanM[1] : '';
  const bic   = bicM  ? bicM[1]  : '';

  const lower = fullBody.toLowerCase();
  let контрагент = '';
  let основание  = fullBody;

  const isWire = iban || lower.includes('получен превод') || lower.includes('нареждане превод');
  const isCard = lower.includes('операция с карта');
  const isFee  = lower.includes('периодична такса') || lower.includes('месечна такса');

  if (isWire) {
    // SEPA / wire transfer:
    // Името на контрагента следва IBAN на същия body ред (line, не joined).
    // Основанието е на следващия line/lines.
    let nameIdx = -1;
    for (let k = 0; k < body.length; k++) {
      const iLine = body[k].match(/(BG\d{2}[A-Z]{4}[A-Z0-9]{14,18})\s*\/\s*(.+?)\s*\/?$/);
      if (iLine) {
        контрагент = iLine[2].trim();
        nameIdx = k;
        break;
      }
    }
    if (nameIdx >= 0 && nameIdx + 1 < body.length) {
      основание = body.slice(nameIdx + 1).join(' ')
        .replace(/\/{2,}/g, ' ')   // двойни/тройни слешове → space
        .replace(/^\s*\/|\/\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      // fallback: махни начален "-" + IBAN/BIC clutter
      основание = fullBody.replace(/^-/, '').trim();
    }
  } else if (isCard) {
    // POS / Card: merchant after auth code.
    const merchM = fullBody.match(POS_MERCHANT_RE);
    if (merchM) контрагент = merchM[1].replace(/\*+/g, '').trim();
    основание = fullBody.replace(/^-?Операция с карта Основание:\s*/i, '').trim();
  } else if (isFee) {
    // Не слагай "UniCredit" в контрагент за да не trigger-не loan keyword.
    контрагент = 'Банкова такса';
    основание = fullBody.replace(/^-?Периодична такса Основание:\s*/i, '').trim();
  }

  const сума = accountCurrency === 'BGN' ? bgn : eur;
  const operation = op === 'КТ' ? 'Кт' : 'Дт';
  const месец = date.slice(0, 7);

  return {
    дата: date,
    контрагент,
    контрагент_iban: iban,
    контрагент_bic:  bic,
    основание: основание.slice(0, 500),
    сума,
    operation,
    месец,
    currency: accountCurrency,
    _ref: ref,
    _amount_eur: eur,
    _amount_bgn: bgn,
  };
}

module.exports = { parseUniCreditPdf };
