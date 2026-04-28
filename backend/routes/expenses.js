const express = require('express');
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

// ── Module export ─────────────────────────────────────────────
module.exports = function(db) {
  const expRouter  = express.Router();
  const cpRouter   = express.Router();
  const upload     = multer({ storage: makeStorage() });

  // ═══ EXPENSES ═══════════════════════════════════════════════

  // POST /upload
  expRouter.post('/upload', upload.array('files'), (req, res) => {
    if (!req.files?.length) return res.status(400).json({ error: 'No files' });
    const now = new Date();
    const месец = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const inserted = req.files.map(f => {
      let orig;
      try { orig = Buffer.from(f.originalname, 'latin1').toString('utf8'); } catch(_) { orig = f.originalname; }
      const r = db.prepare(
        'INSERT INTO expense_invoices (filename, filepath, status, месец) VALUES (?, ?, ?, ?)'
      ).run(orig, f.path, 'pending', месец);
      return { id: r.lastInsertRowid, filename: orig, status: 'pending', месец };
    });
    res.json({ uploaded: inserted });
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
        currency || 'EUR',
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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'ANTHROPIC_API_KEY not set' });

    let Anthropic;
    try { Anthropic = require('@anthropic-ai/sdk'); }
    catch(e) { return res.status(500).json({ error: '@anthropic-ai/sdk not installed: ' + e.message }); }

    const client = new Anthropic.default({ apiKey });
    const results = [];

    for (const id of ids) {
      const inv = db.prepare('SELECT * FROM expense_invoices WHERE id = ?').get(id);
      if (!inv) { results.push({ id, error: 'Not found' }); continue; }
      if (inv.status === 'done') { results.push({ id, status: 'skipped' }); continue; }

      db.prepare("UPDATE expense_invoices SET status = 'processing' WHERE id = ?").run(id);

      try {
        const fp = inv.filepath;
        if (!fp || !fs.existsSync(fp)) throw new Error('File missing: ' + fp);

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

        // Normalize: map new fields to internal schema
        const data = {
          supplier_name: raw_data.supplier_name || '',
          supplier_iban: raw_data.supplier_iban || '',
          supplier_bic:  raw_data.supplier_bic  || '',
          // amount_total takes priority over amount
          amount:   raw_data.amount_total ?? raw_data.amount ?? 0,
          currency: raw_data.currency || 'BGN',
          // build reason from description + invoice_number
          reason: [raw_data.description, raw_data.invoice_number]
            .filter(Boolean).join(' | ').slice(0, 90) || 'PAYMENT',
          // extra fields stored in ai_notes
          _extra: {
            eik:          raw_data.supplier_eik    || '',
            invoice_no:   raw_data.invoice_number  || '',
            invoice_date: raw_data.invoice_date    || '',
            due_date:     raw_data.due_date        || '',
            amount_no_vat:raw_data.amount_no_vat   ?? null,
            vat_amount:   raw_data.vat_amount      ?? null,
          },
        };

        let iban = (data.supplier_iban||'').replace(/\s/g,'').toUpperCase();
        let bic  = (data.supplier_bic||'').replace(/\s/g,'').toUpperCase();
        let note = '';

        // Match counterparties
        if (data.supplier_name) {
          const cp = db.prepare(
            "SELECT * FROM counterparties WHERE LOWER(name) LIKE ?"
          ).get('%' + data.supplier_name.toLowerCase().slice(0,10) + '%');
          if (cp) {
            const ocrIban = iban;
            iban = cp.iban || iban;
            bic  = cp.bic  || bic;
            note = ocrIban && ocrIban !== cp.iban
              ? `Контрагент от база (OCR IBAN: ${ocrIban})`
              : 'Контрагент от база';
          }
        }

        if (!validateIBAN(iban) && iban) note = (note ? note+'; ' : '') + '⚠ IBAN невалиден';

        // Auto-save new valid counterparty
        if (validateIBAN(iban) && data.supplier_name && iban) {
          const ex = db.prepare('SELECT id FROM counterparties WHERE iban = ?').get(iban);
          if (!ex) db.prepare('INSERT OR IGNORE INTO counterparties (name, iban, bic, currency) VALUES (?, ?, ?, ?)').run(
            data.supplier_name, iban, bic, data.currency || 'BGN'
          );
        }

        const extraNote = [
          note,
          data._extra.invoice_no   ? `Фактура: ${data._extra.invoice_no}`     : '',
          data._extra.invoice_date ? `Дата: ${data._extra.invoice_date}`       : '',
          data._extra.due_date     ? `Падеж: ${data._extra.due_date}`          : '',
          data._extra.eik          ? `ЕИК: ${data._extra.eik}`                 : '',
          data._extra.amount_no_vat != null ? `Основа: ${data._extra.amount_no_vat}` : '',
          data._extra.vat_amount   != null  ? `ДДС: ${data._extra.vat_amount}`       : '',
        ].filter(Boolean).join(' | ').slice(0, 500) || null;

        db.prepare(`UPDATE expense_invoices SET
          status='done', supplier_name=?, supplier_iban=?, supplier_bic=?,
          amount=?, currency=?, reason=?, ai_notes=?,
          invoice_number=?, invoice_date=?, supplier_eik=?, amount_no_vat=?, vat_amount=?
          WHERE id=?`
        ).run(
          data.supplier_name, iban, bic,
          data.amount, data.currency||'BGN', data.reason, extraNote,
          data._extra.invoice_no   || null,
          data._extra.invoice_date || null,
          data._extra.eik          || null,
          data._extra.amount_no_vat ?? null,
          data._extra.vat_amount    ?? null,
          id
        );

        results.push({ id, status: 'done', supplier_name: data.supplier_name, amount: data.amount });
      } catch(err) {
        db.prepare("UPDATE expense_invoices SET status='error', ai_notes=? WHERE id=?")
          .run(err.message.slice(0,200), id);
        results.push({ id, status: 'error', error: err.message });
      }
    }
    res.json({ results });
  });

  // GET /?month=&category=&paid=
  expRouter.get('/', (req, res) => {
    const { month, category, paid } = req.query;
    let sql = 'SELECT * FROM expense_invoices WHERE 1=1';
    const p = [];
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
    const { supplier_name, supplier_iban, supplier_bic, amount, currency, reason, property_id, expense_category, месец } = req.body;
    db.prepare(`UPDATE expense_invoices SET
      supplier_name=?, supplier_iban=?, supplier_bic=?, amount=?, currency=?,
      reason=?, property_id=?, expense_category=?, месец=?, status='done' WHERE id=?`
    ).run(supplier_name, supplier_iban, supplier_bic, amount, currency, reason, property_id||null, expense_category, месец, req.params.id);
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

      // Operational totals (excluding инвестиция)
      const totals = db.prepare(`
        SELECT
          SUM(CASE WHEN currency='BGN' THEN amount ELSE 0 END) as total_bgn,
          SUM(CASE WHEN currency='EUR' THEN amount ELSE 0 END) as total_eur,
          COUNT(*) as count,
          SUM(paid) as paid_count,
          SUM(CASE WHEN paid=1 THEN amount ELSE 0 END) as paid_amount,
          SUM(CASE WHEN paid=0 THEN amount ELSE 0 END) as unpaid_amount
        FROM expense_invoices
        WHERE (expense_category IS NULL OR expense_category != 'инвестиция') ${mf}`).get(...p);

      // Investment totals
      const investTotals = db.prepare(`
        SELECT
          SUM(CASE WHEN currency='BGN' THEN amount ELSE 0 END) as total_bgn,
          SUM(CASE WHEN currency='EUR' THEN amount ELSE 0 END) as total_eur,
          COUNT(*) as count
        FROM expense_invoices
        WHERE expense_category = 'инвестиция' ${mf}`).get(...p);

      // Investment items list
      const investItems = db.prepare(`
        SELECT ei.id, ei.reason, ei.supplier_name, ei.amount, ei.currency,
               ei.месец, ei.property_id, ei.paid, ei.paid_date, p.адрес
        FROM expense_invoices ei
        LEFT JOIN properties p ON p.id = ei.property_id
        WHERE ei.expense_category = 'инвестиция' ${mfe}
        ORDER BY ei.месец DESC`).all(...p);

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
        WHERE (expense_category IS NULL OR expense_category != 'инвестиция') ${mf}
        GROUP BY expense_category, currency`).all(...p);

      // By property (operational only, with currency)
      const byProperty = db.prepare(`
        SELECT ei.property_id, p.адрес, ei.currency, SUM(ei.amount) as total, COUNT(*) as count
        FROM expense_invoices ei
        LEFT JOIN properties p ON p.id = ei.property_id
        WHERE ei.property_id IS NOT NULL
          AND (ei.expense_category IS NULL OR ei.expense_category != 'инвестиция') ${mfe}
        GROUP BY ei.property_id, ei.currency`).all(...p);

      res.json({
        ...totals,
        invest: { ...investTotals, items: investItems },
        by_category: byCategory,
        by_property: byProperty
      });
    } catch (err) {
      console.error('GET /summary error:', err.message);
      res.json({ total_bgn: 0, total_eur: 0, count: 0, paid_count: 0, paid_amount: 0, unpaid_amount: 0, invest: { total_bgn:0, total_eur:0, count:0, items:[] }, by_category: [], by_property: [] });
    }
  });

  // POST /clear-uploaded — delete uploaded PDF invoices, keep cash/receipt and investment ones
  expRouter.post('/clear-uploaded', (req, res) => {
    try {
      // Keep: payment_type IN ('в брой','касова бележка','банков_импорт') OR expense_category = 'инвестиция'
      // Delete: everything else (uploaded PDFs with payment_type='фактура' or NULL)
      const all = db.prepare('SELECT id, filepath, payment_type, expense_category FROM expense_invoices').all();
      const keepTypes = new Set(['\u0432 \u0431\u0440\u043e\u0439', '\u043a\u0430\u0441\u043e\u0432\u0430 \u0431\u0435\u043b\u0435\u0436\u043a\u0430', '\u0431\u0430\u043d\u043a\u043e\u0432_\u0438\u043c\u043f\u043e\u0440\u0442']);
      const toDelete = all.filter(inv =>
        !keepTypes.has(inv.payment_type) && inv.expense_category !== '\u0438\u043d\u0432\u0435\u0441\u0442\u0438\u0446\u0438\u044f'
      );
      let deleted = 0;
      for (const inv of toDelete) {
        if (inv.filepath) { try { fs.unlinkSync(inv.filepath); } catch(_) {} }
        db.prepare('DELETE FROM expense_invoices WHERE id = ?').run(inv.id);
        deleted++;
      }
      res.json({ ok: true, deleted });
    } catch(err) {
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
