// ProBanking (ProCredit Bank) PDF извлечение → транзакции.
// Парсва текстовия dump от pdf-parse и връща същата структура като
// XLSX парсера в routes/import.js → parseBuffer():
//
//   { transactions, unknownTenants, accountCurrency }
//
// Поддържани layout-и за един запис:
//
// 1. Компактен 1-line (банкови такси, лихви, главници):
//    `7180754112026-01-05МЕСЕЧНА ТАКСА РС5.119.99ДТ`
//    ref + дата + основание + сума_eur + сума_bgn + ОП
//
// 2. POS multi-line:
//    `7334275742026-01-1126:52 Курс:1.000000Транзакции с Карти.`
//    `ПОС плащане 77.60 EUR F0584817 BORO`
//    `SPORT AD SAMOKOV 4260***6423 11.01.`
//    `2026 13:26:52 Курс:1.000000`
//    `77.60151.77ДТ`
//
// 3. Wire transfer multi-line (с IBAN):
//    `7193213482026-01-04VERA ALEKSANDROVA VELICHKOVA-GERGOV`
//    `СМЕТКА: BG13FINV91501017169343`
//    `BIC: FINVBGSFXXX КУРС: 1.000000`
//    `НАЕМ 01.2026`
//    `НАЕМ 01.2026`
//    `282.00551.54КТ`

const pdfParse = require('pdf-parse');

// Reф + дата (YYYY-MM-DD). reф = 9-11 цифри.
const RECORD_START_RE = /^(\d{9,11})(\d{4}-\d{2}-\d{2})(.*)$/;
// Сума_eur + сума_bgn + ОП в края на ред. СТРОГ thousand sep:
// `\d{1,3}(?: \d{3})*\.\d{2}` — иначе цифри от датата (напр. "22.03.24")
// се сливаха с амоунта (24587.31 вместо 587.31).
const AMOUNT_END_RE   = /^(\d{1,3}(?: \d{3})*\.\d{2})(\d{1,3}(?: \d{3})*\.\d{2})(ДТ|КТ)$/;
// Шум който се отрязва между записи (page separators).
const NOISE_RE        = /^(-{20,}|Стр:\s*\d+|\s*)$/;
// Линии които НЕ са основание (вътре в record body).
const SKIP_BODY_RE    = /^(СМЕТКА:|BIC:|КУРС:|Транзакции с Карти|---)/i;
// IBAN/BIC извличане
const IBAN_RE         = /СМЕТКА:\s*([A-Z]{2}\d{2}[A-Z]{4}[A-Z0-9]{14,20})/;
const BIC_RE          = /BIC:\s*([A-Z]{8,11})(?:XXX)?/;
// POS pattern: `ПОС плащане 77.60 EUR <ref> <MERCHANT continues...>`
// Merchant-ът може да продължи на следващи редове до `4260***NNNN` (картата) или дата.
const POS_LINE_RE     = /ПОС\s+плащане\s+\d+(?:[.,]\d+)?\s+[A-Z]{3}\s+\S+\s+(.+)/i;
// Account currency от header-а: "Валута/Currency     EUR"
const ACCT_CURRENCY_RE = /Валута\/Currency\s+([A-Z]{3})/;
// Account IBAN: "IBAN: BG34PRCB92301040957901"
const ACCT_IBAN_RE     = /IBAN:\s*(BG\d{2}[A-Z]{4}[A-Z0-9]{14,18})/;

/**
 * @param {Buffer} buffer PDF buffer
 * @returns {Promise<{transactions: Array, unknownTenants: Array, accountCurrency: string}>}
 */
async function parseProBankingPdf(buffer) {
  const data = await pdfParse(buffer);
  const rawLines = data.text.split(/\r?\n/);

  // Account currency + IBAN from header
  const curMatch = data.text.match(ACCT_CURRENCY_RE);
  const accountCurrency = curMatch ? curMatch[1] : 'EUR';
  const ibanMatch = data.text.match(ACCT_IBAN_RE);
  const accountIban = ibanMatch ? ibanMatch[1] : null;
  // Opening balance: "Начално САЛДО/Balance Forwarded36 229.8370 859.39КТ"
  const openMatch = data.text.match(/Начално\s*САЛДО[^\d]*([\d ]+\.\d{2})([\d ]+\.\d{2})(КТ|ДТ)/);
  let openingBalance = null;
  if (openMatch) {
    const eur = parseFloat(openMatch[1].replace(/\s/g, ''));
    const bgn = parseFloat(openMatch[2].replace(/\s/g, ''));
    const sign = openMatch[3] === 'КТ' ? 1 : -1;
    openingBalance = (accountCurrency === 'BGN' ? bgn : eur) * sign;
  }

  // Walk lines, group into records
  const records = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const startMatch = line.match(RECORD_START_RE);
    if (!startMatch) { i++; continue; }

    const [, ref, date, rest] = startMatch;

    // Case 1: single-line compact — first line itself ends with amount+ОП
    const inlineEnd = matchAmountAnywhere(rest);
    if (inlineEnd && inlineEnd.endsAtLineEnd) {
      records.push({
        ref, date,
        firstLineRest: rest.slice(0, inlineEnd.index).trim(),
        body: [],
        amount_eur: inlineEnd.eur,
        amount_bgn: inlineEnd.bgn,
        op: inlineEnd.op,
      });
      i++;
      continue;
    }

    // Case 2/3: multi-line — collect body until amount-end line OR next record start
    const body = [];
    let j = i + 1;
    let endInfo = null;
    while (j < rawLines.length) {
      const cur = rawLines[j];
      // Skip page separators and blank lines
      if (NOISE_RE.test(cur)) { j++; continue; }
      // Stop at next record start
      if (RECORD_START_RE.test(cur)) break;
      // Check if current line is amount-end
      const amt = cur.match(AMOUNT_END_RE);
      if (amt) {
        endInfo = { eur: parseAmount(amt[1]), bgn: parseAmount(amt[2]), op: amt[3] };
        j++;
        break;
      }
      body.push(cur);
      j++;
    }

    if (endInfo) {
      records.push({
        ref, date,
        firstLineRest: rest.trim(),
        body,
        amount_eur: endInfo.eur,
        amount_bgn: endInfo.bgn,
        op: endInfo.op,
      });
    }
    i = j;
  }

  // Convert records → transactions
  const transactions = [];
  const unknownTenants = [];
  for (const rec of records) {
    const tx = recordToTransaction(rec, accountCurrency);
    if (tx) transactions.push(tx);
  }

  // Closing balance: extract directly from "КРАЙНО САЛДО" line (по-точно).
  // Pattern: "КРАЙНО САЛДО28 148.4955 053.66КТ"
  // Fallback: compute = opening + sum(Кт) - sum(Дт).
  let closingBalance = null;
  const closeRegex = /КРАЙНО\s*САЛДО([\d ]+\.\d{2})([\d ]+\.\d{2})(КТ|ДТ)/g;
  let m, firstNonZero = null;
  while ((m = closeRegex.exec(data.text)) !== null) {
    const eur = parseFloat(m[1].replace(/\s/g, ''));
    const bgn = parseFloat(m[2].replace(/\s/g, ''));
    const sign = m[3] === 'КТ' ? 1 : -1;
    if (eur > 0 || bgn > 0) {
      firstNonZero = { eur, bgn, sign };
      break;
    }
  }
  if (firstNonZero) {
    closingBalance = (accountCurrency === 'BGN' ? firstNonZero.bgn : firstNonZero.eur) * firstNonZero.sign;
  } else if (openingBalance !== null) {
    let kt = 0, dt = 0;
    for (const t of transactions) {
      if (t.operation === 'Кт') kt += Number(t.сума) || 0;
      else if (t.operation === 'Дт') dt += Number(t.сума) || 0;
    }
    closingBalance = Number((openingBalance + kt - dt).toFixed(2));
  }

  return { transactions, unknownTenants, accountCurrency, accountIban, openingBalance, closingBalance };
}

// Search for an amount+op pattern anywhere in a string. Returns null or
// { index, eur, bgn, op, endsAtLineEnd }.
function matchAmountAnywhere(str) {
  if (!str) return null;
  // СТРОГА thousand separator format за да избегнем year-merge bug:
  // "/22.03.24587.31" → не трябва да match-не "24587.31" а "587.31".
  const re = /(\d{1,3}(?: \d{3})*\.\d{2})(\d{1,3}(?: \d{3})*\.\d{2})(ДТ|КТ)/g;
  let m, last = null;
  while ((m = re.exec(str)) !== null) {
    last = m;
  }
  if (!last) return null;
  return {
    index: last.index,
    eur: parseAmount(last[1]),
    bgn: parseAmount(last[2]),
    op: last[3],
    endsAtLineEnd: last.index + last[0].length === str.length,
  };
}

function parseAmount(s) {
  return Number(String(s).replace(/\s/g, ''));
}

// Convert a parsed record → transaction object compatible with /save endpoint.
function recordToTransaction(rec, accountCurrency) {
  const { date, firstLineRest, body, amount_eur, amount_bgn, op } = rec;

  // Joined body for searches
  const fullBody = [firstLineRest, ...body].join(' ');

  // IBAN + BIC
  const ibanM = fullBody.match(IBAN_RE);
  const bicM  = fullBody.match(BIC_RE);
  const iban  = ibanM ? ibanM[1] : '';
  const bic   = bicM  ? bicM[1] + (fullBody.includes(bicM[1] + 'XXX') ? 'XXX' : '') : '';

  // POS detection
  const isPosFlag = /Транзакции с Карти|ПОС\s+плащане/i.test(fullBody);
  let контрагент = '';
  let основание  = '';

  if (isPosFlag) {
    // Extract merchant: ПОС плащане X EUR <ref> <merchant...> 4260***NNNN
    const merchantM = fullBody.match(/ПОС\s+плащане\s+\d+(?:[.,]\d+)?\s+[A-Z]{3}\s+\S+\s+(.+?)\s+4260\*+\d+/i);
    if (merchantM) {
      контрагент = merchantM[1].replace(/\s+/g, ' ').trim();
    }
    // Основание = цялото "ПОС плащане ..." → краят
    const posStart = fullBody.search(/ПОС\s+плащане/i);
    if (posStart >= 0) {
      основание = fullBody.slice(posStart).replace(/\s+/g, ' ').trim();
    } else {
      основание = fullBody.replace(/\s+/g, ' ').trim();
    }
  } else if (iban) {
    // Wire transfer with counterparty — first-line-rest is contractor name
    контрагент = firstLineRest.trim();
    // Основание: body lines които не са СМЕТКА/BIC/КУРС
    const reasonLines = body.filter(l => !SKIP_BODY_RE.test(l)).map(l => l.trim());
    // Често основанието е дублирано (BG + EN/same). Премахни дубликати.
    const uniq = [...new Set(reasonLines)].filter(Boolean);
    основание = uniq.join(' ').replace(/\s+/g, ' ').trim();
  } else {
    // Bank fee / interest / principal repayment — first-line-rest е основанието
    основание = firstLineRest.trim();
    // Опитай да извлечеш контрагент: за loans банката е "ProCredit"
    // Засега оставяме празно — категоризацията в import.js ще го хване по keyword.
  }

  // Сума в account currency. Сметката е EUR → използваме amount_eur.
  // Ако сметката е BGN (pre-2026), използваме amount_bgn. PDF-ите за BGN
  // могат да имат различен column order — за момента приемаме EUR.
  const сума = accountCurrency === 'BGN' ? amount_bgn : amount_eur;
  const currency = accountCurrency;
  const месец = date.slice(0, 7);

  // Operation
  const operation = op === 'КТ' ? 'Кт' : 'Дт';

  return {
    дата:              date,
    контрагент:        контрагент,
    контрагент_iban:   iban,
    контрагент_bic:    bic,
    основание:         основание,
    сума:              сума,
    operation:         operation,
    месец:             месец,
    currency:          currency,
    _ref:              rec.ref,             // за debugging — не се записва
    _amount_eur:       amount_eur,
    _amount_bgn:       amount_bgn,
  };
}

module.exports = { parseProBankingPdf };
