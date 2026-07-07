// Архив на съществуващи (подписани) договори — качване на PDF/снимки →
// Claude извлича данните → преглед → създава contract запис (архив) + по избор
// актуализира имота (наемател, контакти, абонатни номера) и Контактите.
// Скановете отиват в PDF_DIR на договорите → сваляне през същия GET /:id/pdf.
// Огледален на deeds.js (нотариалните актове). Admin-only (mount в server.js).
const express = require('express');
const { orgContext } = require('../db/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const PDF_DIR = path.join(DATA_DIR, 'contracts'); // същата като contracts.js → GET /:id/pdf работи
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PDF_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `scan_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /pdf|jpe?g|png|officedocument\.wordprocessingml/i.test(file.mimetype)
      || /\.(pdf|jpe?g|png|docx)$/i.test(file.originalname);
    cb(ok ? null : new Error('Само PDF, Word (.docx), JPEG или PNG'), ok);
  },
});

function imagesToPdf(imgPaths, outPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ autoFirstPage: false });
      const stream = fs.createWriteStream(outPath);
      doc.pipe(stream);
      for (const p of imgPaths) {
        const img = doc.openImage(p);
        doc.addPage({ size: [img.width, img.height], margin: 0 });
        doc.image(img, 0, 0);
      }
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    } catch (e) { reject(e); }
  });
}

// Line-based формат (НЕ JSON) — кавички/нови редове в стойностите не го чупят.
const EXTRACT_PROMPT = `Това е български ДОГОВОР ЗА НАЕМ на недвижим имот (PDF или снимки; може да включва и приемо-предавателен протокол). Прочети внимателно, включително РЪКОПИСНИТЕ попълвания (дати, суми, абонатни номера, имейли, телефони). Върни данните като ПРОСТИ РЕДОВЕ „КЛЮЧ: стойност" (НЕ JSON), точно с тези ключове:
НАЕМАТЕЛ: пълното име на наемателя
ЕГН: ЕГН на наемателя
ЛК: № на лична карта
ЛК_ДАТА: дата на издаване (ГГГГ-ММ-ДД)
АДРЕС_НАЕМАТЕЛ: постоянен адрес на наемателя
ТЕЛЕФОН: телефон на наемателя
ИМЕЙЛ: имейл на наемателя
ИМОТ: пълен адрес на отдавания имот (град, квартал, улица/бул., №, етаж, ап.)
ПЛОЩ: само число в кв.м
НАЕМ: само число — месечният наем
ВАЛУТА: BGN или EUR (лв = BGN)
ДЕПОЗИТ: само число
ДЕН_ПЛАЩАНЕ: число — до кое число на месеца се плаща
ОТ_ДАТА: начало на договора (ГГГГ-ММ-ДД)
СРОК_МЕСЕЦИ: число — срок в месеци
ДО_ДАТА: край на договора (ГГГГ-ММ-ДД, ако е посочен или изчислим)
ДАТА_ДОГОВОР: дата на сключване (ГГГГ-ММ-ДД)
АБОНАТ_ТОК: абонатен/клиентски номер за електричество
АБОНАТ_ВОДА: абонатен номер за вода
АБОНАТ_ГАЗ: абонатен номер за газ
АБОНАТ_ТЕЦ: абонатен номер за ТЕЦ/парно

ПРАВИЛА:
- Ръкописният текст е ВАЖЕН — дати често са поправени на ръка (вярвай на поправката).
- Числата без валутни знаци и без хилядни разделители (1300, не 1 300 лв).
- Ако поле липсва → остави стойността празна. НЕ измисляй.
- Имена на кирилица, без кавички.`;

module.exports = function (db) {
  const router = express.Router();

  // Качване + AI извличане. Съхранява скана като PDF, връща данните + предложено
  // съответствие с имот. НЕ записва договор още — това става с /apply след преглед.
  router.post('/extract', upload.array('files', 25), orgContext, async (req, res) => {
    const files = req.files || [];
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(400).json({ error: 'ANTHROPIC_API_KEY не е конфигуриран' });
      if (!files.length) return res.status(400).json({ error: 'Качи PDF, Word (.docx) или снимки на договора' });
      const isPdfFile  = (x) => /\.pdf$/i.test(x.originalname) || x.mimetype === 'application/pdf';
      const isDocxFile = (x) => /\.docx$/i.test(x.originalname) || /wordprocessingml/i.test(x.mimetype);
      const pdfFiles  = files.filter(isPdfFile);
      const docxFiles = files.filter(isDocxFile);
      const imgFiles  = files.filter(x => !isPdfFile(x) && !isDocxFile(x));

      let Anthropic;
      try { Anthropic = require('@anthropic-ai/sdk'); }
      catch (e) { return res.status(500).json({ error: '@anthropic-ai/sdk липсва: ' + e.message }); }
      const client = new Anthropic.default({ apiKey });

      const blocks = [];
      for (const pf of pdfFiles) {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(pf.path).toString('base64') } });
      }
      // Word (.docx): Claude API няма document block за docx → извличаме текста с
      // mammoth и го подаваме като текстов блок (ръкописното в docx и без това е текст).
      for (const dx of docxFiles) {
        try {
          const mammoth = require('mammoth');
          const { value } = await mammoth.extractRawText({ path: dx.path });
          blocks.push({ type: 'text', text: `[Текст от Word документ „${dx.originalname}"]:\n${(value || '').slice(0, 50000)}` });
        } catch (e) {
          console.warn('mammoth extract failed:', e.message);
        }
      }
      for (const im of imgFiles) {
        const buf = await sharp(im.path).rotate().resize({ width: 2500, height: 2500, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
        blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } });
      }
      if (!blocks.length) return res.status(422).json({ error: 'Не успях да прочета файловете' });

      const response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: [...blocks, { type: 'text', text: EXTRACT_PROMPT }] }],
      });
      const raw = response.content.map(c => c.text || '').join('').trim();
      const lines = raw.split(/\r?\n/);
      const lineKey = (x) => { const i = x.indexOf(':'); return i < 0 ? '' : x.slice(0, i).trim().toUpperCase(); };
      const lineVal = (x) => { const i = x.indexOf(':'); return i < 0 ? '' : x.slice(i + 1).trim(); };
      const getVal = (key) => { const l = lines.find(x => lineKey(x) === key); return l ? lineVal(l) : ''; };
      const toNum = (v) => { const n = parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')); return isNaN(n) ? null : n; };
      const data = {
        tenant_name: getVal('НАЕМАТЕЛ'), tenant_egn: getVal('ЕГН'),
        tenant_lk: getVal('ЛК'), tenant_lk_date: getVal('ЛК_ДАТА'),
        tenant_address: getVal('АДРЕС_НАЕМАТЕЛ'), tenant_phone: getVal('ТЕЛЕФОН'), tenant_email: getVal('ИМЕЙЛ'),
        property_address: getVal('ИМОТ'), property_area: toNum(getVal('ПЛОЩ')),
        monthly_rent: toNum(getVal('НАЕМ')), currency: (getVal('ВАЛУТА') || 'BGN').toUpperCase() === 'EUR' ? 'EUR' : 'BGN',
        deposit: toNum(getVal('ДЕПОЗИТ')), payment_day: toNum(getVal('ДЕН_ПЛАЩАНЕ')),
        start_date: getVal('ОТ_ДАТА'), end_date: getVal('ДО_ДАТА'),
        term_months: toNum(getVal('СРОК_МЕСЕЦИ')), contract_date: getVal('ДАТА_ДОГОВОР'),
        абонат_ток: getVal('АБОНАТ_ТОК'), абонат_вода: getVal('АБОНАТ_ВОДА'),
        абонат_газ: getVal('АБОНАТ_ГАЗ'), абонат_тец: getVal('АБОНАТ_ТЕЦ'),
      };
      if (!data.tenant_name && !data.property_address) {
        for (const f of files) { try { fs.unlinkSync(f.path); } catch (_) {} }
        return res.status(422).json({ error: 'Не успях да разчета договора — пробвай по-ясен скан/снимки.' });
      }

      // Съхрани архивния файл: PDF ако има; иначе снимки → PDF; иначе docx as-is
      // (сваля се с правилния mime през GET /:id/pdf).
      let pdfPath;
      if (pdfFiles.length > 0) {
        pdfPath = pdfFiles[0].path;
      } else if (imgFiles.length > 0) {
        pdfPath = path.join(PDF_DIR, `scan_${Date.now()}_contract.pdf`);
        await imagesToPdf(imgFiles.map(i => i.path), pdfPath);
      } else {
        pdfPath = docxFiles[0].path; // Word оригиналът остава как е
      }
      for (const f of files) { if (f.path !== pdfPath) { try { fs.unlinkSync(f.path); } catch (_) {} } }

      // Предложено съответствие: най-много общи думи между адресите (грубо, но полезно)
      let suggested = null;
      try {
        const props = db.prepare("SELECT id, адрес, наемател FROM properties WHERE статус='✅'").all();
        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-zа-я0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
        const target = new Set(norm(data.property_address));
        let best = 0;
        for (const p of props) {
          const score = norm(p.адрес).filter(w => target.has(w)).length;
          if (score > best) { best = score; suggested = { id: p.id, адрес: p.адрес, наемател: p.наемател }; }
        }
        // име на наемателя като по-силен сигнал
        if (data.tenant_name) {
          const tn = norm(data.tenant_name);
          const byName = props.find(p => { const pn = norm(p.наемател); return pn.length && tn.some(w => pn.includes(w)); });
          if (byName) suggested = { id: byName.id, адрес: byName.адрес, наемател: byName.наемател };
        }
      } catch (_) {}

      res.json({ scan_file: path.basename(pdfPath), extracted: data, suggested_property: suggested });
    } catch (err) {
      for (const f of files) { try { fs.unlinkSync(f.path); } catch (_) {} }
      console.error('contract scan extract error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Прилагане след преглед: създава архивен договор + по избор обновява имота и Контактите.
  router.post('/apply', (req, res) => {
    try {
      const b = req.body || {};
      if (!b.scan_file) return res.status(400).json({ error: 'scan_file липсва' });
      if (!fs.existsSync(path.join(PDF_DIR, path.basename(b.scan_file)))) {
        return res.status(400).json({ error: 'Сканът не е намерен — качи отново' });
      }
      const propertyId = b.property_id ? Number(b.property_id) : null;

      const r = db.prepare(`
        INSERT INTO contracts (property_id, status, tenant_name, tenant_egn, tenant_address,
          tenant_phone, tenant_email, tenant_doc, tenant_doc_date,
          property_address, property_area, monthly_rent, currency, deposit, payment_day,
          start_date, end_date, notes, pdf_path, activated_at)
        VALUES (?, 'active', ?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?, ?, ?, datetime('now'))
      `).run(
        propertyId, b.tenant_name || '', b.tenant_egn || null, b.tenant_address || null,
        b.tenant_phone || null, b.tenant_email || null, b.tenant_lk || null, b.tenant_lk_date || null,
        b.property_address || null, b.property_area || null,
        b.monthly_rent || null, b.currency || 'BGN', b.deposit || 0, b.payment_day || 5,
        b.start_date || null, b.end_date || null,
        '📎 Архивиран съществуващ договор (качен скан)' + (b.contract_date ? ` от ${b.contract_date}` : ''),
        path.basename(b.scan_file)
      );

      // По избор: обнови имота (наемател + контакти + абонатни номера; наемът НЕ се
      // пипа автоматично — той може да е индексиран/в друга валута)
      if (propertyId && b.update_property) {
        const cur = db.prepare('SELECT * FROM properties WHERE id=?').get(propertyId);
        if (cur) {
          const upd = {
            наемател: b.tenant_name || cur.наемател,
            email: b.tenant_email || cur.email,
            телефон: b.tenant_phone || cur.телефон,
            абонат_ток: b.абонат_ток || cur.абонат_ток,
            абонат_вода: b.абонат_вода || cur.абонат_вода,
            абонат_тец: b.абонат_тец || cur.абонат_тец,
            абонат_газ: b.абонат_газ || cur.абонат_газ,
          };
          db.prepare('UPDATE properties SET наемател=?, email=?, телефон=?, абонат_ток=?, абонат_вода=?, абонат_тец=?, абонат_газ=? WHERE id=?')
            .run(upd.наемател, upd.email, upd.телефон, upd.абонат_ток, upd.абонат_вода, upd.абонат_тец, upd.абонат_газ, propertyId);
        }
      }

      // Контакти (tenant_directory): upsert по име
      if (b.tenant_name) {
        const ex = db.prepare('SELECT id FROM tenant_directory WHERE name=?').get(b.tenant_name);
        if (ex) {
          db.prepare(`UPDATE tenant_directory SET egn=COALESCE(?,egn), address=COALESCE(?,address),
            phone=COALESCE(?,phone), email=COALESCE(?,email), doc_type=COALESCE(?,doc_type),
            doc_date=COALESCE(?,doc_date), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
            .run(b.tenant_egn || null, b.tenant_address || null, b.tenant_phone || null,
                 b.tenant_email || null, b.tenant_lk ? 'лична карта № ' + b.tenant_lk : null,
                 b.tenant_lk_date || null, ex.id);
        } else {
          db.prepare(`INSERT INTO tenant_directory (name, egn, address, phone, email, doc_type, doc_date, notes)
            VALUES (?,?,?,?,?,?,?,?)`)
            .run(b.tenant_name, b.tenant_egn || null, b.tenant_address || null, b.tenant_phone || null,
                 b.tenant_email || null, b.tenant_lk ? 'лична карта № ' + b.tenant_lk : null,
                 b.tenant_lk_date || null, 'от архивиран договор');
        }
      }

      res.status(201).json({ ok: true, contract_id: r.lastInsertRowid });
    } catch (err) {
      console.error('contract scan apply error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
