const express = require('express');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nodemailer = require('nodemailer');

const FONT_REGULAR = path.join(__dirname, '../fonts/arial.ttf');
const FONT_BOLD    = path.join(__dirname, '../fonts/arialbd.ttf');
const PDF_DIR      = path.join(__dirname, '../data/contracts');
const LOGO_DIR     = path.join(__dirname, '../data/logos');
const DEFAULT_LOGO = path.join(LOGO_DIR, 'sky_capital_logo.png');
[PDF_DIR, LOGO_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, file.fieldname === 'logo' ? LOGO_DIR : PDF_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'));
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function fmtDate(d) {
  if (!d) return '..................';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()} г.`;
}

function nextContractNumber(db) {
  const year = new Date().getFullYear();
  const key  = `contract_counter_${year}`;
  const row  = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  const next = row ? parseInt(row.value) + 1 : 1;
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key, String(next));
  return `${year}-${String(next).padStart(3,'0')}`;
}

function getSmtp(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='smtp'").get();
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

function getIssuer(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='issuer'").get();
  if (!row) return {};
  try { return JSON.parse(row.value); } catch { return {}; }
}

// Substitute {{PLACEHOLDER}} in template text
function fillTemplate(template, fields) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    return fields[key.trim()] !== undefined ? fields[key.trim()] : `{{${key}}}`;
  });
}

// Build field map from contract data
function buildFields(contract, issuer) {
  const isCompany = contract.landlord_type === 'дружество';

  // Landlord composite blocks — BG and EN depending on type
  const landlordDataBG = isCompany
    ? `Скай Кепитъл ООД, ЕИК ${contract.landlord_egn || issuer.eik || '...'}, МОЛ: Иво Лазаров Лазаров, с адрес ${contract.landlord_address || issuer.address || ''}`
    : `${contract.landlord_name || issuer.name || ''}, ЕГН ${contract.landlord_egn || issuer.eik || ''}, ЛК № ${contract.landlord_lk || '...'}, издадена на ${contract.landlord_lk_date || '...'} год. с адрес ${contract.landlord_address || issuer.address || ''}`;

  const landlordDataEN = isCompany
    ? `Sky Capital OOD, Company Registration No. ${contract.landlord_egn || issuer.eik || '...'}, Manager: Ivo Lazarov Lazarov, address ${contract.landlord_address || issuer.address || ''}`
    : `Ivo Lazarov Lazarov, (the name as written in the Identity Card), Personal Identification No. ${contract.landlord_egn || issuer.eik || ''} Identity Card No. ${contract.landlord_lk || '...'}, issued on ${contract.landlord_lk_date || '...'}, address ${contract.landlord_address || issuer.address || ''}`;

  const landlordSignBG = isCompany ? 'Sky Capital OOD / Скай Кепитъл ООД\nМОЛ: Иво Лазаров Лазаров' : (contract.landlord_name || issuer.name || '');
  const landlordSignEN = isCompany ? 'Sky Capital OOD\nManager: Ivo Lazarov Lazarov' : 'Ivo Lazarov Lazarov';

  return {
    'ДОГОВОР_НОМЕР':          contract.contract_number || '',
    'ДАТА_ДНЕС':              fmtDate(contract.created_at || new Date()),
    'ДАТА_НАЧАЛО':            fmtDate(contract.start_date),
    'ДАТА_КРАЙ':              contract.end_date ? fmtDate(contract.end_date) : 'безсрочен / indefinite',
    'ДАТА_ПРЕДАВАНЕ':         fmtDate(contract.delivery_date || contract.start_date),
    'НАЕМОДАТЕЛ_ДАННИ_BG':    landlordDataBG,
    'НАЕМОДАТЕЛ_ДАННИ_EN':    landlordDataEN,
    'НАЕМОДАТЕЛ_ПОДПИС_BG':   landlordSignBG,
    'НАЕМОДАТЕЛ_ПОДПИС_EN':   landlordSignEN,
    'НАЕМОДАТЕЛ_ИМЕ':         contract.landlord_name    || issuer.name    || '',
    'НАЕМОДАТЕЛ_АДРЕС':       contract.landlord_address || issuer.address || '',
    'НАЕМОДАТЕЛ_ЕГН':         contract.landlord_egn     || issuer.eik    || '',
    'НАЕМОДАТЕЛ_ЛК':          contract.landlord_lk      || '',
    'НАЕМОДАТЕЛ_ЛК_ДАТА':     contract.landlord_lk_date || '',
    'НАЕМОДАТЕЛ_ТЕЛЕФОН':     contract.landlord_phone   || '',
    'НАЕМОДАТЕЛ_ИМЕЙЛ':       issuer.email              || '',
    'НАЕМОДАТЕЛ_МОЛ':         issuer.mol                || '',
    'НАЕМОДАТЕЛ_IBAN':        issuer.iban               || '',
    'НАЕМАТЕЛ_ИМЕ':           contract.tenant_name      || '',
    'НАЕМАТЕЛ_АДРЕС':         contract.tenant_address   || '',
    'НАЕМАТЕЛ_ЕГН':           contract.tenant_egn       || '',
    'НАЕМАТЕЛ_МОЛ':           contract.tenant_mol       || '',
    'НАЕМАТЕЛ_ДОКУМЕНТ':      contract.tenant_doc       || '',
    'НАЕМАТЕЛ_ДОКУМЕНТ_ДАТА': contract.tenant_doc_date  || '',
    'НАЕМАТЕЛ_ДОКУМЕНТ_СТРАНА': contract.tenant_doc_country || '',
    'НАЕМАТЕЛ_РОДЕН':         contract.tenant_dob       || '',
    'НАЕМАТЕЛ_ТЕЛЕФОН':       contract.tenant_phone     || '',
    'НАЕМАТЕЛ_ИМЕЙЛ':         contract.tenant_email     || '',
    'АБОНАТ_ТОК':             contract.абонат_ток  || '..................',
    'АБОНАТ_ВОДА':            contract.абонат_вода || '..................',
    'АБОНАТ_ТЕЦ':             contract.абонат_тец  || '..................',
    'АБОНАТ_ВХОД':            contract.абонат_вход || '..................',
    'ИМОТ_АДРЕС':             contract.property_address     || '',
    'ИМОТ_ОПИСАНИЕ':          contract.property_description || '',
    'ИМОТ_ПЛОЩ':              contract.property_area ? `${contract.property_area} кв.м.` : '',
    'НАЕМ':                   Number(contract.monthly_rent || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    'ВАЛУТА':                 contract.currency || 'EUR',
    'ВАЛУТА_EN':              contract.currency || 'EUR',
    'НАЕМ_ДУМИ':              amountToWords(contract.monthly_rent),
    'ДЕПОЗИТ':                Number(contract.deposit || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    'ДЕПОЗИТ_ДУМИ':           amountToWords(contract.deposit),
    'ПАДЕЖ_ДЕН':              String(contract.payment_day || 5),
    'УСЛОВИЯ':                contract.conditions || '',
    'БЕЛЕЖКИ':                contract.notes || '',
  };
}

// Simple number-to-words for BGN/EUR amounts (basic)
function amountToWords(n) {
  if (!n) return 'нула';
  const num = Math.round(Number(n));
  const ones = ['','един','два','три','четири','пет','шест','седем','осем','девет',
                 'десет','единадесет','дванадесет','тринадесет','четиринадесет','петнадесет',
                 'шестнадесет','седемнадесет','осемнадесет','деветнадесет'];
  const tens = ['','','двадесет','тридесет','четиридесет','петдесет','шестдесет','седемдесет','осемдесет','деветдесет'];
  if (num < 20) return ones[num];
  if (num < 100) return tens[Math.floor(num/10)] + (num%10 ? ' и ' + ones[num%10] : '');
  if (num < 1000) {
    const h = Math.floor(num/100);
    const rest = num % 100;
    return (h === 1 ? 'сто' : h === 2 ? 'двеста' : ones[h] + 'ста') + (rest ? ' ' + amountToWords(rest) : '');
  }
  return String(num);
}

// Generate PDF from template text
function generateContractPDF(contract, template, issuer) {
  return new Promise((resolve, reject) => {
    const filename = `contract_${contract.contract_number.replace(/[^a-zA-Z0-9]/g,'-')}.pdf`;
    const filepath = path.join(PDF_DIR, filename);

    const fields  = buildFields(contract, issuer);
    const filled  = fillTemplate(template.content, fields);
    const lines   = filled.split('\n');

    const ML = 50;
    const MR = 50;
    const HEADER_H = 100; // height reserved for letterhead
    const FOOTER_H = 45;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: HEADER_H, bottom: FOOTER_H + 10, left: ML, right: MR },
      autoFirstPage: true,
      bufferPages: false
    });
    const ws  = fs.createWriteStream(filepath);
    doc.pipe(ws);
    doc.registerFont('R', FONT_REGULAR);
    doc.registerFont('B', FONT_BOLD);

    const PW = doc.page.width - ML - MR;       // printable width
    const PH = doc.page.height;

    // Resolve logo
    const resolvedLogo = (() => {
      if (template.logo_path) {
        const p = path.join(LOGO_DIR, template.logo_path);
        if (fs.existsSync(p)) return p;
      }
      if (fs.existsSync(DEFAULT_LOGO)) return DEFAULT_LOGO;
      return null;
    })();

    let pageNum = 0;
    let inHeader = false;

    // Draw letterhead header on every page (pure absolute positioning, no flow)
    function drawPageHeader() {
      if (inHeader) return;
      inHeader = true;
      pageNum++;
      const W = doc.page.width;

      // Logo — left
      if (resolvedLogo) {
        try { doc.image(resolvedLogo, ML, 8, { height: 68, fit: [175, 68] }); } catch(_) {}
      }

      // Company info — right (each line at fixed y, no flow)
      const infoX = W - MR - 210;
      const infoW = 210;
      const infoRows = [
        { text: issuer.name || 'Sky Capital OOD', bold: true,  y: 12 },
        issuer.eik     ? { text: `ЕИК: ${issuer.eik}`,    bold: false, y: 24 } : null,
        issuer.address ? { text: issuer.address,           bold: false, y: 35 } : null,
        issuer.email   ? { text: issuer.email,             bold: false, y: 46 } : null,
        issuer.iban    ? { text: `IBAN: ${issuer.iban}`,   bold: false, y: 57 } : null,
      ].filter(Boolean);

      infoRows.forEach(({ text, bold, y }) => {
        doc.save();
        doc.font(bold ? 'B' : 'R').fontSize(bold ? 8 : 7).fillColor(bold ? '#111827' : '#4b5563');
        // Clip to prevent overflow into logo area
        doc.rect(infoX, y, infoW, 12).clip();
        doc.text(text, infoX, y, { width: infoW, align: 'right', lineBreak: false });
        doc.restore();
      });

      // Blue separator line
      doc.moveTo(ML, 82).lineTo(W - MR, 82).lineWidth(2).strokeColor('#4AABCC').stroke();

      // Footer — draw in bottom margin area, temporarily disable bottom margin check
      const fy = PH - 32;
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.moveTo(ML, fy).lineTo(W - MR, fy).lineWidth(0.4).strokeColor('#d1d5db').stroke();
      doc.font('R').fontSize(7).fillColor('#9ca3af');
      doc.text(issuer.name || 'Sky Capital OOD', ML, fy + 6, { width: PW / 2, lineBreak: false });
      doc.text(`${pageNum}`, ML, fy + 6, { width: PW, align: 'right', lineBreak: false });
      doc.page.margins.bottom = savedBottom;

      // Force cursor to content start — both x AND y
      doc.y = HEADER_H;
      doc.x = ML;
      inHeader = false;
    }

    // Call drawPageHeader on every page (including PDFKit auto-created pages)
    doc.on('pageAdded', () => { drawPageHeader(); });

    // First page header (autoFirstPage created it before we registered the event)
    drawPageHeader();

    // Render one template line — always passes explicit x so cursor never drifts
    function renderLine(line) {
      const cy = doc.y; // capture y before rendering

      if (line.startsWith('###')) {
        doc.font('B').fontSize(9.5).fillColor('#374151')
           .text(line.replace(/^#+\s*/, ''), ML, cy, { width: PW });
        doc.moveDown(0.3);

      } else if (line.startsWith('##')) {
        doc.moveDown(0.4);
        doc.font('B').fontSize(10.5).fillColor('#0e3d52')
           .text(line.replace(/^#+\s*/, '').toUpperCase(), ML, doc.y, { width: PW });
        doc.moveTo(ML, doc.y + 2).lineTo(ML + PW, doc.y + 2)
           .lineWidth(0.6).strokeColor('#4AABCC').stroke();
        doc.moveDown(0.5);

      } else if (line.startsWith('#')) {
        doc.moveDown(0.5);
        doc.font('B').fontSize(13).fillColor('#0e3d52')
           .text(line.replace(/^#+\s*/, ''), ML, doc.y, { width: PW, align: 'center' });
        doc.moveDown(0.7);

      } else if (line === '' || line === '---') {
        doc.moveDown(0.25);

      } else if (line.startsWith('**') && line.endsWith('**')) {
        doc.font('B').fontSize(10).fillColor('#111827')
           .text(line.replace(/\*\*/g, ''), ML, cy, { width: PW });
        doc.moveDown(0.25);

      } else {
        // All other lines (articles, normal text) — render as plain text, no continued
        // Strip any leading ** markers for bold-whole-line
        const clean = line.replace(/^\*\*|\*\*$/g, '');
        const isArticle = /^(Чл\.|Art\.)/.test(clean);
        doc.font(isArticle ? 'B' : 'R').fontSize(9.5).fillColor('#111827')
           .text(clean, ML, cy, { width: PW, align: isArticle ? 'left' : 'justify' });
        doc.moveDown(0.2);
      }
    }

    // Render all lines (collapse consecutive empty lines)
    let prevEmpty = false;
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const isEmpty = line === '' || line === '---';
      if (isEmpty && prevEmpty) continue; // skip consecutive empty lines
      prevEmpty = isEmpty;
      // Page break check before rendering (widow prevention)
      // drawPageHeader is called automatically via pageAdded event
      if (doc.y > PH - FOOTER_H - 50) {
        doc.addPage();
      }
      renderLine(line);
    }

    // Signature block
    doc.moveDown(2);
    if (doc.y > PH - FOOTER_H - 80) { doc.addPage(); }
    const sigY = doc.y;
    const col  = PW / 2 - 15;

    doc.font('B').fontSize(9).fillColor('#111827')
       .text('НАЕМОДАТЕЛ / LANDLORD:', ML, sigY, { width: col, lineBreak: false });
    doc.font('B').fontSize(9).fillColor('#111827')
       .text('НАЕМАТЕЛ / TENANT:', ML + PW / 2, sigY, { width: col, lineBreak: false });

    const lineY = sigY + 45;
    doc.moveTo(ML,           lineY).lineTo(ML + col,       lineY).lineWidth(0.7).strokeColor('#374151').stroke();
    doc.moveTo(ML + PW / 2, lineY).lineTo(ML + PW,         lineY).lineWidth(0.7).strokeColor('#374151').stroke();

    doc.font('R').fontSize(8).fillColor('#6b7280')
       .text(contract.landlord_name || issuer.name || '', ML, lineY + 5, { width: col, align: 'center', lineBreak: false });
    doc.font('R').fontSize(8).fillColor('#6b7280')
       .text(contract.tenant_name || '', ML + PW / 2, lineY + 5, { width: col, align: 'center', lineBreak: false });

    doc.end();
    ws.on('finish', () => resolve({ filepath, filename }));
    ws.on('error', reject);
  });
}

// ─── Router ────────────────────────────────────────────────────────────────
module.exports = function(db) {
  const router = express.Router();

  // ── Templates ──────────────────────────────────────────────────────────

  router.get('/templates', (req, res) => {
    res.json(db.prepare('SELECT * FROM contract_templates ORDER BY id').all());
  });

  router.post('/templates', upload.single('logo'), (req, res) => {
    try {
      const { name, content, is_default } = req.body;
      if (!name || !content) return res.status(400).json({ error: 'name и content са задължителни' });
      const logo_path = req.file ? req.file.filename : null;
      if (is_default) db.prepare("UPDATE contract_templates SET is_default=0").run();
      const r = db.prepare(
        'INSERT INTO contract_templates (name, content, logo_path, is_default) VALUES (?,?,?,?)'
      ).run(name, content, logo_path, is_default ? 1 : 0);
      res.status(201).json({ id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/templates/:id', upload.single('logo'), (req, res) => {
    try {
      const { name, content, is_default } = req.body;
      const curr = db.prepare('SELECT * FROM contract_templates WHERE id=?').get(req.params.id);
      if (!curr) return res.status(404).json({ error: 'Not found' });
      const logo_path = req.file ? req.file.filename : curr.logo_path;
      if (is_default) db.prepare("UPDATE contract_templates SET is_default=0").run();
      db.prepare('UPDATE contract_templates SET name=?, content=?, logo_path=?, is_default=? WHERE id=?')
        .run(name || curr.name, content || curr.content, logo_path, is_default ? 1 : 0, req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/templates/:id', (req, res) => {
    db.prepare('DELETE FROM contract_templates WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // Logo upload (standalone)
  router.post('/templates/:id/logo', upload.single('logo'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Няма файл' });
    db.prepare('UPDATE contract_templates SET logo_path=? WHERE id=?').run(req.file.filename, req.params.id);
    res.json({ ok: true, logo_path: req.file.filename });
  });

  // ── Contracts ──────────────────────────────────────────────────────────

  router.get('/', (req, res) => {
    const { status, property_id, q } = req.query;
    let sql = 'SELECT * FROM contracts WHERE 1=1';
    const params = [];
    if (status)      { sql += ' AND status=?';                         params.push(status); }
    if (property_id) { sql += ' AND property_id=?';                    params.push(property_id); }
    if (q)           { sql += ' AND (tenant_name LIKE ? OR contract_number LIKE ? OR property_address LIKE ?)';
                       params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    sql += ' ORDER BY created_at DESC';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  // Create contract (draft)
  router.post('/', async (req, res) => {
    try {
      const { template_id, property_id, ...fields } = req.body;
      if (!template_id) return res.status(400).json({ error: 'template_id е задължителен' });

      const template = db.prepare('SELECT * FROM contract_templates WHERE id=?').get(template_id);
      if (!template) return res.status(404).json({ error: 'Шаблонът не е намерен' });

      const prop    = property_id ? db.prepare('SELECT * FROM properties WHERE id=?').get(property_id) : null;
      const issuer  = getIssuer(db);
      const contract_number = nextContractNumber(db);

      const contract = {
        template_id, property_id: property_id || null, contract_number,
        status: 'draft',
        landlord_type:    fields.landlord_type    || 'физическо',
        landlord_name:    fields.landlord_name    || issuer.name    || '',
        landlord_address: fields.landlord_address || issuer.address || '',
        landlord_egn:     fields.landlord_egn     || issuer.eik    || '',
        landlord_phone:   fields.landlord_phone   || '',
        landlord_lk:      fields.landlord_lk      || '',
        landlord_lk_date: fields.landlord_lk_date || '',
        tenant_name:         fields.tenant_name         || prop?.['наемател'] || '',
        tenant_address:      fields.tenant_address      || '',
        tenant_egn:          fields.tenant_egn          || '',
        tenant_phone:        fields.tenant_phone        || prop?.['телефон'] || '',
        tenant_email:        fields.tenant_email        || prop?.['email']   || '',
        tenant_mol:          fields.tenant_mol          || '',
        tenant_doc:          fields.tenant_doc          || '',
        tenant_doc_date:     fields.tenant_doc_date     || '',
        tenant_doc_country:  fields.tenant_doc_country  || '',
        tenant_dob:          fields.tenant_dob          || '',
        property_address:     fields.property_address     || prop?.['адрес'] || '',
        property_description: fields.property_description || '',
        property_area:        fields.property_area        || prop?.['площ']  || null,
        monthly_rent:  fields.monthly_rent || prop?.['наем'] || 0,
        currency:      fields.currency     || 'EUR',
        deposit:       fields.deposit      || 0,
        payment_day:   fields.payment_day  || 5,
        start_date:    fields.start_date   || null,
        end_date:      fields.end_date     || null,
        delivery_date: fields.delivery_date || null,
        conditions:    fields.conditions   || '',
        notes:         fields.notes        || '',
      };

      const { filepath, filename } = await generateContractPDF(contract, template, issuer);
      contract.pdf_path = filename;

      const r = db.prepare(`
        INSERT INTO contracts (template_id, property_id, contract_number, status,
          landlord_type, landlord_name, landlord_address, landlord_egn, landlord_phone, landlord_lk, landlord_lk_date,
          tenant_name, tenant_address, tenant_egn, tenant_phone, tenant_email, tenant_mol,
          tenant_doc, tenant_doc_date, tenant_doc_country, tenant_dob,
          property_address, property_description, property_area,
          monthly_rent, currency, deposit, payment_day,
          start_date, end_date, delivery_date, conditions, notes, pdf_path)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        contract.template_id, contract.property_id, contract.contract_number, contract.status,
        contract.landlord_type, contract.landlord_name, contract.landlord_address, contract.landlord_egn,
        contract.landlord_phone, contract.landlord_lk, contract.landlord_lk_date,
        contract.tenant_name, contract.tenant_address, contract.tenant_egn, contract.tenant_phone, contract.tenant_email, contract.tenant_mol,
        contract.tenant_doc, contract.tenant_doc_date, contract.tenant_doc_country, contract.tenant_dob,
        contract.property_address, contract.property_description, contract.property_area,
        contract.monthly_rent, contract.currency, contract.deposit, contract.payment_day,
        contract.start_date, contract.end_date, contract.delivery_date, contract.conditions, contract.notes,
        filename
      );

      res.status(201).json({ ok: true, id: r.lastInsertRowid, contract_number, filename });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Regenerate PDF for existing contract
  router.post('/:id/regenerate', async (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Not found' });
      const template = db.prepare('SELECT * FROM contract_templates WHERE id=?').get(contract.template_id);
      if (!template) return res.status(404).json({ error: 'Шаблонът не е намерен' });
      const issuer = getIssuer(db);
      const { filename } = await generateContractPDF(contract, template, issuer);
      db.prepare('UPDATE contracts SET pdf_path=? WHERE id=?').run(filename, contract.id);
      res.json({ ok: true, filename });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Activate contract → update property
  router.post('/:id/activate', (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Not found' });

      db.prepare("UPDATE contracts SET status='active', activated_at=datetime('now') WHERE id=?").run(contract.id);

      // Update property
      if (contract.property_id) {
        db.prepare(`UPDATE properties SET наемател=?, наем=?, телефон=?, email=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .run(contract.tenant_name, contract.monthly_rent, contract.tenant_phone || null, contract.tenant_email || null, contract.property_id);

        // Add to tenant_history
        db.prepare(`UPDATE tenant_history SET end_date=? WHERE property_id=? AND (end_date IS NULL OR end_date='')`)
          .run(contract.start_date || new Date().toISOString().slice(0,10), contract.property_id);
        db.prepare(`
          INSERT INTO tenant_history (property_id, tenant_name, start_date, end_date, monthly_rent, deposit, conditions, notes)
          VALUES (?,?,?,?,?,?,?,?)
        `).run(
          contract.property_id, contract.tenant_name,
          contract.start_date || null, contract.end_date || null,
          contract.monthly_rent, contract.deposit,
          contract.conditions || null, contract.notes || null
        );
      }

      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Terminate contract
  router.post('/:id/terminate', (req, res) => {
    const { end_date } = req.body;
    const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    db.prepare("UPDATE contracts SET status='terminated', terminated_at=datetime('now'), end_date=? WHERE id=?")
      .run(end_date || new Date().toISOString().slice(0,10), contract.id);
    if (contract.property_id) {
      db.prepare("UPDATE tenant_history SET end_date=? WHERE property_id=? AND (end_date IS NULL OR end_date='')")
        .run(end_date || new Date().toISOString().slice(0,10), contract.property_id);
    }
    res.json({ ok: true });
  });

  // Send by email
  router.post('/:id/send', async (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Not found' });
      const toEmail = req.body.email || contract.tenant_email;
      if (!toEmail) return res.status(400).json({ error: 'Няма email адрес' });

      const smtp = getSmtp(db);
      if (!smtp) return res.status(400).json({ error: 'SMTP не е конфигуриран' });

      const filepath = path.join(PDF_DIR, contract.pdf_path);
      if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'PDF не е намерен — регенерирайте' });

      const issuer = getIssuer(db);
      const transporter = nodemailer.createTransport({
        host: smtp.host, port: Number(smtp.port) || 587,
        secure: smtp.port == 465,
        auth: { user: smtp.user, pass: smtp.pass },
        tls: { rejectUnauthorized: false },
      });

      const hasLogo = fs.existsSync(DEFAULT_LOGO);
      const logoTag = hasLogo
        ? `<img src="cid:skylogo" alt="Sky Capital" style="height:44px;display:block;">`
        : `<span style="color:#e8eaf2;font-size:16px;font-weight:bold;letter-spacing:2px;">SKY CAPITAL</span>`;
      const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">
        <tr><td style="background:#1a1a2e;padding:18px 32px;">${logoTag}</td></tr>
        <tr><td style="padding:32px 32px 24px;color:#1a1a2e;font-size:14px;line-height:1.7;">
          <p>Уважаеми/а <strong>${contract.tenant_name}</strong>,</p>
          <p>Прилагаме <strong>Договор за наем № ${contract.contract_number}</strong> за имот <strong>${contract.property_address}</strong>.</p>
          <p>Моля прегледайте, подпишете и върнете сканиран екземпляр.</p>
          <p style="margin-top:24px;">С уважение,<br><strong>${issuer.name || 'Sky Capital'}</strong></p>
        </td></tr>
        <tr><td style="background:#e8eaf2;padding:14px 32px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #d1d5db;">
          <strong>${issuer.name || 'Sky Capital OOD'}</strong> &nbsp;|&nbsp; info@skycapital.pro &nbsp;|&nbsp; +359 888 64 64 20
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
      await transporter.sendMail({
        from: `"${issuer.name || 'Sky Capital'}" <${smtp.user}>`,
        to: toEmail,
        subject: `Договор за наем № ${contract.contract_number}`,
        text: `Уважаеми/а ${contract.tenant_name},\n\nПрилагаме договор за наем № ${contract.contract_number} за имот ${contract.property_address}.\n\nМоля прегледайте, подпишете и върнете сканиран екземпляр.\n\nС уважение,\n${issuer.name || 'Sky Capital'}`,
        html: emailHtml,
        attachments: [
          ...(hasLogo ? [{ filename: 'logo.png', path: DEFAULT_LOGO, cid: 'skylogo' }] : []),
          { filename: `Договор_${contract.contract_number}.pdf`, path: filepath },
        ],
      });

      db.prepare("UPDATE contracts SET sent_at=datetime('now') WHERE id=?").run(contract.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Download PDF
  router.get('/:id/pdf', (req, res) => {
    const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    const filepath = path.join(PDF_DIR, contract.pdf_path);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'PDF не е намерен' });
    res.setHeader('Content-Type', 'application/pdf');
    fs.createReadStream(filepath).pipe(res);
  });

  // Delete contract
  router.delete('/:id', (req, res) => {
    const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (contract.pdf_path) {
      const fp = path.join(PDF_DIR, contract.pdf_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    db.prepare('DELETE FROM contracts WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
