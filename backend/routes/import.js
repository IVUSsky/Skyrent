const express = require('express');
const { orgContext } = require('../db/db');
const multer = require('multer');
const XLSX = require('xlsx');

module.exports = function(db) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage() });

  // Дедупликацията сравнява в евро-еквивалент, за да хваща едно и също
  // плащане независимо дали е заведено в BGN или EUR (BG→EUR преходът
  // прави едни и същи преводи да идват в различна валута между извлеченията).
  const DEDUP_RATE = 1.95583;
  const toEur = (amt, cur) =>
    (String(cur || 'BGN').toUpperCase() === 'BGN' ? Number(amt || 0) / DEDUP_RATE : Number(amt || 0));
  const DEDUP_SQL =
    `SELECT id FROM transactions
       WHERE дата=? AND operation=? AND контрагент=?
         AND ABS((CASE WHEN UPPER(COALESCE(currency,'BGN'))='BGN'
                       THEN сума/${DEDUP_RATE} ELSE сума END) - ?) < 0.05`;
  const isDup = (stmt, tx) =>
    !!(tx.дата && stmt.get(tx.дата, tx.operation || '', tx.контрагент || '', toEur(tx.сума, tx.currency)));

  // ── Helper: load rules from DB ─────────────────────────────
  function loadRules() {
    try { return db.prepare('SELECT * FROM tx_rules ORDER BY id ASC').all(); }
    catch { return []; }
  }

  // ── Helper: extract merchant name from POS description ───────
  function parsePosName(основание) {
    const text = основание.replace(/\|/g, ' ').replace(/\s+/g, ' ');
    const m = text.match(/ПОС [Пп]лащане [\d,.]+ [A-Z]{3} (?:[A-Z0-9]{8} )?(.+)/i);
    if (!m) return null;
    let name = m[1].replace(/\s+(Sofia|Sofiya|GR\.|CC\s|\d{4,}|Курс|\*{3}).*$/i, '').trim();
    return name || null;
  }

  // ── Helper: categorize one row ─────────────────────────────
  // Returns { категория, property_id, scope }.
  // scope: 'personal' за заплата/договор управление/домакински разходи; иначе
  // ползва defaultScope (от account_scope_map за тази сметка).
  function categorizeRow({ operation, контрагент, основание, property_id_from_map, defaultScope = 'business' }) {
    const kontLower = контрагент.toLowerCase();
    const osnLower  = основание.toLowerCase();
    let категория  = '';
    let property_id = property_id_from_map;
    let scope = defaultScope;

    const isDeposit = ['депозит','deposit','гаранция','garantion'].some(kw => kontLower.includes(kw) || osnLower.includes(kw));
    // Personal income keywords (Кт): заплата(и), договор за управление, ДУ, salary
    const isSalary  = ['заплата','заплати','salary','net salary','net pay'].some(kw => kontLower.includes(kw) || osnLower.includes(kw));
    const isMgmtFee = ['договор за управление','договор управление','управителски','дог. упр.','ду възнагр'].some(kw => osnLower.includes(kw) || kontLower.includes(kw));
    // Sky Capital — приходи от собствените имоти / прехвърления от Sky фирмата
    const isSkyCap  = ['sky capital','skycapital','sky кап','скай капитал','скай кап','skayrent','skyrent','sky-rent'].some(kw => kontLower.includes(kw) || osnLower.includes(kw));
    // Bulgar Capital — дивиденти на дялов фонд (от BG17FINV915010E0396846 или контрагент "БОЛГАР КАПИТАЛ")
    const isBulgar  = ['болгар капитал','bulgar capital','bg17finv915010e0396846','болгар кап','bulgar кап'].some(kw => kontLower.includes(kw) || osnLower.includes(kw));
    // Инвестиции (Дт): Trading 212, brokers, crypto exchanges → category='инвестиция'
    const isInvest  = ['trading 212','trading212','t212','revolut invest','binance','coinbase','kraken','interactive brokers','etoro','xtb','degiro'].some(kw => kontLower.includes(kw) || osnLower.includes(kw));
    // Personal expense keywords (Дт): супермаркети, аптеки, горива, ресторанти и т.н.
    const HOUSEHOLD_KW = [
      'kaufland','lidl','billa','fantastico','t-market','metro','praktis','praktiker','ikea','jumbo',
      'shell','omv','lukoil','eko ','rompetrol',
      'restorant','restaurant','mcdonalds','kfc','starbucks',
      'apteka','аптека','pharmacy',
      'h&m','zara','decathlon',
      'netflix','spotify','apple.com/bill','google',
    ];
    const isHousehold = operation === 'Дт' && HOUSEHOLD_KW.some(kw => kontLower.includes(kw) || osnLower.includes(kw));

    if (operation === 'Кт') {
      if (isDeposit) {
        категория = 'депозит_получен';
      } else if (isSalary) {
        категория = 'заплата';
        scope = 'personal';
      } else if (isMgmtFee) {
        категория = 'управление';
        scope = 'personal';
      } else if (isSkyCap) {
        категория = 'sky_capital';
        scope = 'personal';
      } else if (isBulgar) {
        категория = 'лихва_болгар';
        scope = 'personal';
      } else {
        const hasRentKw = ['наем','rent'].some(kw => osnLower.includes(kw) || kontLower.includes(kw));
        if (hasRentKw || property_id !== null) {
          категория = 'наем';
        } else if (kontLower.includes('иво лазаров') || osnLower.includes('заем')) {
          категория = 'equity_inject';
        } else if (osnLower.includes('нап') || osnLower.includes('ддс')) {
          категория = 'нап_ддс';
        } else {
          категория = 'приход_друг';
        }
      }
    } else if (operation === 'Дт') {
      if (isDeposit) {
        категория = 'депозит_върнат';
      } else if (isInvest) {
        категория = 'инвестиция';
        // scope остава defaultScope — инвестиция е capital flow, не personal expense
      } else if (isSkyCap) {
        категория = 'заем_sky';
        scope = 'personal';
      } else if (isHousehold) {
        категория = 'друго_лично';
        scope = 'personal';
      } else {
        const isLoan    = ['прокредит','unicredit','уникредит','пощенска','вноска','кредит','погасяване','погасяване главница','погасяване лихва'].some(kw => kontLower.includes(kw) || osnLower.includes(kw));
        const isExpense = ['такса','застраховка','счетоводство','поддръжка','нотариус'].some(kw => kontLower.includes(kw) || osnLower.includes(kw));
        if (isLoan)         категория = 'вноска';
        else if (isExpense) категория = 'разход';
        else                категория = 'разход_друг';
      }
    } else {
      категория = 'друго';
    }

    return { категория, property_id, scope };
  }

  // ── Helper: enrich a raw transaction (categorize, apply rules, set currency, etc.)
  // rawTx must have: дата, контрагент, контрагент_iban, контрагент_bic,
  //                  основание, сума, operation
  // ctx: { tenantMap, rules, unknownSet, unknownTenants, defaultScope }
  // Returns full transaction or null to skip.
  function enrichTransaction(rawTx, ctx) {
    const { tenantMap, rules, unknownSet, unknownTenants, defaultScope = 'business' } = ctx;
    let { дата, контрагент, контрагент_iban = '', контрагент_bic = '',
          основание = '', сума = 0, operation = '' } = rawTx;
    if (!дата) return null;

    // POS merchant fallback if no counterparty given
    if (!контрагент && operation === 'Дт') {
      контрагент = parsePosName(основание) || '';
    }

    const kontLower = (контрагент || '').toLowerCase();
    const osnLower  = (основание  || '').toLowerCase();

    // Tenant map lookup
    let property_id_from_map = null;
    for (const [key, pid] of Object.entries(tenantMap)) {
      if (kontLower.includes(key) || osnLower.includes(key)) {
        property_id_from_map = pid;
        break;
      }
    }

    let { категория, property_id, scope } = categorizeRow({ operation, контрагент, основание, property_id_from_map, defaultScope });

    if (категория === 'наем' && !property_id_from_map && контрагент && !unknownSet.has(контрагент)) {
      unknownSet.add(контрагент);
      unknownTenants.push({ контрагент, основание });
    }

    let rule_id = null, validated = 1;
    for (const rule of rules) {
      const pat = rule.pattern.toLowerCase();
      if (kontLower.includes(pat) || osnLower.includes(pat)) {
        категория = rule.категория;
        if (rule.property_id) property_id = rule.property_id;
        if (rule.scope) scope = rule.scope;
        rule_id = rule.id;
        validated = 0;
        break;
      }
    }

    // Валутата идва от банковата колона (rawTx.currency) — по време на прехода
    // 2026 плащанията са СМЕСЕНИ (някои в лева, някои в евро) и колоната е вярна.
    // Fallback само ако липсва: 2026+ дати → EUR, иначе BGN.
    const currency = rawTx.currency || (дата >= '2026-01-01' ? 'EUR' : 'BGN');
    const месец    = rawTx.месец || дата.slice(0, 7);

    return {
      дата, контрагент, контрагент_iban, контрагент_bic, основание,
      сума, operation, категория, property_id, месец, rule_id, validated, currency, scope,
    };
  }

  // ── Helper: parse one XLSX buffer ─────────────────────────
  function parseBuffer(buffer, tenantMap, rules, defaultScope = 'business') {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Find header row + опитай да извлечеш IBAN от header (преди header row)
    let headerRowIdx = -1;
    let accountIban  = null;
    const IBAN_RE = /(BG\d{2}[A-Z]{4}[A-Z0-9]{14,18})/;
    for (let i = 0; i < Math.min(20, rawRows.length); i++) {
      const rowText = rawRows[i].map(c => String(c || '')).join(' ');
      if (!accountIban) {
        const m = rowText.toUpperCase().replace(/\s+/g, '').match(IBAN_RE);
        if (m) accountIban = m[1];
      }
      if (rawRows[i].some(cell => String(cell).includes('Дата и час'))) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx === -1) throw new Error('Could not find header row with "Дата и час"');

    const transactions   = [];
    const unknownTenants = [];
    const unknownSet     = new Set();
    const ctx = { tenantMap, rules, unknownSet, unknownTenants, defaultScope };

    for (const row of rawRows.slice(headerRowIdx + 1)) {
      if (!row[0] && !row[4]) continue;
      const dateRaw = String(row[0] || '').trim();
      if (!dateRaw) continue;

      let дата = '';
      const dm = dateRaw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (dm) {
        дата = `${dm[3]}-${dm[2]}-${dm[1]}`;
      } else {
        try {
          const d = new Date(dateRaw);
          if (!isNaN(d)) дата = d.toISOString().slice(0, 10);
        } catch {}
      }
      if (!дата) continue;

      const суmaRaw = row[4];
      const сума = typeof суmaRaw === 'number'
        ? суmaRaw
        : parseFloat(String(суmaRaw || '').replace(/\s/g, '').replace(',', '.')) || 0;

      const tx = enrichTransaction({
        дата,
        контрагент:      String(row[10] || '').trim(),
        контрагент_iban: String(row[11] || '').replace(/\s/g,'').toUpperCase(),
        контрагент_bic:  String(row[9]  || '').trim().toUpperCase(),
        основание:       String(row[12] || '').trim(),
        сума,
        operation:       String(row[7]  || '').trim(),
      }, ctx);
      if (tx) transactions.push(tx);
    }

    return { transactions, unknownTenants, accountIban };
  }

  // ── Helper: detect bank от съдържание на PDF (sniff first 4KB на текста).
  // Връща 'probanking' | 'unicredit' | null.
  async function detectPdfBank(buffer) {
    const pdfParse = require('pdf-parse');
    try {
      // pdf-parse приема max option — но е по-просто да направим pre-parse и
      // да гледаме първите няколко KB. Само за detection.
      const d = await pdfParse(buffer);
      const head = d.text.slice(0, 4000);
      if (/PRCBBGSF|ПРОКРЕДИТ\s+БАНК/i.test(head)) return 'probanking';
      if (/UNCRBGSF|UniCredit\s+Bulbank|УниКредит\s+Булбанк/i.test(head)) return 'unicredit';
      return null;
    } catch {
      return null;
    }
  }

  // ── Helper: parse PDF (auto-detect bank). По default → ProBanking
  // за обратна съвместимост.
  async function parsePdfBuffer(buffer, tenantMap, rules, defaultScope = 'business') {
    const bank = await detectPdfBank(buffer);
    let rawTx, accountIban = null, openingBalance = null, closingBalance = null, accountCurrency = null;
    if (bank === 'unicredit') {
      const { parseUniCreditPdf } = require('../lib/unicreditPdfParser');
      const r = await parseUniCreditPdf(buffer);
      rawTx = r.transactions; accountIban = r.accountIban;
      openingBalance = r.openingBalance; closingBalance = r.closingBalance;
      accountCurrency = r.accountCurrency;
    } else {
      const { parseProBankingPdf } = require('../lib/probankingPdfParser');
      const r = await parseProBankingPdf(buffer);
      rawTx = r.transactions; accountIban = r.accountIban;
      openingBalance = r.openingBalance; closingBalance = r.closingBalance;
      accountCurrency = r.accountCurrency;
    }

    const transactions   = [];
    const unknownTenants = [];
    const unknownSet     = new Set();
    const ctx = { tenantMap, rules, unknownSet, unknownTenants, defaultScope };
    for (const r of rawTx) {
      const tx = enrichTransaction(r, ctx);
      if (tx) transactions.push(tx);
    }
    return { transactions, unknownTenants, accountIban, openingBalance, closingBalance, accountCurrency };
  }

  // Чете account_scope_map от settings.
  function loadAccountScopeMap() {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key='account_scope_map'").get();
      if (!row) return {};
      const obj = JSON.parse(row.value);
      // Normalize IBAN keys to uppercase
      return Object.fromEntries(Object.entries(obj).map(([k, v]) => [String(k).toUpperCase(), v]));
    } catch { return {}; }
  }

  // Dispatch by file extension/mime. Подава defaultScope от account_scope_map.
  async function parseFile(file, tenantMap, rules) {
    const scopeMap = loadAccountScopeMap();
    const name = (file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    const isPdf = name.endsWith('.pdf') || mime === 'application/pdf';

    // Първи pass — за да хванем accountIban, ползваме default scope='business'.
    // Не е big deal — keywords (заплата, household) винаги override-ват на personal.
    let result;
    if (isPdf) result = await parsePdfBuffer(file.buffer, tenantMap, rules, 'business');
    else       result = parseBuffer(file.buffer, tenantMap, rules, 'business');

    const iban = result.accountIban;
    const accountScope = iban && scopeMap[iban.toUpperCase()] ? scopeMap[iban.toUpperCase()] : null;

    // Втори pass само ако account scope е personal — пре-парсваме с този default.
    if (accountScope === 'personal') {
      const previous = { openingBalance: result.openingBalance, closingBalance: result.closingBalance, accountCurrency: result.accountCurrency };
      if (isPdf) result = await parsePdfBuffer(file.buffer, tenantMap, rules, 'personal');
      else       result = parseBuffer(file.buffer, tenantMap, rules, 'personal');
      result.openingBalance ??= previous.openingBalance;
      result.closingBalance ??= previous.closingBalance;
      result.accountCurrency ??= previous.accountCurrency;
    }
    result.accountIban = iban;
    result.accountScope = accountScope || 'business';
    result.accountKnown = !!accountScope;
    return result;
  }

  // ── POST /parse (single file: xlsx или pdf) ────────────────
  router.post('/parse', upload.single('file'), orgContext, async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const tenantMapRow = db.prepare("SELECT value FROM settings WHERE key='tenant_map'").get();
      let tenantMap = {};
      if (tenantMapRow) { try { tenantMap = JSON.parse(tenantMapRow.value); } catch {} }
      const normMap = Object.fromEntries(Object.entries(tenantMap).map(([k,v]) => [k.toLowerCase(), v]));

      const rules = loadRules();
      const parsed = await parseFile(req.file, normMap, rules);
      let { transactions, unknownTenants, accountIban, accountScope, accountKnown,
            openingBalance, closingBalance, accountCurrency } = parsed;
      const dupCheck = db.prepare(DEDUP_SQL);
      transactions = transactions.map(tx => ({
        ...tx,
        is_duplicate: isDup(dupCheck, tx)
      }));
      const dupCount = transactions.filter(t => t.is_duplicate).length;
      res.json({ transactions, unknownTenants, dupCount,
                 account: { iban: accountIban, scope: accountScope, known: accountKnown,
                            openingBalance, closingBalance, currency: accountCurrency } });
    } catch (err) {
      console.error('Parse error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /parse-multi (xlsx + pdf смесено) ─────────────────
  router.post('/parse-multi', upload.array('files', 24), orgContext, async (req, res) => {
    try {
      if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });

      const tenantMapRow = db.prepare("SELECT value FROM settings WHERE key='tenant_map'").get();
      let tenantMap = {};
      if (tenantMapRow) { try { tenantMap = JSON.parse(tenantMapRow.value); } catch {} }
      const normMap = Object.fromEntries(Object.entries(tenantMap).map(([k,v]) => [k.toLowerCase(), v]));
      const rules   = loadRules();

      let allTx       = [];
      let allUnknown  = [];
      const errors    = [];
      const accounts  = []; // { iban, scope, known }

      for (const file of req.files) {
        try {
          const { transactions, unknownTenants, accountIban, accountScope, accountKnown,
                  openingBalance, closingBalance, accountCurrency } = await parseFile(file, normMap, rules);
          allTx      = allTx.concat(transactions);
          allUnknown = allUnknown.concat(unknownTenants.filter(u => !allUnknown.some(x => x.контрагент === u.контрагент)));
          if (accountIban && !accounts.some(a => a.iban === accountIban)) {
            accounts.push({ iban: accountIban, scope: accountScope, known: accountKnown,
                            openingBalance, closingBalance, currency: accountCurrency });
          }
        } catch(e) {
          errors.push(`${file.originalname}: ${e.message}`);
        }
      }

      allTx.sort((a, b) => (a.дата || '').localeCompare(b.дата || ''));

      const dupCheck = db.prepare(DEDUP_SQL);
      allTx = allTx.map(tx => ({
        ...tx,
        is_duplicate: isDup(dupCheck, tx)
      }));

      const dupCount = allTx.filter(t => t.is_duplicate).length;
      res.json({ transactions: allTx, unknownTenants: allUnknown, errors, dupCount, accounts });
    } catch (err) {
      console.error('Parse-multi error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /save ─────────────────────────────────────────────
  router.post('/save', (req, res) => {
    try {
      const { filename, transactions, account } = req.body;
      if (!transactions || !Array.isArray(transactions)) {
        return res.status(400).json({ error: 'transactions array required' });
      }

      const months     = transactions.map(t => t.месец).filter(Boolean).sort();
      const month_from = months[0] || null;
      const month_to   = months[months.length - 1] || null;

      const insertSession = db.prepare(`
        INSERT INTO import_sessions (filename, tx_count, month_from, month_to, account_iban, account_scope, opening_balance, closing_balance, account_currency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertTx = db.prepare(`
        INSERT INTO transactions (session_id, дата, контрагент, основание, сума, operation, категория, property_id, месец, validated, rule_id, currency, scope)
        VALUES (@session_id, @дата, @контрагент, @основание, @сума, @operation, @категория, @property_id, @месец, @validated, @rule_id, @currency, @scope)
      `);

      // Check for duplicate (валутно-осъзнато — виж DEDUP_SQL горе)
      const dupCheck = db.prepare(DEDUP_SQL);

      const upsertCP = db.prepare(`
        INSERT INTO counterparties (name, iban, bic, currency)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET iban=excluded.iban, bic=excluded.bic, currency=excluded.currency
      `);

      const insertExpense = db.prepare(`
        INSERT OR IGNORE INTO expense_invoices
          (filename, status, supplier_name, amount, currency, reason, property_id, expense_category, месец, payment_type, bank_tx_id, paid, paid_date, scope)
        VALUES (?, 'done', ?, ?, ?, ?, ?, ?, ?, 'банков_импорт', ?, 1, ?, ?)
      `);

      const insertPersonalIncome = db.prepare(`
        INSERT INTO personal_income (дата, тип, сума, валута, източник, бележка, bank_tx_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      // Find existing unpaid invoice matching this bank payment (amount + currency + date within 60 days)
      const findMatchingInvoice = db.prepare(`
        SELECT id FROM expense_invoices
        WHERE ROUND(amount, 2) = ROUND(?, 2)
          AND currency = ?
          AND payment_type != 'банков_импорт'
          AND (paid = 0 OR paid IS NULL)
          AND bank_tx_id IS NULL
          AND ABS(julianday(?) - julianday(COALESCE(invoice_date, paid_date, месец || '-01'))) <= 60
        ORDER BY ABS(julianday(?) - julianday(COALESCE(invoice_date, paid_date, месец || '-01')))
        LIMIT 1
      `);
      const linkInvoice = db.prepare(`
        UPDATE expense_invoices SET paid=1, paid_date=?, bank_tx_id=?, payment_type='банков_импорт' WHERE id=?
      `);

      let saved = 0, skipped = 0;

      const doImport = db.transaction(() => {
        const sessionResult = insertSession.run(
          filename || 'upload.xlsx', transactions.length, month_from, month_to,
          account?.iban || null, account?.scope || null,
          account?.openingBalance != null ? Number(account.openingBalance) : null,
          account?.closingBalance != null ? Number(account.closingBalance) : null,
          account?.currency || null
        );
        const session_id    = sessionResult.lastInsertRowid;

        for (const tx of transactions) {
          // Deduplication check
          if (isDup(dupCheck, tx)) {
            skipped++;
            continue;
          }

          const txScope = tx.scope || 'business';
          const txResult = insertTx.run({
            session_id,
            дата:       tx.дата       || null,
            контрагент: tx.контрагент || '',
            основание:  tx.основание  || '',
            сума:       tx.сума       || 0,
            operation:  tx.operation  || '',
            категория:  tx.категория  || '',
            property_id: tx.property_id || null,
            месец:      tx.месец      || null,
            validated:  tx.validated  != null ? tx.validated : 1,
            rule_id:    tx.rule_id    || null,
            currency:   tx.currency   || (tx.дата >= '2026-01-01' ? 'EUR' : 'BGN'),
            scope:      txScope,
          });
          saved++;

          // Auto-upsert counterparty for all Дт transactions with a name
          if (tx.operation === 'Дт' && tx.контрагент) {
            upsertCP.run(
              tx.контрагент.trim(),
              tx.контрагент_iban || '',
              tx.контрагент_bic  || '',
              tx.currency || 'EUR'
            );
          }

          // Кт personal income (заплата / договор управление / личен наем /
          // Sky Capital) → personal_income row.
          if (tx.operation === 'Кт' && txScope === 'personal') {
            let pincomeType = null;
            if (tx.категория === 'заплата')         pincomeType = 'заплата';
            else if (tx.категория === 'управление') pincomeType = 'управление';
            else if (tx.категория === 'sky_capital') pincomeType = 'sky_capital';
            else if (tx.категория === 'лихва_болгар') pincomeType = 'лихва_болгар';
            else if (tx.категория === 'наем')       pincomeType = 'друго'; // личен наем
            if (pincomeType) {
              insertPersonalIncome.run(
                tx.дата || null,
                pincomeType,
                tx.сума || 0,
                tx.currency || (tx.дата >= '2026-01-01' ? 'EUR' : 'BGN'),
                tx.контрагент || (pincomeType === 'друго' ? 'Личен наем' : ''),
                tx.основание || '',
                txResult.lastInsertRowid
              );
            }
          }

          // Дт разходи → link to existing invoice or create new expense record
          // Business: категория='разход'/'разход_друг'. Personal: scope='personal'.
          if (tx.operation === 'Дт' && (tx.категория === 'разход' || tx.категория === 'разход_друг' || txScope === 'personal')) {
            const currency = tx.currency || (tx.дата >= '2026-01-01' ? 'EUR' : 'BGN');
            const matched = txScope === 'business'
              ? findMatchingInvoice.get(tx.сума || 0, currency, tx.дата, tx.дата)
              : null;
            if (matched) {
              linkInvoice.run(tx.дата || null, txResult.lastInsertRowid, matched.id);
            } else {
              const expCat = txScope === 'personal'
                ? (tx.категория || 'друго_лично')
                : (tx.категория === 'разход' ? 'разход' : 'друго');
              insertExpense.run(
                `🏦 ${tx.контрагент || 'Банков разход'}`,
                tx.контрагент || '',
                tx.сума || 0,
                currency,
                tx.основание || '',
                tx.property_id || null,
                expCat,
                tx.месец || null,
                txResult.lastInsertRowid,
                tx.дата || null,
                txScope
              );
            }
          }
        }
        return session_id;
      });

      const session_id = doImport();
      res.json({ ok: true, session_id, saved, skipped });
    } catch (err) {
      console.error('Save error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /unmatched — наемни без property_id ────────────────
  router.get('/unmatched', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT id, дата, контрагент, основание, сума, месец
        FROM transactions
        WHERE категория = 'наем' AND (property_id IS NULL OR property_id = 0)
        ORDER BY месец DESC, дата DESC
      `).all();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /transactions/:id — assign property_id ───────────
  router.patch('/transactions/:id', (req, res) => {
    try {
      const { property_id } = req.body;
      if (!property_id) return res.status(400).json({ error: 'property_id е задължителен' });
      db.prepare('UPDATE transactions SET property_id = ? WHERE id = ?').run(Number(property_id), req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /transactions/:id/currency — точкова корекция на валутата на ЕДНА
  // транзакция (когато банковата колона е сгрешила при конкретен превод).
  // Валутата е смесена през 2026 (преход) → коригира се поединично, не масово.
  router.patch('/transactions/:id/currency', (req, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Само за администратори' });
    try {
      const c = String(req.body?.currency || '').toUpperCase();
      if (c !== 'BGN' && c !== 'EUR') return res.status(400).json({ error: 'currency трябва да е BGN или EUR' });
      const r = db.prepare('UPDATE transactions SET currency=? WHERE id=?').run(c, req.params.id);
      res.json({ ok: true, changed: r.changes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /transactions/:id/month — поправя 'месец' (наемния период), когато се
  // разминава с датата на плащане (предплатен/закъснял наем). Формат 'YYYY-MM'.
  router.patch('/transactions/:id/month', (req, res) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Forbidden' });
    try {
      const m = req.body?.месец;
      if (!/^\d{4}-\d{2}$/.test(m || '')) return res.status(400).json({ error: 'месец трябва да е YYYY-MM' });
      const r = db.prepare('UPDATE transactions SET месец=? WHERE id=?').run(m, req.params.id);
      res.json({ ok: true, changed: r.changes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /transactions/:id/reclassify — директна смяна на категория/месец БЕЗ да
  // създава tx_rule (за разлика от /category). За еднократни корекции напр.
  // move-in депозит таггнат като наем, без бъдещите плащания на същия наемател
  // да станат депозит. Подавай само полетата за промяна.
  router.patch('/transactions/:id/reclassify', (req, res) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Forbidden' });
    try {
      const { категория, месец, сума, currency } = req.body || {};
      if (месец != null && !/^\d{4}-\d{2}$/.test(месец)) return res.status(400).json({ error: 'месец трябва да е YYYY-MM' });
      const sets = [], vals = [];
      if (категория != null) { sets.push('категория=?'); vals.push(категория); }
      if (месец != null)     { sets.push('месец=?');     vals.push(месец); }
      if (сума != null)      { sets.push('сума=?');      vals.push(Number(сума)); }
      if (currency != null)  { sets.push('currency=?');  vals.push(currency); }
      if (!sets.length) return res.status(400).json({ error: 'нищо за промяна' });
      vals.push(req.params.id);
      const r = db.prepare('UPDATE transactions SET ' + sets.join(', ') + ' WHERE id=?').run(...vals);
      res.json({ ok: true, changed: r.changes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /transactions/:id/category ──────────────────────
  // Auto-learns: saves a rule and retroactively applies it to matching unvalidated transactions.
  // Personal categories (заплата, управление, друго_лично) автоматично сменят scope='personal'
  // и създават personal_income запис при income типове.
  const PERSONAL_CATS    = new Set(['заплата', 'управление', 'sky_capital', 'лихва_болгар', 'друго_лично', 'заем_sky']);
  const PERSONAL_INCOMES = new Set(['заплата', 'управление', 'sky_capital', 'лихва_болгар']);

  router.patch('/transactions/:id/category', (req, res) => {
    try {
      const { категория, property_id, scope } = req.body;
      if (!категория) return res.status(400).json({ error: 'категория е задължителна' });

      // scope override: неутрални категории (напр. 'инвестиция') съществуват и в
      // двата свята — личен T212 депозит и бизнес покупка на имот. Подаден scope
      // печели пред извода от категорията.
      const newScope = (scope === 'personal' || scope === 'business')
        ? scope
        : (PERSONAL_CATS.has(категория) ? 'personal' : 'business');

      // Update this transaction (including scope)
      db.prepare('UPDATE transactions SET категория=?, property_id=COALESCE(?,property_id), scope=?, validated=1 WHERE id=?')
        .run(категория, property_id || null, newScope, req.params.id);

      // Get the counterparty for learning + the full row for personal_income creation
      const tx = db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.id);
      let affected = 0;
      let rule_saved = false;
      let personal_income_id = null;

      // Ако е личен доход — създай или обнови personal_income
      if (tx && tx.operation === 'Кт' && PERSONAL_INCOMES.has(категория)) {
        const existing = db.prepare('SELECT id FROM personal_income WHERE bank_tx_id=?').get(tx.id);
        if (existing) {
          db.prepare('UPDATE personal_income SET тип=?, сума=?, дата=?, валута=? WHERE id=?')
            .run(категория, tx.сума, tx.дата, tx.currency || 'EUR', existing.id);
          personal_income_id = existing.id;
        } else {
          const r = db.prepare(`INSERT INTO personal_income
            (дата, тип, сума, валута, източник, бележка, bank_tx_id)
            VALUES (?,?,?,?,?,?,?)`).run(
            tx.дата, категория, tx.сума,
            tx.currency || (tx.дата >= '2026-01-01' ? 'EUR' : 'BGN'),
            tx.контрагент || '',
            tx.основание || '',
            tx.id
          );
          personal_income_id = r.lastInsertRowid;
        }
      }

      // Ако сменяме категория към личен разход — sync expense_invoices.scope
      if (tx && tx.operation === 'Дт') {
        db.prepare('UPDATE expense_invoices SET scope=? WHERE bank_tx_id=?').run(newScope, tx.id);
      }

      if (tx && tx.контрагент) {
        const pattern = tx.контрагент.trim();

        // Upsert rule (включително scope, за auto-apply при бъдещ импорт)
        const existing = db.prepare('SELECT id FROM tx_rules WHERE LOWER(pattern)=LOWER(?)').get(pattern);
        if (existing) {
          db.prepare('UPDATE tx_rules SET категория=?, property_id=?, scope=? WHERE id=?')
            .run(категория, property_id || null, newScope, existing.id);
        } else {
          db.prepare('INSERT INTO tx_rules (pattern, категория, property_id, scope) VALUES (?,?,?,?)')
            .run(pattern, категория, property_id || null, newScope);
        }
        rule_saved = true;

        // Apply retroactively to all unvalidated transactions with same counterparty
        const patLower = pattern.toLowerCase();
        const unvalidated = db.prepare('SELECT id, контрагент FROM transactions WHERE validated=0 AND id != ?').all(req.params.id);
        const toUpdate = unvalidated.filter(t => t.контрагент && t.контрагент.toLowerCase().includes(patLower));
        if (toUpdate.length) {
          const upd = db.prepare('UPDATE transactions SET категория=?, property_id=COALESCE(?,property_id), scope=?, validated=1 WHERE id=?');
          const run = db.transaction(list => list.forEach(t => upd.run(категория, property_id || null, newScope, t.id)));
          run(toUpdate);
          affected = toUpdate.length;
        }
      }

      res.json({ ok: true, rule_saved, affected, scope: newScope, personal_income_id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /transactions/:id/validate ──────────────────────
  router.patch('/transactions/:id/validate', (req, res) => {
    try {
      db.prepare('UPDATE transactions SET validated=1 WHERE id=?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /transactions/validate-bulk ──────────────────────
  router.post('/transactions/validate-bulk', (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !ids.length) return res.status(400).json({ error: 'ids required' });
      const stmt = db.prepare('UPDATE transactions SET validated=1 WHERE id=?');
      const run  = db.transaction(list => list.forEach(id => stmt.run(id)));
      run(ids);
      res.json({ ok: true, count: ids.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /pending — unvalidated (rule-matched) ──────────────
  router.get('/pending', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT t.*, r.pattern as rule_pattern
        FROM transactions t
        LEFT JOIN tx_rules r ON t.rule_id = r.id
        WHERE t.validated = 0
        ORDER BY t.дата DESC
        LIMIT 500
      `).all();
      const count = db.prepare('SELECT COUNT(*) as cnt FROM transactions WHERE validated=0').get().cnt;
      res.json({ rows, count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Helpers — get issuer VAT rate + property VAT-exempt map
  function getIssuerVatRate() {
    const row = db.prepare("SELECT value FROM settings WHERE key='issuer'").get();
    if (!row) return 0;
    try { return Number(JSON.parse(row.value).vat_rate || 0); } catch { return 0; }
  }
  function getPropertyVatExemptMap() {
    const rows = db.prepare('SELECT id, vat_exempt FROM properties').all();
    const map = {};
    rows.forEach(p => { map[p.id] = !!p.vat_exempt; });
    return map;
  }
  function toNetRentEur(grossEur, propertyId, issuerVatRate, vatExemptMap) {
    if (!issuerVatRate || issuerVatRate <= 0) return grossEur;
    // No property → default treat as residential (exempt) to be conservative
    if (propertyId == null) return grossEur;
    const exempt = vatExemptMap[propertyId];
    if (exempt) return grossEur;
    return grossEur / (1 + issuerVatRate / 100);
  }

  // ── GET /monthly ───────────────────────────────────────────
  router.get('/monthly', (req, res) => {
    try {
      // All amounts converted to EUR (BGN / 1.95583, EUR as-is)
      const BGN_RATE = 1.95583;
      const rows = db.prepare(`
        SELECT
          месец,
          COALESCE(currency, CASE WHEN месец < '2026-01' THEN 'BGN' ELSE 'EUR' END) as currency,
          SUM(CASE WHEN категория='наем'                       THEN CASE WHEN COALESCE(currency, CASE WHEN месец < '2026-01' THEN 'BGN' ELSE 'EUR' END)='BGN' THEN сума/${BGN_RATE} ELSE сума END ELSE 0 END) as наем_total,
          SUM(CASE WHEN категория='вноска'                     THEN CASE WHEN COALESCE(currency, CASE WHEN месец < '2026-01' THEN 'BGN' ELSE 'EUR' END)='BGN' THEN сума/${BGN_RATE} ELSE сума END ELSE 0 END) as вноска_total,
          SUM(CASE WHEN категория IN ('разход','разход_друг')  THEN CASE WHEN COALESCE(currency, CASE WHEN месец < '2026-01' THEN 'BGN' ELSE 'EUR' END)='BGN' THEN сума/${BGN_RATE} ELSE сума END ELSE 0 END) as разход_total,
          SUM(CASE WHEN категория='нап_ддс'                    THEN CASE WHEN COALESCE(currency, CASE WHEN месец < '2026-01' THEN 'BGN' ELSE 'EUR' END)='BGN' THEN сума/${BGN_RATE} ELSE сума END ELSE 0 END) as нап_ддс_total,
          SUM(CASE WHEN категория='equity_inject'              THEN CASE WHEN COALESCE(currency, CASE WHEN месец < '2026-01' THEN 'BGN' ELSE 'EUR' END)='BGN' THEN сума/${BGN_RATE} ELSE сума END ELSE 0 END) as equity_total,
          SUM(CASE WHEN категория='депозит_задържан'           THEN CASE WHEN COALESCE(currency, CASE WHEN месец < '2026-01' THEN 'BGN' ELSE 'EUR' END)='BGN' THEN сума/${BGN_RATE} ELSE сума END ELSE 0 END) as задържан_депозит_total
        FROM transactions
        WHERE месец IS NOT NULL AND месец != ''
        GROUP BY месец
        ORDER BY месец DESC
      `).all();

      // Per-month NET rent (минус ДДС): извличаме всеки наем tx с property_id
      const issuerVatRate = getIssuerVatRate();
      const vatExemptMap  = getPropertyVatExemptMap();
      const rentTxs = db.prepare(`
        SELECT месец, property_id, сума, currency, дата
        FROM transactions
        WHERE категория='наем' AND месец IS NOT NULL AND месец != ''
      `).all();
      const netRentByMonth = {};
      for (const t of rentTxs) {
        const cur = t.currency || (t.месец < '2026-01' ? 'BGN' : 'EUR');
        const eur = cur === 'BGN' ? (t.сума || 0) / BGN_RATE : (t.сума || 0);
        const net = toNetRentEur(eur, t.property_id, issuerVatRate, vatExemptMap);
        netRentByMonth[t.месец] = (netRentByMonth[t.месец] || 0) + net;
      }

      // Per-month scheduled loan installments (от модул Кредити)
      const loans = db.prepare('SELECT вноска, краен, currency FROM loans').all();
      const scheduledFor = (ym) => {
        const y = Number(ym.slice(0, 4));
        return loans.reduce((s, l) => {
          if (l.краен && l.краен < y) return s;
          const cur = (l.currency || 'EUR').toUpperCase();
          const eur = cur === 'BGN' ? (l.вноска || 0) / BGN_RATE : (l.вноска || 0);
          return s + eur;
        }, 0);
      };

      res.json(rows.map(r => {
        const наем_net  = netRentByMonth[r.месец] || 0;
        const scheduled = scheduledFor(r.месец);
        return {
          месец:                    r.месец,
          наем_total:               r.наем_total               || 0, // gross (както досега, за reference)
          наем_net:                 наем_net,                         // без ДДС
          вноска_total:             r.вноска_total             || 0, // bank-only (обикн. 0)
          вноска_scheduled:         scheduled,                        // от модул Кредити
          разход_total:             r.разход_total             || 0,
          нап_ддс_total:            r.нап_ддс_total            || 0,
          equity_total:             r.equity_total             || 0,
          задържан_депозит_total:   r.задържан_депозит_total   || 0,
          // Bank-only Net (както досега)
          net: (r.наем_total || 0) + (r.задържан_депозит_total || 0) - (r.вноска_total || 0) - (r.разход_total || 0),
          // Консолидиран Нет: net rent + НАП - график - разходи (отразява реалната икономика)
          net_consolidated: наем_net + (r.задържан_депозит_total || 0) + (r.нап_ддс_total || 0) - scheduled - (r.разход_total || 0),
        };
      }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /transactions — paginated with filters ─────────────
  router.get('/transactions', (req, res) => {
    try {
      const { месец, категория, search, validated, limit = 200, offset = 0 } = req.query;
      const where  = [];
      const params = [];
      if (месец) { where.push('месец = ?'); params.push(месец); }
      if (категория && категория !== 'all') { where.push('категория = ?'); params.push(категория); }
      if (search) { where.push('(контрагент LIKE ? OR основание LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
      if (validated === '0') { where.push('validated = 0'); }
      else if (validated === '1') { where.push('validated = 1'); }
      const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const rows  = db.prepare(`SELECT * FROM transactions ${whereStr} ORDER BY дата DESC, id DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), Number(offset));
      const total = db.prepare(`SELECT COUNT(*) as cnt FROM transactions ${whereStr}`).get(...params).cnt;
      res.json({ rows, total });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /coverage — first/last imported date + last 6 months counts ─
  router.get('/coverage', (req, res) => {
    try {
      const totals = db.prepare(`
        SELECT
          MIN(дата) as firstDate,
          MAX(дата) as lastDate,
          COUNT(*)  as count
        FROM transactions
        WHERE дата IS NOT NULL AND дата != ''
      `).get();

      const byMonth = db.prepare(`
        SELECT месец, COUNT(*) as cnt, MAX(дата) as lastDate
        FROM transactions
        WHERE месец IS NOT NULL AND месец != ''
        GROUP BY месец
        ORDER BY месец DESC
        LIMIT 6
      `).all();

      res.json({
        firstDate: totals?.firstDate || null,
        lastDate:  totals?.lastDate  || null,
        count:     totals?.count     || 0,
        byMonth:   byMonth.reverse(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /stats — KPI aggregates ────────────────────────────
  router.get('/stats', (req, res) => {
    try {
      const BGN_RATE = 1.95583;
      const now  = new Date();
      const pad  = n => String(n).padStart(2, '0');
      const cur  = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
      const d3   = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const m3   = `${d3.getFullYear()}-${pad(d3.getMonth() + 1)}`;
      const ytdS = `${now.getFullYear()}-01`;
      const ly   = String(now.getFullYear() - 1);

      const issuerVatRate = getIssuerVatRate();
      const vatExemptMap  = getPropertyVatExemptMap();
      const loans         = db.prepare('SELECT вноска, краен, currency FROM loans').all();

      const agg = (whereClause, params, periodMonths) => {
        // Aggregate всичко в EUR (BGN→EUR за стари записи)
        const sums = db.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN категория='наем'
              THEN CASE WHEN COALESCE(currency, CASE WHEN месец < '2026-01' THEN 'BGN' ELSE 'EUR' END)='BGN'
                THEN сума/${BGN_RATE} ELSE сума END ELSE 0 END), 0) as наем,
            COALESCE(SUM(CASE WHEN категория='вноска'
              THEN CASE WHEN COALESCE(currency, CASE WHEN месец < '2026-01' THEN 'BGN' ELSE 'EUR' END)='BGN'
                THEN сума/${BGN_RATE} ELSE сума END ELSE 0 END), 0) as вноска,
            COALESCE(SUM(CASE WHEN категория IN ('разход','разход_друг')
              THEN CASE WHEN COALESCE(currency, CASE WHEN месец < '2026-01' THEN 'BGN' ELSE 'EUR' END)='BGN'
                THEN сума/${BGN_RATE} ELSE сума END ELSE 0 END), 0) as разход,
            COALESCE(SUM(CASE WHEN категория='нап_ддс'
              THEN CASE WHEN COALESCE(currency, CASE WHEN месец < '2026-01' THEN 'BGN' ELSE 'EUR' END)='BGN'
                THEN сума/${BGN_RATE} ELSE сума END ELSE 0 END), 0) as нап_ддс,
            COUNT(*) as cnt
          FROM transactions ${whereClause}
        `).get(...params);

        // Per-tx net rent (минус ДДС) за същия филтър
        const rentTxs = db.prepare(`
          SELECT месец, property_id, сума, currency
          FROM transactions
          WHERE категория='наем' AND месец IS NOT NULL AND месец != ''
            AND ${whereClause.replace(/^WHERE /, '')}
        `).all(...params);
        let наем_net = 0;
        for (const t of rentTxs) {
          const ccy = t.currency || (t.месец < '2026-01' ? 'BGN' : 'EUR');
          const eur = ccy === 'BGN' ? (t.сума || 0) / BGN_RATE : (t.сума || 0);
          наем_net += toNetRentEur(eur, t.property_id, issuerVatRate, vatExemptMap);
        }

        // Scheduled loans за периода
        const monthsList = periodMonths || [];
        const scheduled = monthsList.reduce((s, ym) => {
          const y = Number(ym.slice(0, 4));
          return s + loans.reduce((ss, l) => {
            if (l.краен && l.краен < y) return ss;
            const ccy = (l.currency || 'EUR').toUpperCase();
            const eur = ccy === 'BGN' ? (l.вноска || 0) / BGN_RATE : (l.вноска || 0);
            return ss + eur;
          }, 0);
        }, 0);

        return {
          ...sums,
          наем_net,
          вноска_scheduled: scheduled,
          net_consolidated: наем_net + (sums.нап_ддс || 0) - scheduled - (sums.разход || 0),
        };
      };

      // Помощни за списък месеци
      const monthsBetween = (from, to) => {
        const out = [];
        const [yF, mF] = from.split('-').map(Number);
        const [yT, mT] = to.split('-').map(Number);
        let y = yF, m = mF;
        while (y < yT || (y === yT && m <= mT)) {
          out.push(`${y}-${String(m).padStart(2, '0')}`);
          m++; if (m > 12) { m = 1; y++; }
        }
        return out;
      };
      const monthsLike = (yearStr) => monthsBetween(`${yearStr}-01`, `${yearStr}-12`);

      res.json({
        currentMonth: { label: cur,                       ...agg('WHERE месец = ?',    [cur],  [cur]) },
        last3months:  { label: `${m3} → ${cur}`,          ...agg('WHERE месец >= ?',   [m3],   monthsBetween(m3, cur)) },
        ytd:          { label: `${now.getFullYear()} ГТД`, ...agg('WHERE месец >= ?', [ytdS], monthsBetween(ytdS, cur)) },
        lastYear:     { label: ly,                         ...agg('WHERE месец LIKE ?', [`${ly}-%`], monthsLike(ly)) },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /rules ─────────────────────────────────────────────
  router.get('/rules', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM tx_rules ORDER BY id DESC').all();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /rules ────────────────────────────────────────────
  router.post('/rules', (req, res) => {
    try {
      const { pattern, категория, property_id } = req.body;
      if (!pattern || !категория) return res.status(400).json({ error: 'pattern и категория са задължителни' });
      // Avoid exact duplicate patterns
      const existing = db.prepare('SELECT id FROM tx_rules WHERE LOWER(pattern)=LOWER(?)').get(pattern);
      if (existing) {
        db.prepare('UPDATE tx_rules SET категория=?, property_id=? WHERE id=?').run(категория, property_id || null, existing.id);
        return res.json({ ok: true, id: existing.id, updated: true });
      }
      const result = db.prepare('INSERT INTO tx_rules (pattern, категория, property_id) VALUES (?,?,?)').run(pattern, категория, property_id || null);
      res.json({ ok: true, id: result.lastInsertRowid });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── DELETE /rules/:id ──────────────────────────────────────
  router.delete('/rules/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM tx_rules WHERE id=?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /deposits — deposit balances per property ──────────
  router.get('/deposits', (req, res) => {
    try {
      const BGN_RATE = 1.95583;
      const toEur = `CASE WHEN t.currency='BGN' THEN t.сума/${BGN_RATE} ELSE t.сума END`;

      const summary = db.prepare(`
        SELECT
          t.property_id,
          p.адрес,
          p.наемател,
          SUM(CASE WHEN t.категория='депозит_получен'  THEN ${toEur} ELSE 0 END) as получени,
          SUM(CASE WHEN t.категория='депозит_върнат'   THEN ${toEur} ELSE 0 END) as върнати,
          SUM(CASE WHEN t.категория='депозит_задържан' THEN ${toEur} ELSE 0 END) as задържани
        FROM transactions t
        LEFT JOIN properties p ON p.id = t.property_id
        WHERE t.категория IN ('депозит_получен','депозит_върнат','депозит_задържан')
        GROUP BY t.property_id
        ORDER BY p.адрес ASC
      `).all();

      // Retained deposits by month
      const retainedByMonth = db.prepare(`
        SELECT t.месец,
          SUM(CASE WHEN t.currency='BGN' THEN t.сума/${BGN_RATE} ELSE t.сума END) as сума
        FROM transactions t
        WHERE t.категория = 'депозит_задържан' AND t.месец IS NOT NULL
        GROUP BY t.месец
        ORDER BY t.месец DESC
      `).all();

      const unlinked = db.prepare(`
        SELECT t.id, t.дата, t.контрагент, t.основание, t.сума, t.currency, t.категория, t.месец
        FROM transactions t
        WHERE t.категория IN ('депозит_получен','депозит_върнат','депозит_задържан')
          AND (t.property_id IS NULL OR t.property_id = 0)
        ORDER BY t.дата DESC
      `).all();

      const details = db.prepare(`
        SELECT t.id, t.дата, t.контрагент, t.основание, t.сума, t.currency, t.категория, t.месец,
               p.адрес, t.property_id
        FROM transactions t
        LEFT JOIN properties p ON p.id = t.property_id
        WHERE t.категория IN ('депозит_получен','депозит_върнат','депозит_задържан')
        ORDER BY t.дата DESC
      `).all();

      res.json({ summary, unlinked, details, retainedByMonth });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /transactions/:id/retain-deposit ──────────────────
  router.post('/transactions/:id/retain-deposit', (req, res) => {
    try {
      const tx = db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.id);
      if (!tx) return res.status(404).json({ error: 'Транзакцията не е намерена' });
      db.prepare('UPDATE transactions SET категория=?, validated=1 WHERE id=?')
        .run('депозит_задържан', req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /transactions/all — clear all transactions and import sessions
  router.delete('/transactions/all', (req, res) => {
    try {
      const count = db.prepare('SELECT COUNT(*) as c FROM transactions').get().c;
      db.prepare('DELETE FROM transactions').run();
      db.prepare('DELETE FROM import_sessions').run();
      res.json({ ok: true, deleted: count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /transactions/:id — изтрий конкретна транзакция с cascade на свързани records
  router.delete('/transactions/:id', (req, res) => {
    try {
      const id = req.params.id;
      const tx = db.prepare('SELECT id FROM transactions WHERE id=?').get(id);
      if (!tx) return res.status(404).json({ error: 'Not found' });

      const doIt = db.transaction(() => {
        // Cascade: махни референции в personal_income
        const piRes = db.prepare('DELETE FROM personal_income WHERE bank_tx_id=?').run(id);
        // Cascade: махни auto-created expense_invoices
        const eiRes = db.prepare('DELETE FROM expense_invoices WHERE bank_tx_id=?').run(id);
        // Изтрий самата транзакция
        const txRes = db.prepare('DELETE FROM transactions WHERE id=?').run(id);
        return {
          tx_deleted: txRes.changes,
          personal_income_deleted: piRes.changes,
          expense_invoices_deleted: eiRes.changes,
        };
      });
      const result = doIt();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /retag-2025-rent-currency — еднократен data fix.
  // 2025 'наем' Кт транзакции са записани в EUR-величина но таггнати BGN
  // (доказано: всеки имот 2025 наем ≈ EUR договор; 2026 = BGN-величина).
  // Re-tag → currency='EUR' за да не се делят при BGN→EUR конверсия.
  // ?dry=1 за preview без промяна.
  router.post('/retag-2025-rent-currency', (req, res) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Forbidden' });
    try {
      const dry = req.query.dry === '1' || req.body?.dry === true;
      const sel = db.prepare(`
        SELECT COUNT(*) AS cnt, ROUND(SUM(сума),2) AS sum_native
        FROM transactions
        WHERE категория='наем' AND operation='Кт'
          AND месец < '2026-01'
          AND UPPER(COALESCE(currency,'BGN'))='BGN'
      `).get();
      if (dry) {
        return res.json({ ok: true, dry: true, would_update: sel.cnt, sum_native: sel.sum_native });
      }
      const r = db.prepare(`
        UPDATE transactions SET currency='EUR'
        WHERE категория='наем' AND operation='Кт'
          AND месец < '2026-01'
          AND UPPER(COALESCE(currency,'BGN'))='BGN'
      `).run();
      res.json({ ok: true, updated: r.changes, sum_native: sel.sum_native });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /transactions/:id/split-deposit — раздели наем+депозит транзакция.
  // Оригиналът остава 'наем' но сумата му се намалява до наемната част;
  // създава се нов запис 'депозит_получен' за депозитната част (същата дата/имот/
  // контрагент/валута/scope). Така rent графиките показват точния наем,
  // а депозитът не влиза в plIncome (получен депозит = задължение, не приход).
  // Body: { deposit_amount } (в нативната валута на транзакцията, положителна).
  // Опц. rent_amount — иначе се смята като сума − deposit_amount.
  router.post('/transactions/:id/split-deposit', (req, res) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Forbidden' });
    try {
      const tx = db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.id);
      if (!tx) return res.status(404).json({ error: 'Транзакцията не е намерена' });
      if (tx.operation !== 'Кт') return res.status(400).json({ error: 'Само за входящи (Кт) плащания' });

      const dep = Number(req.body?.deposit_amount);
      if (!(dep > 0)) return res.status(400).json({ error: 'deposit_amount трябва да е положителна' });
      const total = Math.abs(Number(tx.сума));
      const rent = req.body?.rent_amount != null ? Number(req.body.rent_amount) : (total - dep);
      if (rent < 0 || dep >= total + 0.005) {
        return res.status(400).json({ error: 'deposit_amount не може да надвишава сумата на транзакцията' });
      }

      const insertTx = db.prepare(`
        INSERT INTO transactions (session_id, дата, контрагент, основание, сума, operation, категория, property_id, месец, validated, currency, scope)
        VALUES (?, ?, ?, ?, ?, 'Кт', 'депозит_получен', ?, ?, 1, ?, ?)
      `);

      let depositTxId = null;
      const doSplit = db.transaction(() => {
        // намали оригинала до наемната част
        db.prepare('UPDATE transactions SET сума=?, категория=?, validated=1 WHERE id=?')
          .run(Number(rent.toFixed(2)), 'наем', tx.id);
        // създай депозитен запис
        const r = insertTx.run(
          tx.session_id, tx.дата, tx.контрагент || '',
          'ДЕПОЗИТ (split от #' + tx.id + '): ' + (tx.основание || ''),
          Number(dep.toFixed(2)),
          tx.property_id || null, tx.месец || null,
          tx.currency || null, tx.scope || 'business'
        );
        depositTxId = r.lastInsertRowid;
      });
      doSplit();

      res.json({ ok: true, rent_tx_id: Number(tx.id), rent_amount: Number(rent.toFixed(2)),
        deposit_tx_id: depositTxId, deposit_amount: Number(dep.toFixed(2)) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /cash-rent — bulk запис на получен КЕШ наем за избрани имоти за даден месец.
  // За имоти с rent_channel='cash' наемът не минава по банка → записва се ръчно тук.
  // За всеки имот: създава наем Кт транзакция (сума = наема на имота). Прескача,
  // ако вече има наем за този имот+месец (без дубли).
  // Body: { property_ids: [int], месец: 'YYYY-MM' }
  router.post('/cash-rent', (req, res) => {
    if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Forbidden' });
    try {
      const ins = db.prepare(`INSERT INTO transactions
        (session_id, дата, контрагент, основание, сума, operation, категория, property_id, месец, validated, currency, scope)
        VALUES (NULL, ?, ?, ?, ?, 'Кт', 'наем', ?, ?, 1, ?, 'business')`);
      const existsStmt = db.prepare("SELECT id FROM transactions WHERE property_id=? AND месец=? AND категория='наем' AND operation='Кт'");
      const created = [], skipped = [];
      const recordOne = (pid, месец, сума, currency) => {
        const p = db.prepare('SELECT id, наем, наемател FROM properties WHERE id=?').get(pid);
        if (!p) { skipped.push({ property_id: pid, месец, reason: 'няма имот' }); return; }
        if (existsStmt.get(pid, месец)) { skipped.push({ property_id: pid, месец, reason: 'вече има наем' }); return; }
        const amount = сума != null ? Number(сума) : (Number(p.наем) || 0);
        const cur = currency || (месец >= '2026-01' ? 'EUR' : 'BGN');
        const r = ins.run(`${месец}-01`, p.наемател || '', `Кеш наем ${месец}`, amount, pid, месец, cur);
        created.push({ property_id: pid, месец, tx_id: r.lastInsertRowid, сума: amount, currency: cur });
      };

      const { property_ids, месец, entries } = req.body || {};

      // Режим A: explicit entries [{property_id, месец, сума, currency}]
      if (Array.isArray(entries) && entries.length) {
        for (const e of entries) {
          if (!/^\d{4}-\d{2}$/.test(e.месец || '')) { skipped.push({ ...e, reason: 'лош месец' }); continue; }
          recordOne(Number(e.property_id), e.месец, e.сума, e.currency);
        }
        return res.json({ ok: true, mode: 'entries', created, skipped });
      }

      // Режим B: property_ids + един месец (сума = наема на имота)
      if (!Array.isArray(property_ids) || !property_ids.length) return res.status(400).json({ error: 'property_ids или entries required' });
      if (!/^\d{4}-\d{2}$/.test(месец || '')) return res.status(400).json({ error: 'месец трябва да е YYYY-MM' });
      for (const pid of property_ids) recordOne(Number(pid), месец, null, null);
      res.json({ ok: true, mode: 'bulk', created, skipped });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
