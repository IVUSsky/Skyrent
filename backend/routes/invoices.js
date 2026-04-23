const express = require('express');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const FONT_REGULAR = 'C:/Windows/Fonts/arial.ttf';
const FONT_BOLD    = 'C:/Windows/Fonts/arialbd.ttf';
const PDF_DIR      = path.join(__dirname, '../data/invoices');
const LOGO_PATH    = path.join(__dirname, '../data/logos/sky_capital_logo.png');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

function buildEmailHtml(bodyHtml, senderName) {
  const hasLogo = fs.existsSync(LOGO_PATH);
  const logoTag = hasLogo
    ? `<img src="cid:skylogo" alt="Sky Capital" style="height:44px;display:block;">`
    : `<span style="color:#e8eaf2;font-size:16px;font-weight:bold;letter-spacing:2px;">SKY CAPITAL</span>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">
        <tr><td style="background:#1a1a2e;padding:18px 32px;">${logoTag}</td></tr>
        <tr><td style="padding:32px 32px 24px;color:#1a1a2e;font-size:14px;line-height:1.7;">${bodyHtml}</td></tr>
        <tr><td style="background:#e8eaf2;padding:14px 32px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #d1d5db;">
          <strong>${senderName || 'Sky Capital OOD'}</strong> &nbsp;|&nbsp; info@skycapital.pro &nbsp;|&nbsp; +359 888 64 64 20
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
function logoAttachment() {
  if (!fs.existsSync(LOGO_PATH)) return [];
  return [{ filename: 'logo.png', path: LOGO_PATH, cid: 'skylogo' }];
}

const BG_MONTHS = ['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември'];
function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${BG_MONTHS[parseInt(m) - 1]} ${y}`;
}
function fmtMoney(n) {
  return Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()}`;
}

// Invoice number: 10-digit sequential per year, e.g. 2026000001
function nextInvoiceNumber(db) {
  const year = new Date().getFullYear();
  const counterKey = `invoice_counter_${year}`;
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(counterKey);
  const next = row ? (parseInt(row.value) + 1) : 1;
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").run(counterKey, String(next));
  return `${year}${String(next).padStart(6,'0')}`;
}

function getIssuer(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='issuer'").get();
  if (!row) return {};
  try { return JSON.parse(row.value); } catch { return {}; }
}
function getSmtp(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='smtp'").get();
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

// ─── PDF Generator ─────────────────────────────────────────────────────────
function generatePDF(inv, issuer) {
  return new Promise((resolve, reject) => {
    const isCreditNote = inv.type === 'credit_note';
    const filename = `${isCreditNote ? 'cn' : 'inv'}_${inv.invoice_number}.pdf`;
    const filepath = path.join(PDF_DIR, filename);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);
    doc.registerFont('R', FONT_REGULAR);
    doc.registerFont('B', FONT_BOLD);

    const PW = doc.page.width - 100;

    // ── Title bar
    doc.rect(50, 40, PW, 32).fill(isCreditNote ? '#7c3aed' : '#1e40af');
    doc.font('B').fontSize(16).fillColor('#ffffff');
    doc.text(isCreditNote ? 'КРЕДИТНО ИЗВЕСТИЕ' : 'ФАКТУРА', 60, 49);
    doc.font('R').fontSize(10).fillColor('#ffffff');
    doc.text(`№ ${inv.invoice_number}`, PW - 60, 49, { width: 100, align: 'right' });

    // ── Meta row
    let y = 85;
    doc.font('R').fontSize(9).fillColor('#374151');
    doc.text(`Дата на издаване: ${fmtDate(inv.issued_at)}`, 50, y);
    doc.text(`Дата на данъчното събитие: ${fmtDate(inv.tax_event_date || inv.issued_at)}`, 220, y);
    if (inv.due_date) doc.text(`Падеж: ${fmtDate(inv.due_date)}`, 430, y);
    y += 14;
    if (inv.payment_type) {
      const ptLabel = inv.payment_type === 'брой' ? 'в брой' : 'банков превод';
      doc.text(`Начин на плащане: ${ptLabel}`, 50, y);
    }
    if (isCreditNote && inv.related_invoice_number) {
      doc.font('B').fillColor('#7c3aed');
      doc.text(`Кредитно известие към фактура № ${inv.related_invoice_number} от ${fmtDate(inv.related_invoice_date)}`, 50, y + (inv.payment_type ? 12 : 0));
      doc.font('R').fillColor('#374151');
      if (inv.credit_note_reason) {
        y += 12;
        doc.text(`Основание: ${inv.credit_note_reason}`, 50, y + 12);
      }
    }

    // ── Issuer / Recipient
    y += 30;
    const col1 = 50, col2 = 310, colW = 240;
    doc.rect(col1, y, colW, 14).fill('#f3f4f6');
    doc.rect(col2, y, colW, 14).fill('#f3f4f6');
    doc.font('B').fontSize(8).fillColor('#6b7280');
    doc.text('ДОСТАВЧИК', col1 + 4, y + 3);
    doc.text('ПОЛУЧАТЕЛ', col2 + 4, y + 3);
    y += 16;

    // Issuer block
    let iy = y;
    doc.font('B').fontSize(10).fillColor('#111827').text(issuer.name || 'Sky Capital', col1, iy, { width: colW });
    iy += 14;
    doc.font('R').fontSize(9).fillColor('#374151');
    if (issuer.address)    { doc.text(issuer.address,                     col1, iy, { width: colW }); iy += 12; }
    if (issuer.eik)        { doc.text(`ЕИК: ${issuer.eik}`,               col1, iy, { width: colW }); iy += 12; }
    if (issuer.mol)        { doc.text(`МОЛ: ${issuer.mol}`,               col1, iy, { width: colW }); iy += 12; }
    if (issuer.vat_number) { doc.text(`ДДС №: ${issuer.vat_number}`,      col1, iy, { width: colW }); iy += 12; }
    if (issuer.iban)       { doc.text(`IBAN: ${issuer.iban}`,             col1, iy, { width: colW }); iy += 12; }
    if (issuer.bic)        { doc.text(`BIC: ${issuer.bic}`,               col1, iy, { width: colW }); iy += 12; }

    // Recipient block
    let ry = y;
    doc.font('B').fontSize(10).fillColor('#111827').text(inv.recipient_name || inv.tenant_name, col2, ry, { width: colW });
    ry += 14;
    doc.font('R').fontSize(9).fillColor('#374151');
    if (inv.recipient_address) { doc.text(inv.recipient_address, col2, ry, { width: colW }); ry += 12; }
    if (inv.recipient_eik)     { doc.text(`ЕИК: ${inv.recipient_eik}`, col2, ry, { width: colW }); ry += 12; }
    if (inv.recipient_mol)     { doc.text(`МОЛ: ${inv.recipient_mol}`, col2, ry, { width: colW }); ry += 12; }

    y = Math.max(iy, ry) + 20;

    // ── Table
    const cols = { desc: 50, qty: 330, unit: 370, base: 430, total: 490 };
    doc.rect(50, y, PW, 20).fill('#1e40af');
    doc.font('B').fontSize(8).fillColor('#ffffff');
    doc.text('Описание на стоката/услугата', cols.desc + 4, y + 6, { width: 270 });
    doc.text('Кол.', cols.qty, y + 6, { width: 35, align: 'center' });
    doc.text('Ед. цена', cols.unit, y + 6, { width: 55, align: 'right' });
    doc.text('Данъчна основа', cols.base, y + 6, { width: 55, align: 'right' });
    doc.text('Сума с ДДС', cols.total, y + 6, { width: 58, align: 'right' });
    y += 20;

    const sign = isCreditNote ? -1 : 1;
    const rowH = 22;
    doc.rect(50, y, PW, rowH).fill('#f9fafb');
    doc.font('R').fontSize(9).fillColor('#111827');
    const desc = `Наем за ${monthLabel(inv.month)}${inv.property_address ? ' — ' + inv.property_address : ''}`;
    doc.text(desc, cols.desc + 4, y + 7, { width: 270 });
    doc.text('1', cols.qty, y + 7, { width: 35, align: 'center' });
    doc.text(`${fmtMoney(sign * inv.amount)} €`, cols.unit, y + 7, { width: 55, align: 'right' });
    doc.text(`${fmtMoney(sign * inv.amount)} €`, cols.base, y + 7, { width: 55, align: 'right' });
    doc.text(`${fmtMoney(sign * inv.total)} €`,  cols.total, y + 7, { width: 58, align: 'right' });
    y += rowH;
    doc.moveTo(50, y).lineTo(50 + PW, y).stroke('#e5e7eb');
    y += 12;

    // ── Totals
    const tX = 370, tW = 178;
    const addRow = (label, value, bold = false) => {
      if (bold) { doc.font('B').fontSize(10); } else { doc.font('R').fontSize(9); }
      doc.fillColor('#374151').text(label, tX, y, { width: 100 });
      doc.text(value, tX + 100, y, { width: tW - 100, align: 'right' });
      y += bold ? 14 : 13;
    };
    addRow('Данъчна основа:', `${fmtMoney(sign * inv.amount)} €`);
    if (inv.vat_rate > 0) {
      addRow(`ДДС ${inv.vat_rate}%:`, `${fmtMoney(sign * inv.vat_amount)} €`);
    } else {
      addRow('ДДС:', '0,00 €');
      doc.font('R').fontSize(7.5).fillColor('#6b7280');
      doc.text('Освободена доставка по чл.45 ЗДДС', tX, y);
      y += 11;
    }
    doc.moveTo(tX, y).lineTo(tX + tW, y).stroke('#374151');
    y += 5;
    addRow('ОБЩО ЗА ПЛАЩАНЕ:', `${fmtMoney(sign * inv.total)} €`, true);

    // ── Notes
    if (inv.notes) {
      y += 10;
      doc.font('R').fontSize(8.5).fillColor('#374151');
      doc.text(`Забележки: ${inv.notes}`, 50, y, { width: PW });
    }

    // ── Footer
    const footerY = doc.page.height - 50;
    doc.moveTo(50, footerY - 8).lineTo(50 + PW, footerY - 8).stroke('#e5e7eb');
    doc.font('R').fontSize(7.5).fillColor('#9ca3af');
    doc.text(
      `Фактурата е издадена автоматично от Skyrent. ` +
      `Валидна без подпис и печат съгласно чл. 114, ал. 1, т. 15 от ЗДДС.`,
      50, footerY - 4, { width: PW, align: 'center' }
    );

    doc.end();
    stream.on('finish', () => resolve({ filepath, filename }));
    stream.on('error', reject);
  });
}

// ─── CSV row for Controlisy / accounting export ────────────────────────────
function toCSVRow(inv, issuer, relatedInv) {
  const isCN = inv.type === 'credit_note';
  const sign  = isCN ? -1 : 1;
  return [
    isCN ? 'Кредитно известие' : 'Фактура',
    inv.invoice_number,
    fmtDate(inv.issued_at),
    fmtDate(inv.tax_event_date || inv.issued_at),
    issuer.name || '',
    issuer.eik || '',
    issuer.vat_number || '',
    inv.recipient_name || inv.tenant_name,
    inv.recipient_eik || '',
    inv.recipient_address || '',
    `Наем за ${monthLabel(inv.month)}${inv.property_address ? ' — ' + inv.property_address : ''}`,
    String(inv.vat_rate || 0),
    fmtMoney(sign * inv.amount).replace(/\s/g, ''),
    fmtMoney(sign * inv.vat_amount).replace(/\s/g, ''),
    fmtMoney(sign * inv.total).replace(/\s/g, ''),
    inv.payment_type === 'брой' ? 'В брой' : 'Банков превод',
    relatedInv ? relatedInv.invoice_number : '',
    relatedInv ? fmtDate(relatedInv.issued_at) : '',
    inv.credit_note_reason || '',
    inv.notes || '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
}

const CSV_HEADER = [
  'Тип документ','Номер','Дата на издаване','Дата данъчно събитие',
  'Доставчик','ЕИК доставчик','ДДС № доставчик',
  'Получател','ЕИК получател','Адрес получател',
  'Описание','ДДС ставка %','Данъчна основа','ДДС сума','Обща сума',
  'Начин плащане','Към фактура №','Към фактура дата','Основание КИ','Бележки'
].map(h => `"${h}"`).join(',');

// ─── Router ────────────────────────────────────────────────────────────────
module.exports = function(db) {
  const router = express.Router();

  // GET list with search/sort/filter
  router.get('/', (req, res) => {
    const { month, type, q, sort = 'created_at', dir = 'desc', from, to } = req.query;
    let sql = 'SELECT * FROM rent_invoices WHERE 1=1';
    const params = [];
    if (month)  { sql += ' AND month = ?';           params.push(month); }
    if (type)   { sql += ' AND type = ?';            params.push(type); }
    if (from)   { sql += ' AND issued_at >= ?';      params.push(from); }
    if (to)     { sql += ' AND issued_at <= ?';      params.push(to); }
    if (q) {
      sql += ' AND (invoice_number LIKE ? OR recipient_name LIKE ? OR tenant_name LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const allowedSort = ['invoice_number','issued_at','total','recipient_name','created_at'];
    const safeSortCol = allowedSort.includes(sort) ? sort : 'created_at';
    const safeDir = dir === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${safeSortCol} ${safeDir}`;
    res.json(db.prepare(sql).all(...params));
  });

  // Generate invoice
  router.post('/generate', async (req, res) => {
    try {
      const { property_id, month, payment_type, notes, tax_event_date, due_date } = req.body;
      if (!property_id || !month) return res.status(400).json({ error: 'property_id и month са задължителни' });

      const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(property_id);
      if (!prop) return res.status(404).json({ error: 'Имотът не е намерен' });
      if (!prop.invoice_enabled) return res.status(400).json({ error: 'Фактурирането не е включено за този имот' });

      // Check for duplicate
      const existing = db.prepare("SELECT id FROM rent_invoices WHERE property_id=? AND month=? AND type='invoice'").get(property_id, month);
      if (existing) return res.status(400).json({ error: 'Вече съществува фактура за този имот и месец' });

      let recipient = {};
      try { recipient = JSON.parse(prop.invoice_recipient || '{}'); } catch {}

      const issuer = getIssuer(db);
      const invoice_number = nextInvoiceNumber(db);
      const vat_rate  = issuer.vat_rate ? Number(issuer.vat_rate) : 0;
      const total     = Number(prop['наем'] || 0);
      const amount    = vat_rate > 0 ? Math.round(total / (1 + vat_rate / 100) * 100) / 100 : total;
      const vat_amount = Math.round((total - amount) * 100) / 100;
      const issued_at = new Date().toISOString().slice(0, 10);

      const inv = {
        invoice_number, type: 'invoice',
        property_id, property_address: prop['адрес'], month,
        tenant_name:       prop['наемател'] || '',
        recipient_name:    recipient.name    || prop['наемател'] || '',
        recipient_address: recipient.address || '',
        recipient_eik:     recipient.eik     || '',
        recipient_mol:     recipient.mol     || '',
        amount, vat_rate, vat_amount, total,
        payment_type: payment_type || 'банков превод',
        tax_event_date: tax_event_date || issued_at,
        due_date:       due_date       || null,
        issued_at, notes: notes || null,
      };

      const { filepath, filename } = await generatePDF(inv, issuer);

      const r = db.prepare(`
        INSERT INTO rent_invoices
          (invoice_number, type, property_id, month, tenant_name, recipient_name,
           recipient_address, recipient_eik, recipient_mol, amount, vat_rate, vat_amount,
           total, payment_type, tax_event_date, due_date, issued_at, pdf_path, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        invoice_number, 'invoice', property_id, month, inv.tenant_name,
        inv.recipient_name, inv.recipient_address, inv.recipient_eik, inv.recipient_mol,
        amount, vat_rate, vat_amount, total,
        inv.payment_type, inv.tax_event_date, inv.due_date,
        issued_at, filename, inv.notes
      );

      res.json({ ok: true, id: r.lastInsertRowid, invoice_number, filename });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate credit note for an existing invoice
  router.post('/:id/credit-note', async (req, res) => {
    try {
      const original = db.prepare('SELECT * FROM rent_invoices WHERE id = ?').get(req.params.id);
      if (!original) return res.status(404).json({ error: 'Фактурата не е намерена' });
      if (original.type !== 'invoice') return res.status(400).json({ error: 'Може само към фактура' });

      const { reason, notes } = req.body;
      const issuer = getIssuer(db);
      const invoice_number = nextInvoiceNumber(db);
      const issued_at = new Date().toISOString().slice(0, 10);

      const prop = db.prepare('SELECT адрес FROM properties WHERE id = ?').get(original.property_id);

      const inv = {
        ...original,
        invoice_number, type: 'credit_note',
        related_invoice_id:     original.id,
        related_invoice_number: original.invoice_number,
        related_invoice_date:   original.issued_at,
        credit_note_reason: reason || '',
        property_address: prop?.['адрес'] || '',
        issued_at,
        tax_event_date: issued_at,
        notes: notes || null,
      };

      const { filepath, filename } = await generatePDF(inv, issuer);

      const r = db.prepare(`
        INSERT INTO rent_invoices
          (invoice_number, type, related_invoice_id, credit_note_reason,
           property_id, month, tenant_name, recipient_name, recipient_address,
           recipient_eik, recipient_mol, amount, vat_rate, vat_amount, total,
           payment_type, tax_event_date, issued_at, pdf_path, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        invoice_number, 'credit_note', original.id, reason || null,
        original.property_id, original.month, original.tenant_name,
        original.recipient_name, original.recipient_address,
        original.recipient_eik, original.recipient_mol,
        original.amount, original.vat_rate, original.vat_amount, original.total,
        original.payment_type, issued_at, issued_at, filename, inv.notes
      );

      res.json({ ok: true, id: r.lastInsertRowid, invoice_number });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Download PDF
  router.get('/:id/pdf', (req, res) => {
    const inv = db.prepare('SELECT * FROM rent_invoices WHERE id = ?').get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Not found' });
    const filepath = path.join(PDF_DIR, inv.pdf_path);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'PDF не е намерен' });
    res.setHeader('Content-Type', 'application/pdf');
    fs.createReadStream(filepath).pipe(res);
  });

  // Export CSV for Controlisy / accounting
  router.get('/export/csv', (req, res) => {
    const { month, type, from, to } = req.query;
    let sql = 'SELECT * FROM rent_invoices WHERE 1=1';
    const params = [];
    if (month) { sql += ' AND month = ?'; params.push(month); }
    if (type)  { sql += ' AND type = ?';  params.push(type); }
    if (from)  { sql += ' AND issued_at >= ?'; params.push(from); }
    if (to)    { sql += ' AND issued_at <= ?'; params.push(to); }
    sql += ' ORDER BY issued_at ASC, invoice_number ASC';

    const invoices = db.prepare(sql).all(...params);
    const issuer = getIssuer(db);

    const invMap = {};
    invoices.forEach(i => { invMap[i.id] = i; });

    const rows = invoices.map(inv => {
      const related = inv.related_invoice_id ? invMap[inv.related_invoice_id] || db.prepare('SELECT * FROM rent_invoices WHERE id=?').get(inv.related_invoice_id) : null;
      return toCSVRow(inv, issuer, related);
    });

    const bom = '\uFEFF'; // UTF-8 BOM for Excel
    const csv = bom + CSV_HEADER + '\n' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="invoices_export.csv"`);
    res.send(csv);
  });

  // Send invoice by email
  router.post('/:id/send', async (req, res) => {
    const inv = db.prepare('SELECT * FROM rent_invoices WHERE id = ?').get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Not found' });

    const prop = db.prepare('SELECT email FROM properties WHERE id = ?').get(inv.property_id);
    const toEmail = req.body.email || prop?.email;
    if (!toEmail) return res.status(400).json({ error: 'Няма email адрес' });

    const smtp = getSmtp(db);
    if (!smtp) return res.status(400).json({ error: 'SMTP не е конфигуриран' });

    const filepath = path.join(PDF_DIR, inv.pdf_path);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'PDF не е намерен' });

    const issuer = getIssuer(db);
    const isCN = inv.type === 'credit_note';
    const docLabel = isCN ? `Кредитно известие № ${inv.invoice_number}` : `Фактура № ${inv.invoice_number}`;

    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host, port: Number(smtp.port) || 587,
        secure: smtp.port == 465,
        auth: { user: smtp.user, pass: smtp.pass },
        tls: { rejectUnauthorized: false },
      });
      const recipientName = inv.recipient_name || inv.tenant_name || '';
      const bodyHtml = `
        <p>Уважаеми/а <strong>${recipientName}</strong>,</p>
        <p>Прилагаме <strong>${docLabel.toLowerCase()}</strong> за наем за
        <strong>${monthLabel(inv.month)}</strong> на стойност <strong>${fmtMoney(inv.total)} €</strong>.</p>
        <p>Моля прегледайте приложения документ.</p>
        <p style="margin-top:24px;">С уважение,<br><strong>${issuer.name || 'Sky Capital'}</strong></p>`;
      await transporter.sendMail({
        from: `"${issuer.name || 'Sky Capital'}" <${smtp.user}>`,
        to: toEmail,
        subject: `${docLabel} — наем ${monthLabel(inv.month)}`,
        text: `Уважаеми/а ${recipientName},\n\nПрилагаме ${docLabel.toLowerCase()} за наем за ${monthLabel(inv.month)} на стойност ${fmtMoney(inv.total)} €\n\nС уважение,\n${issuer.name || 'Sky Capital'}`,
        html: buildEmailHtml(bodyHtml, issuer.name),
        attachments: [
          ...logoAttachment(),
          { filename: `${docLabel.replace(/\s/g,'_')}.pdf`, path: filepath },
        ],
      });
      db.prepare("UPDATE rent_invoices SET sent_at = datetime('now') WHERE id = ?").run(inv.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update invoice (regenerates PDF)
  router.put('/:id', async (req, res) => {
    try {
      const inv = db.prepare('SELECT * FROM rent_invoices WHERE id=?').get(req.params.id);
      if (!inv) return res.status(404).json({ error: 'Not found' });
      const { amount, vat_rate, notes, payment_type, tax_event_date, due_date, recipient_name, recipient_address, recipient_eik, recipient_mol } = req.body;
      const newAmount   = amount  !== undefined ? Number(amount)   : inv.amount;
      const newVatRate  = vat_rate !== undefined ? Number(vat_rate) : (inv.vat_rate || 0);
      const newVatAmt   = Math.round(newAmount * newVatRate) / 100;
      const newTotal    = newAmount + newVatAmt;
      db.prepare(`UPDATE rent_invoices SET
        amount=?, vat_rate=?, vat_amount=?, total=?,
        notes=?, payment_type=?, tax_event_date=?, due_date=?,
        recipient_name=?, recipient_address=?, recipient_eik=?, recipient_mol=?
        WHERE id=?`).run(
        newAmount, newVatRate, newVatAmt, newTotal,
        notes ?? inv.notes, payment_type ?? inv.payment_type,
        tax_event_date ?? inv.tax_event_date, due_date ?? inv.due_date,
        recipient_name ?? inv.recipient_name, recipient_address ?? inv.recipient_address,
        recipient_eik ?? inv.recipient_eik, recipient_mol ?? inv.recipient_mol,
        inv.id
      );
      // Regenerate PDF
      const updated = db.prepare('SELECT * FROM rent_invoices WHERE id=?').get(inv.id);
      const issuer  = getIssuer(db);
      const { filename } = await generatePDF(updated, issuer);
      db.prepare('UPDATE rent_invoices SET pdf_path=? WHERE id=?').run(filename, inv.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Send to Kontrolisi (accounting email)
  router.post('/:id/send-kontrolisi', async (req, res) => {
    try {
      const inv = db.prepare('SELECT * FROM rent_invoices WHERE id=?').get(req.params.id);
      if (!inv) return res.status(404).json({ error: 'Not found' });
      const settingsRow = db.prepare("SELECT value FROM settings WHERE key='kontrolisi_email'").get();
      const toEmail = settingsRow?.value;
      if (!toEmail) return res.status(400).json({ error: 'Kontrolisi email не е зададен в Настройки' });
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) return res.status(400).json({ error: 'RESEND_API_KEY не е конфигуриран' });
      const filepath = path.join(PDF_DIR, inv.pdf_path);
      if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'PDF не е намерен' });
      const issuer    = getIssuer(db);
      const fromEmail = process.env.RESEND_FROM_EMAIL || `info@skycapital.pro`;
      const isCN      = inv.type === 'credit_note';
      const docLabel  = isCN ? `Кредитно известие № ${inv.invoice_number}` : `Фактура № ${inv.invoice_number}`;
      const pdfBase64 = fs.readFileSync(filepath).toString('base64');
      const response  = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${issuer.name || 'Sky Capital'} <${fromEmail}>`,
          to: [toEmail],
          subject: `${docLabel} — ${inv.recipient_name || inv.tenant_name || ''}`,
          html: `<p>${docLabel} от ${issuer.name || 'Sky Capital'} е приложена.</p>`,
          attachments: [{ filename: `${docLabel.replace(/\s/g,'_')}.pdf`, content: pdfBase64 }],
        }),
      });
      const result = await response.json();
      if (!response.ok) return res.status(500).json({ error: result.message || 'Грешка при изпращане' });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Delete invoice
  router.delete('/:id', (req, res) => {
    const inv = db.prepare('SELECT * FROM rent_invoices WHERE id = ?').get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (inv.pdf_path) {
      const fp = path.join(PDF_DIR, inv.pdf_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    db.prepare('DELETE FROM rent_invoices WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
