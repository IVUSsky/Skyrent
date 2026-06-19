const express = require('express');
const { orgContext } = require('../db/db');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '../storage/expense-invoices');

const PAYER_IBAN = 'BG75PRCB92301053911901';
const PAYER_BIC  = 'PRCBBGSF';
const PAYER_NAME = 'SKY CAPITAL OOD';

// ── IBAN MOD-97 ──────────────────────────────────────────────
function validateIBAN(iban) {
  if (!iban || iban.length < 15) return false;
  const r = (iban.slice(4) + iban.slice(0, 4)).toUpperCase().split('').map(c => {
    const n = c.charCodeAt(0);
    return n >= 65 && n <= 90 ? String(n - 55) : c;
  }).join('');
  let rem = 0;
  for (const ch of r) rem = (rem * 10 + parseInt(ch, 10)) % 97;
  return rem === 1;
}

// ── XML helpers ───────────────────────────────────────────────
function xe(s)         { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function sanitize(s,n) { return (s || '').replace(/[^A-Za-z0-9 ,.\-\/]/g,' ').replace(/\s+/g,' ').trim().slice(0,n); }
function ctry(iban,bic){ if(iban && /^[A-Z]{2}/.test(iban)) return iban.slice(0,2); if(bic && bic.length>=6){const c=bic.slice(4,6);if(/^[A-Z]{2}$/.test(c)&&c!=='XX')return c;} return 'BG'; }

function generateXML(invoices, payerIban, execDate, fmt) {
  const ns   = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03';
  const now  = new Date();
  const pad  = n => String(n).padStart(2,'0');
  const dtag = now.getFullYear()+pad(now.getMonth()+1)+pad(now.getDate());
  const msgId = ('SKAYCAP'+dtag+pad(now.getHours())+pad(now.getMinutes())+pad(now.getSeconds())).slice(0,35);
  const isBisera = fmt === 'BISERA6';
  const lclInstrm = isBisera ? '\n        <LclInstrm><Cd>BISERA6</Cd></LclInstrm>' : '';
  const total = invoices.reduce((s,i) => s+(i.amount||0), 0);

  let txBlocks = '';
  invoices.forEach((inv, i) => {
    const ccy    = inv.currency || 'BGN';
    const amt    = (parseFloat(inv.amount)||0).toFixed(2);
    const iban   = (inv.supplier_iban||'').replace(/\s/g,'');
    const bic    = inv.supplier_bic||'';
    const instrId= (msgId+'I'+String(i+1).padStart(4,'0')).slice(0,35);
    const e2eId  = (msgId+'E'+String(i+1).padStart(4,'0')).slice(0,35);
    const reason = sanitize(inv.reason||'PAYMENT', 90);
    const bName  = sanitize(inv.supplier_name||'UNKNOWN', 70);
    const bAddr  = sanitize((inv.supplier_name||'').slice(0,30)+' Bulgaria', 50)||'Bulgaria';
    txBlocks += `
      <CdtTrfTxInf>
        <PmtId><InstrId>${xe(instrId)}</InstrId><EndToEndId>${xe(e2eId)}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="${xe(ccy)}">${amt}</InstdAmt></Amt>${bic?`
        <CdtrAgt><FinInstnId><BIC>${xe(bic)}</BIC></FinInstnId></CdtrAgt>`:''}
        <Cdtr>
          <Nm>${xe(bName)}</Nm>
          <PstlAdr><Ctry>${xe(ctry(iban,bic))}</Ctry><AdrLine>${xe(bAddr.slice(0,50))}</AdrLine></PstlAdr>
        </Cdtr>${iban?`
        <CdtrAcct><Id><IBAN>${xe(iban)}</IBAN></Id></CdtrAcct>`:''}
        <RmtInf><Ustrd>${xe(reason)}</Ustrd></RmtInf>
      </CdtTrfTxInf>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${ns}">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${xe(msgId)}</MsgId>
      <CreDtTm>${now.toISOString().slice(0,19)}</CreDtTm>
      <NbOfTxs>${invoices.length}</NbOfTxs>
      <CtrlSum>${total.toFixed(2)}</CtrlSum>
      <InitgPty><Nm>${xe(PAYER_NAME)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${xe(msgId+'P1')}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${invoices.length}</NbOfTxs>
      <CtrlSum>${total.toFixed(2)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl>${lclInstrm}</PmtTpInf>
      <ReqdExctnDt>${xe(execDate)}</ReqdExctnDt>
      <Dbtr><Nm>${xe(PAYER_NAME)}</Nm><PstlAdr><Ctry>BG</Ctry><AdrLine>Sofia Bulgaria</AdrLine></PstlAdr></Dbtr>
      <DbtrAcct><Id><IBAN>${xe(payerIban)}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>${xe(PAYER_BIC)}</BIC></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${txBlocks}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}

// ── Multer storage ────────────────────────────────────────────
function makeStorage() {
  return multer.diskStorage({
    destination(req, file, cb) {
      const now = new Date();
      const dir = path.join(UPLOAD_DIR, String(now.getFullYear()), String(now.getMonth()+1).padStart(2,'0'));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      // Decode original name safely
      let orig;
      try { orig = Buffer.from(file.originalname, 'latin1').toString('utf8'); }
      catch(_) { orig = file.originalname; }
      const safe = Date.now() + '_' + orig.replace(/[^a-zA-Z0-9.\u0400-\u04FF_-]/g, '_');
      cb(null, safe);
    }
  });
}

// ── XML parser (e-invoice.bg signed XML — priority over PDF AI) ─
const xmlParser = require('../lib/einvoiceXmlParser');

// Shared updater — used by both XML and AI paths.
// Applies tx_rules auto-categorize, counterparty upsert, месец detection, property matching by utility account.
function applyParsedData(db, id, data, sourceNote) {
  let iban = (data.supplier_iban || '').replace(/\s/g, '').toUpperCase();
  let bic = (data.supplier_bic || '').replace(/\s/g, '').toUpperCase();
  let note = sourceNote || '';

  // Counterparty match — prefer DB IBAN if exists
  if (data.supplier_name) {
    const cp = db.prepare(
      "SELECT * FROM counterparties WHERE LOWER(name) LIKE ?"
    ).get('%' + data.supplier_name.toLowerCase().slice(0, 10) + '%');
    if (cp) {
      iban = cp.iban || iban;
      bic = cp.bic || bic;
      note = (note ? note + '; ' : '') + 'Контрагент от база';
    }
  }

  // Upsert new valid counterparty
  if (data.supplier_name && iban) {
    const ex = db.prepare('SELECT id FROM counterparties WHERE iban = ?').get(iban);
    if (!ex) db.prepare('INSERT OR IGNORE INTO counterparties (name, iban, bic, currency) VALUES (?, ?, ?, ?)').run(
      data.supplier_name, iban, bic, data.currency || 'BGN'
    );
  }

  // ── Property matching by utility account number ──
  let autoPropertyId = null;
  if (data.utility_account_id && data.utility_type) {
    // Search all properties for matching utility_account
    const properties = db.prepare("SELECT id, utility_accounts FROM properties WHERE utility_accounts IS NOT NULL AND utility_accounts != '' AND utility_accounts != '{}'").all();
    for (const prop of properties) {
      try {
        const accounts = JSON.parse(prop.utility_accounts || '{}');
        if (accounts[data.utility_type] === data.utility_account_id ||
            accounts[data.utility_type] === data.utility_bp) {
          autoPropertyId = prop.id;
          note = (note ? note + '; ' : '') + `Имот auto-match по партиден ${data.utility_account_id}`;
          break;
        }
      } catch (_) {}
    }
    if (!autoPropertyId) {
      note = (note ? note + '; ' : '') + `Партиден ${data.utility_account_id} (${data.utility_type}) — нужен mapping към имот`;
    }
  }

  // Auto-categorize from tx_rules (only if no property match yet)
  let autoCategory = null;
  if (data.supplier_name) {
    const supplierLower = data.supplier_name.toLowerCase();
    const allRules = db.prepare('SELECT * FROM tx_rules').all();
    for (const rule of allRules) {
      if (rule.pattern && supplierLower.includes(rule.pattern.toLowerCase())) {
        autoCategory = rule.категория;
        if (!autoPropertyId && rule.property_id) autoPropertyId = rule.property_id;
        note = (note ? note + '; ' : '') + `Авто-категория от правило: ${rule.категория}`;
        break;
      }
    }
  }

  // Map utility_type to expense_category if not set by rules
  if (!autoCategory && data.utility_type && data.utility_type !== 'друго') {
    autoCategory = data.utility_type;
  }

  // Detect месец — prefer parsed XML data, fallback to invoice_date
  let detectedMonth = data.detected_month || null;
  if (!detectedMonth && data.invoice_date && /^\d{4}-\d{2}/.test(data.invoice_date)) {
    detectedMonth = data.invoice_date.slice(0, 7);
  }

  // Compose ai_notes
  const noteParts = [note];
  if (data.invoice_number) noteParts.push(`Фактура: ${data.invoice_number}`);
  if (data.invoice_date)   noteParts.push(`Дата: ${data.invoice_date}`);
  if (data.due_date)       noteParts.push(`Падеж: ${data.due_date}`);
  if (data.supplier_eik)   noteParts.push(`ЕИК: ${data.supplier_eik}`);
  if (data.amount_no_vat != null) noteParts.push(`Основа: ${data.amount_no_vat}`);
  if (data.vat_amount != null)    noteParts.push(`ДДС: ${data.vat_amount}`);
  const extraNote = noteParts.filter(Boolean).join(' | ').slice(0, 500) || null;

  const updates = [
    "status='done'", 'supplier_name=?', 'supplier_iban=?', 'supplier_bic=?',
    'amount=?', 'currency=?', 'reason=?', 'ai_notes=?',
    'invoice_number=?', 'invoice_date=?', 'supplier_eik=?', 'amount_no_vat=?', 'vat_amount=?'
  ];
  const params = [
    data.supplier_name || '', iban, bic,
    data.amount, data.currency || 'BGN', data.reason || 'PAYMENT', extraNote,
    data.invoice_number || null,
    data.invoice_date || null,
    data.supplier_eik || null,
    data.amount_no_vat ?? null,
    data.vat_amount ?? null,
  ];
  if (detectedMonth) { updates.push('месец=?'); params.push(detectedMonth); }
  if (autoCategory)  { updates.push('expense_category=?'); params.push(autoCategory); }
  if (autoPropertyId){ updates.push('property_id=?'); params.push(autoPropertyId); }
  params.push(id);

  db.prepare(`UPDATE expense_invoices SET ${updates.join(', ')} WHERE id=?`).run(...params);

  // Save consumption history if matched to property and we have utility data
  let historyId = null;
  if (autoPropertyId && data.utility_type && detectedMonth && data.consumption) {
    try {
      const r = db.prepare(`
        INSERT OR REPLACE INTO property_utility_history
          (property_id, invoice_id, utility_type, period, amount, currency, consumption_data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        autoPropertyId, id, data.utility_type, detectedMonth,
        data.amount, data.currency || 'BGN',
        JSON.stringify(data.consumption)
      );
      historyId = r.lastInsertRowid;
    } catch (e) {
      // duplicate or constraint — just skip silently
    }
  }

  return {
    id, status: 'done',
    supplier_name: data.supplier_name,
    amount: data.amount,
    auto_category: autoCategory,
    auto_property_id: autoPropertyId,
    utility_type: data.utility_type,
    utility_account_id: data.utility_account_id,
    needs_property_mapping: !!(data.utility_account_id && !autoPropertyId),
    месец: detectedMonth,
    source_format: data.source_format || 'ai',
    history_id: historyId,
  };
}

// ── Shared extract helper — XML first, AI fallback ───────────
// Returns array of result objects.
async function runAiExtract(db, ids) {
  const results = [];

  for (const id of ids) {
    const inv = db.prepare('SELECT * FROM expense_invoices WHERE id = ?').get(id);
    if (!inv) { results.push({ id, error: 'Not found' }); continue; }
    if (inv.status === 'done') { results.push({ id, status: 'skipped' }); continue; }

    db.prepare("UPDATE expense_invoices SET status = 'processing' WHERE id = ?").run(id);

    try {
      const fp = inv.filepath;
      if (!fp || !fs.existsSync(fp)) throw new Error('File missing: ' + fp);

      // STEP 1: Try XML parser first (instant, 100% accurate for e-invoice.bg)
      // ZIP може да съдържа множество фактури → парсваме всички
      const xmlResults = xmlParser.tryParseAllInvoices(fp);
      const okResults = xmlResults.filter(r => r && r.ok);
      if (okResults.length > 0) {
        if (okResults.length === 1) {
          // Single XML — apply директно към текущия expense_invoice
          const result = applyParsedData(db, id, okResults[0].data, 'XML signed (e-invoice.bg)');
          results.push(result);
        } else {
          // Multi-XML ZIP — първият към current row, останалите → нови expense_invoice rows
          const firstResult = applyParsedData(db, id, okResults[0].data, `XML signed (e-invoice.bg, 1/${okResults.length})`);
          results.push(firstResult);
          for (let i = 1; i < okResults.length; i++) {
            // Клонирай реда: copy filepath + основни полета, после applyParsedData
            const newRow = db.prepare(
              `INSERT INTO expense_invoices (filepath, filename, source, status, payment_type, expense_category, uploaded_at)
               SELECT filepath, filename, source, 'processing', payment_type, expense_category, uploaded_at
               FROM expense_invoices WHERE id = ?`
            ).run(id);
            const newId = newRow.lastInsertRowid;
            const subResult = applyParsedData(db, newId, okResults[i].data, `XML signed (e-invoice.bg, ${i+1}/${okResults.length})`);
            results.push(subResult);
          }
        }
        continue;
      }

      // STEP 2: Fallback to Claude AI (PDF, images, non-XML)
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('Not XML; Claude fallback unavailable (ANTHROPIC_API_KEY not set)');

      let Anthropic;
      try { Anthropic = require('@anthropic-ai/sdk'); }
      catch(e) { throw new Error('@anthropic-ai/sdk not installed: ' + e.message); }
      const client = new Anthropic.default({ apiKey });

      const base64 = fs.readFileSync(fp).toString('base64');
      const isPdf  = fp.toLowerCase().endsWith('.pdf');
      const media  = isPdf ? 'application/pdf'
        : fp.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: isPdf ? 'document' : 'image', source: { type: 'base64', media_type: media, data: base64 } },
            { type: 'text', text: `Analyze this Bulgarian invoice carefully. Return ONLY a JSON object, nothing else, no markdown.

Extract these fields:
{
  "supplier_name": "Company name of the SELLER/supplier (latin letters, max 70 chars)",
  "supplier_eik": "EIK/Булстат number of supplier if visible",
  "supplier_iban": "IBAN for payment - copy EXACTLY digit by digit, no spaces",
  "supplier_bic": "BIC/SWIFT code or empty string",
  "invoice_number": "Invoice/фактура number",
  "invoice_date": "Date in YYYY-MM-DD format",
  "due_date": "Payment due date in YYYY-MM-DD format or empty",
  "amount_no_vat": numeric value without VAT (данъчна основа),
  "vat_amount": numeric VAT amount (стойност на ДДС),
  "amount_total": numeric total amount (сума за плащане) - THIS IS THE MOST IMPORTANT,
  "currency": "BGN or EUR",
  "description": "Service/product description in latin max 90 chars",
  "payment_method": "cash/bank transfer etc"
}

IMPORTANT RULES:
- The BUYER is Скай Кепитъл ООД or similar — supplier is the OTHER company
- For Bulgarian invoices: "Сума за плащане" = total amount to pay
- Copy IBAN digit by digit very carefully
- amount_total must be a NUMBER not a string
- If currency shows EUR but amount shows in лв — use BGN
- "Словом" field confirms the amount in words — use it to verify

IBAN EXTRACTION RULES - very important:
- Look for 'IBAN:' label on the invoice
- Copy EVERY digit and letter exactly, one by one
- Bulgarian IBANs start with BG and are exactly 22 characters
- After extracting, count the characters - must be exactly 22
- Common OCR errors: 0 vs O, 1 vs I, 3 vs 8, 4 vs 9
- Double-check by re-reading the IBAN from the image` }
          ]
        }]
      });

      let raw = response.content.map(c => c.text||'').join('').trim();
      const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
      if (s === -1 || e === -1) throw new Error('No JSON in response');
      const raw_data = JSON.parse(raw.slice(s, e+1));

      // Normalize AI output to unified format expected by applyParsedData
      const data = {
        supplier_name: raw_data.supplier_name || '',
        supplier_iban: (raw_data.supplier_iban || '').replace(/\s/g, '').toUpperCase(),
        supplier_bic:  (raw_data.supplier_bic  || '').replace(/\s/g, '').toUpperCase(),
        supplier_eik:  raw_data.supplier_eik   || '',
        amount:        raw_data.amount_total ?? raw_data.amount ?? 0,
        amount_no_vat: raw_data.amount_no_vat ?? null,
        vat_amount:    raw_data.vat_amount    ?? null,
        currency:      raw_data.currency || 'BGN',
        invoice_number: raw_data.invoice_number || '',
        invoice_date:   raw_data.invoice_date   || '',
        due_date:       raw_data.due_date       || '',
        description:    raw_data.description    || '',
        reason: [raw_data.description, raw_data.invoice_number]
          .filter(Boolean).join(' | ').slice(0, 90) || 'PAYMENT',
        source_format: 'ai',
      };

      let sourceNote = 'AI parsed (Claude)';
      if (data.supplier_iban && !validateIBAN(data.supplier_iban)) {
        sourceNote += '; ⚠ IBAN невалиден';
      }

      const result = applyParsedData(db, id, data, sourceNote);
      results.push(result);
    } catch(err) {
      db.prepare("UPDATE expense_invoices SET status='error', ai_notes=? WHERE id=?")
        .run(String(err.message).slice(0, 500), id);
      results.push({ id, status: 'error', error: err.message });
    }
  }
  return results;
}

// ── Module export ─────────────────────────────────────────────
module.exports = function(db) {
  const expRouter  = express.Router();
  const cpRouter   = express.Router();
  const upload     = multer({ storage: makeStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // лимит срещу DoS

  // ═══ EXPENSES ═══════════════════════════════════════════════

  // POST /upload?source=e-invoice (default 'manual')
  expRouter.post('/upload', upload.array('files'), orgContext, (req, res) => {
    if (!req.files?.length) return res.status(400).json({ error: 'No files' });
    const source = (req.query.source || req.body.source || 'manual').slice(0, 30);
    const now = new Date();
    const месец = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const inserted = req.files.map(f => {
      let orig;
      try { orig = Buffer.from(f.originalname, 'latin1').toString('utf8'); } catch(_) { orig = f.originalname; }
      const r = db.prepare(
        'INSERT INTO expense_invoices (filename, filepath, status, месец, source) VALUES (?, ?, ?, ?, ?)'
      ).run(orig, f.path, 'pending', месец, source);
      return { id: r.lastInsertRowid, filename: orig, status: 'pending', месец, source };
    });
    res.json({ uploaded: inserted });
  });

  // POST /bulk-import — upload + immediately trigger AI extract (for Playwright/e-invoice automation)
  // Returns { uploaded: [...], extracted: [...] }
  expRouter.post('/bulk-import', upload.array('files'), orgContext, async (req, res) => {
    if (!req.files?.length) return res.status(400).json({ error: 'No files' });
    const source = (req.query.source || req.body.source || 'e-invoice').slice(0, 30);
    const now = new Date();
    const месец = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    const uploaded = req.files.map(f => {
      let orig;
      try { orig = Buffer.from(f.originalname, 'latin1').toString('utf8'); } catch(_) { orig = f.originalname; }
      const r = db.prepare(
        'INSERT INTO expense_invoices (filename, filepath, status, месец, source) VALUES (?, ?, ?, ?, ?)'
      ).run(orig, f.path, 'pending', месец, source);
      return { id: r.lastInsertRowid, filename: orig };
    });

    // Auto-trigger AI extract for all uploaded files
    const ids = uploaded.map(u => u.id);
    try {
      const ext = await runAiExtract(db, ids);
      res.json({ uploaded, extracted: ext, source });
    } catch (err) {
      // If AI fails, still return uploaded so files are not lost
      res.json({ uploaded, extracted: [], error: err.message, source });
    }
  });

  // POST /manual — ръчен разход (в брой / касова бележка)
  expRouter.post('/manual', (req, res) => {
    try {
      const { supplier_name, amount, currency, reason, property_id, expense_category, месец, payment_type, notes } = req.body;
      if (!amount || !payment_type) return res.status(400).json({ error: 'amount и payment_type са задължителни' });
      const now = new Date();
      const ефМесец = месец || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const r = db.prepare(`
        INSERT INTO expense_invoices
          (filename, status, supplier_name, amount, currency, reason, property_id, expense_category, месец, payment_type, ai_notes, paid, paid_date)
        VALUES (?, 'done', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        payment_type === 'в брой' ? '💵 В брой' : '🧾 Касова бележка',
        supplier_name || '',
        Number(amount),
        currency || (ефМесец >= '2026-01' ? 'EUR' : 'BGN'),
        reason || '',
        property_id || null,
        expense_category || 'друго',
        ефМесец,
        payment_type,
        notes || null,
        now.toISOString().slice(0,10)
      );
      res.status(201).json({ id: r.lastInsertRowid, ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /extract-ai  { ids: [1,2,3] }
  expRouter.post('/extract-ai', async (req, res) => {
    const { ids } = req.body || {};
    if (!ids?.length) return res.status(400).json({ error: 'ids required' });
    try {
      const results = await runAiExtract(db, ids);
      return res.json({ results });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /?month=&category=&paid=&scope=
  // scope: 'business' (default), 'personal', 'all'. Legacy NULL = business.
  expRouter.get('/', (req, res) => {
    const { month, category, paid, scope } = req.query;
    let sql = 'SELECT * FROM expense_invoices WHERE 1=1';
    const p = [];
    const requestedScope = (scope || 'business').toLowerCase();
    if (requestedScope === 'business')      { sql += " AND (scope IS NULL OR scope='business')"; }
    else if (requestedScope === 'personal') { sql += " AND scope='personal'"; }
    // 'all' → no scope filter
    if (month)                    { sql += ' AND месец = ?';            p.push(month); }
    if (category)                 { sql += ' AND expense_category = ?'; p.push(category); }
    if (paid !== undefined && paid !== '') {
      sql += ' AND paid = ?';
      p.push(paid === 'true' || paid === '1' ? 1 : 0);
    }
    sql += ' ORDER BY created_at DESC';
    res.json(db.prepare(sql).all(...p));
  });

  // PUT /:id
  expRouter.put('/:id', (req, res) => {
    const { supplier_name, supplier_iban, supplier_bic, amount, currency, reason, property_id, expense_category, месец, scope } = req.body;
    const existing = db.prepare('SELECT scope FROM expense_invoices WHERE id=?').get(req.params.id);
    const finalScope = scope !== undefined ? scope : (existing?.scope || 'business');
    db.prepare(`UPDATE expense_invoices SET
      supplier_name=?, supplier_iban=?, supplier_bic=?, amount=?, currency=?,
      reason=?, property_id=?, expense_category=?, месец=?, scope=?, status='done' WHERE id=?`
    ).run(supplier_name, supplier_iban, supplier_bic, amount, currency, reason, property_id||null, expense_category, месец, finalScope, req.params.id);
    res.json({ ok: true });
  });

  // PUT /:id/paid
  expRouter.put('/:id/paid', (req, res) => {
    const { paid, paid_date } = req.body;
    db.prepare('UPDATE expense_invoices SET paid=?, paid_date=? WHERE id=?')
      .run(paid ? 1 : 0, paid_date||null, req.params.id);
    res.json({ ok: true });
  });

  // POST /export-xml
  expRouter.post('/export-xml', (req, res) => {
    const { ids, payer_iban, exec_date, format } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids required' });

    const invoices = ids
      .map(id => db.prepare('SELECT * FROM expense_invoices WHERE id = ?').get(id))
      .filter(Boolean);
    if (!invoices.length) return res.status(400).json({ error: 'No invoices' });

    const effPayer = payer_iban || PAYER_IBAN;
    const effDate  = exec_date  || new Date().toISOString().slice(0,10);
    const effFmt   = format     || 'BISERA6';

    const xml   = generateXML(invoices, effPayer, effDate, effFmt);
    const fname = `SKAYCAP_${effFmt}_${effDate.replace(/-/g,'')}.xml`;
    const total = invoices.reduce((s,i) => s+(i.amount||0), 0);

    db.prepare('INSERT INTO xml_exports (filename,format,payer_iban,invoice_ids,total_count,total_amount) VALUES (?,?,?,?,?,?)')
      .run(fname, effFmt, effPayer, JSON.stringify(ids), invoices.length, total);
    for (const id of ids)
      db.prepare('UPDATE expense_invoices SET xml_exported=1 WHERE id=?').run(id);

    res.set('Content-Type', 'application/xml');
    res.set('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(xml);
  });

  // GET /summary?month=
  expRouter.get('/summary', (req, res) => {
    try {
      const { month } = req.query;
      const p  = month ? [month] : [];
      const mf = month ? 'AND месец = ?' : '';      // month filter for simple queries
      const mfe = month ? 'AND ei.месец = ?' : '';  // month filter for joined queries

      const INVEST_CATS = `('инвестиция', 'благородни метали')`
      const NON_OPEX    = `('инвестиция', 'благородни метали', 'ремонт', 'ремонт д')`
      // Бизнес метриките винаги изключват личните разходи. Legacy NULL = business.
      const BIZ        = `(scope IS NULL OR scope='business')`
      const BIZ_EI     = `(ei.scope IS NULL OR ei.scope='business')`

      // Operational totals (excluding инвестиция, благородни метали, ремонт)
      const totals = db.prepare(`
        SELECT
          SUM(CASE WHEN currency='BGN' THEN amount ELSE 0 END) as total_bgn,
          SUM(CASE WHEN currency='EUR' THEN amount ELSE 0 END) as total_eur,
          COUNT(*) as count,
          SUM(paid) as paid_count,
          SUM(CASE WHEN paid=1 THEN amount ELSE 0 END) as paid_amount,
          SUM(CASE WHEN paid=0 THEN amount ELSE 0 END) as unpaid_amount
        FROM expense_invoices
        WHERE ${BIZ} AND (expense_category IS NULL OR expense_category NOT IN ${NON_OPEX}) ${mf}`).get(...p);

      // Investment totals (инвестиция + благородни метали)
      const investTotals = db.prepare(`
        SELECT
          SUM(CASE WHEN currency='BGN' THEN amount ELSE 0 END) as total_bgn,
          SUM(CASE WHEN currency='EUR' THEN amount ELSE 0 END) as total_eur,
          COUNT(*) as count
        FROM expense_invoices
        WHERE ${BIZ} AND expense_category IN ${INVEST_CATS} ${mf}`).get(...p);

      // Investment items list
      const investItems = db.prepare(`
        SELECT ei.id, ei.reason, ei.supplier_name, ei.amount, ei.currency,
               ei.месец, ei.property_id, ei.paid, ei.paid_date, p.адрес
        FROM expense_invoices ei
        LEFT JOIN properties p ON p.id = ei.property_id
        WHERE ${BIZ_EI} AND ei.expense_category IN ${INVEST_CATS} ${mfe}
        ORDER BY ei.месец DESC`).all(...p);

      // Renovation totals
      const renovTotals = db.prepare(`
        SELECT
          SUM(CASE WHEN currency='BGN' THEN amount ELSE 0 END) as total_bgn,
          SUM(CASE WHEN currency='EUR' THEN amount ELSE 0 END) as total_eur,
          COUNT(*) as count
        FROM expense_invoices
        WHERE ${BIZ} AND expense_category = 'ремонт' ${mf}`).get(...p);

      // Renovation D totals (external / non-business)
      const renovDTotals = db.prepare(`
        SELECT
          SUM(CASE WHEN currency='BGN' THEN amount ELSE 0 END) as total_bgn,
          SUM(CASE WHEN currency='EUR' THEN amount ELSE 0 END) as total_eur,
          COUNT(*) as count
        FROM expense_invoices
        WHERE ${BIZ} AND expense_category = 'ремонт д' ${mf}`).get(...p);

      // Operational by category (expense_category + currency + total)
      const byCategory = db.prepare(`
        SELECT
          expense_category,
          currency,
          SUM(amount) as total,
          COUNT(*) as count,
          SUM(CASE WHEN paid=1 THEN amount ELSE 0 END) as paid_amount,
          SUM(CASE WHEN paid=1 THEN 1 ELSE 0 END) as paid_count
        FROM expense_invoices
        WHERE ${BIZ} AND (expense_category IS NULL OR expense_category NOT IN ${NON_OPEX}) ${mf}
        GROUP BY expense_category, currency`).all(...p);

      // By property (operational only, with currency)
      const byProperty = db.prepare(`
        SELECT ei.property_id, p.адрес, ei.currency, SUM(ei.amount) as total, COUNT(*) as count
        FROM expense_invoices ei
        LEFT JOIN properties p ON p.id = ei.property_id
        WHERE ei.property_id IS NOT NULL
          AND ${BIZ_EI}
          AND (ei.expense_category IS NULL OR ei.expense_category NOT IN ${NON_OPEX}) ${mfe}
        GROUP BY ei.property_id, ei.currency`).all(...p);

      res.json({
        ...totals,
        invest: { ...investTotals, items: investItems },
        renov: renovTotals,
        renovD: renovDTotals,
        by_category: byCategory,
        by_property: byProperty
      });
    } catch (err) {
      console.error('GET /summary error:', err.message);
      res.json({ total_bgn: 0, total_eur: 0, count: 0, paid_count: 0, paid_amount: 0, unpaid_amount: 0, invest: { total_bgn:0, total_eur:0, count:0, items:[] }, by_category: [], by_property: [] });
    }
  });

  // ── Utility account mapping endpoints ──────────────────────

  // GET /unmapped-invoices — list invoices with utility_account_id but no property_id
  expRouter.get('/unmapped-invoices', (req, res) => {
    try {
      // Find invoices with utility info in ai_notes but no property_id
      const rows = db.prepare(`
        SELECT id, supplier_name, amount, currency, invoice_date, ai_notes
        FROM expense_invoices
        WHERE property_id IS NULL
          AND ai_notes LIKE '%Партиден%'
          AND ai_notes LIKE '%нужен mapping%'
        ORDER BY invoice_date DESC LIMIT 100
      `).all();
      res.json({ unmapped: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /:id/map-property  { property_id, utility_type, utility_account_id }
  // Saves the partiden number on the property + links current invoice + retroactively links matching others.
  expRouter.post('/:id/map-property', (req, res) => {
    try {
      const invId = parseInt(req.params.id);
      const { property_id, utility_type, utility_account_id } = req.body || {};
      if (!property_id || !utility_type || !utility_account_id) {
        return res.status(400).json({ error: 'property_id, utility_type, utility_account_id са задължителни' });
      }
      const prop = db.prepare('SELECT id, utility_accounts FROM properties WHERE id = ?').get(property_id);
      if (!prop) return res.status(404).json({ error: 'Имот не намерен' });

      // Update property.utility_accounts JSON
      let accounts = {};
      try { accounts = JSON.parse(prop.utility_accounts || '{}'); } catch (_) {}
      accounts[utility_type] = utility_account_id;
      db.prepare('UPDATE properties SET utility_accounts = ? WHERE id = ?').run(
        JSON.stringify(accounts), property_id
      );

      // Link current invoice
      db.prepare('UPDATE expense_invoices SET property_id = ? WHERE id = ?').run(property_id, invId);

      // Retroactive: find other invoices with this partiden number in ai_notes
      const others = db.prepare(`
        SELECT id FROM expense_invoices
        WHERE property_id IS NULL AND ai_notes LIKE ?
      `).all('%Партиден ' + utility_account_id + '%');
      let retroCount = 0;
      for (const o of others) {
        db.prepare('UPDATE expense_invoices SET property_id = ? WHERE id = ?').run(property_id, o.id);
        retroCount++;
      }

      res.json({ ok: true, retroactive_linked: retroCount, accounts });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /properties/:property_id/utility-history?utility_type=&period_from=&period_to=
  expRouter.get('/properties/:property_id/utility-history', (req, res) => {
    try {
      const pid = parseInt(req.params.property_id);
      const { utility_type, period_from, period_to } = req.query;
      let sql = 'SELECT * FROM property_utility_history WHERE property_id = ?';
      const params = [pid];
      if (utility_type)  { sql += ' AND utility_type = ?'; params.push(utility_type); }
      if (period_from)   { sql += ' AND period >= ?';      params.push(period_from); }
      if (period_to)     { sql += ' AND period <= ?';      params.push(period_to); }
      sql += ' ORDER BY period DESC, utility_type';
      const rows = db.prepare(sql).all(...params);
      // Parse consumption_data JSON for convenience
      const parsed = rows.map(r => ({
        ...r,
        consumption_data: (() => { try { return JSON.parse(r.consumption_data || '{}'); } catch { return {}; } })()
      }));
      res.json({ history: parsed });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /clear-uploaded — delete uploaded PDF invoices, keep cash/receipt and investment ones
  // GET /clear-uploaded/preview — show what would be deleted (for debugging)
  expRouter.get('/clear-uploaded/preview', (req, res) => {
    const all = db.prepare('SELECT id, payment_type, expense_category, supplier_name, amount FROM expense_invoices').all();
    res.json({ total: all.length, records: all.slice(0, 50) });
  });

  expRouter.post('/clear-uploaded', (req, res) => {
    try {
      // Get files to delete first (for unlinking)
      const withFiles = db.prepare(
        'SELECT id, filepath FROM expense_invoices WHERE filepath IS NOT NULL AND filepath != ?'
      ).all('');
      for (const inv of withFiles) {
        try { fs.unlinkSync(inv.filepath); } catch(_) {}
      }
      // Delete all expense_invoices that are NOT manual cash entries and NOT investments
      // Keep only: payment_type containing 'брой' or 'бележка', or expense_category = 'инвестиция'
      const all = db.prepare('SELECT id, payment_type, expense_category FROM expense_invoices').all();
      let deleted = 0;
      for (const inv of all) {
        const pt = (inv.payment_type || '').toLowerCase();
        const cat = (inv.expense_category || '').toLowerCase();
        const isCash = pt.includes('брой') || pt.includes('бележка');
        const isInvest = cat.includes('инвест');
        if (!isCash && !isInvest) {
          db.prepare('DELETE FROM expense_invoices WHERE id = ?').run(inv.id);
          deleted++;
        }
      }
      res.json({ ok: true, deleted });
    } catch(err) {
      console.error('clear-uploaded error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /convert-bgn-eur — convert pre-2026 BGN invoices to EUR at fixed rate 1.95583
  expRouter.post('/convert-bgn-eur', (req, res) => {
    try {
      const BGN_RATE = 1.95583;
      const preview = db.prepare(
        "SELECT COUNT(*) as cnt, SUM(amount) as total FROM expense_invoices WHERE currency='BGN' AND (месец IS NULL OR месец < '2026-01')"
      ).get();
      const result = db.prepare(
        "UPDATE expense_invoices SET amount=ROUND(amount/?,2), currency='EUR' WHERE currency='BGN' AND (месец IS NULL OR месец < '2026-01')"
      ).run(BGN_RATE);
      res.json({ ok: true, updated: result.changes, preview_count: preview.cnt, preview_total_bgn: preview.total });
    } catch(err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /:id
  expRouter.delete('/:id', (req, res) => {
    const inv = db.prepare('SELECT filepath FROM expense_invoices WHERE id = ?').get(req.params.id);
    if (inv?.filepath) { try { fs.unlinkSync(inv.filepath); } catch(_) {} }
    db.prepare('DELETE FROM expense_invoices WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ═══ COUNTERPARTIES ══════════════════════════════════════════

  cpRouter.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM counterparties ORDER BY name').all());
  });

  cpRouter.post('/', (req, res) => {
    const { name, iban, bic, currency } = req.body;
    if (!name || !iban) return res.status(400).json({ error: 'name and iban required' });
    const r = db.prepare(
      'INSERT INTO counterparties (name, iban, bic, currency) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET iban=excluded.iban, bic=excluded.bic, currency=excluded.currency'
    ).run(name, iban.replace(/\s/g,'').toUpperCase(), (bic||'').toUpperCase(), currency||'BGN');
    res.json({ ok: true, id: r.lastInsertRowid });
  });

  cpRouter.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM counterparties WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return { expRouter, cpRouter };
};
