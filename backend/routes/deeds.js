// Нотариални актове — качване на PDF/JPEG акт → Claude извлича целия текст +
// структурирани данни → съхранява като PDF + текст → предлага обновяване на имота
// и откриване на допълнителни единици (мазета/паркоместа) за добавяне.
// Admin-only (broker/tenant containment в server.js блокира /api/deeds).
const express = require('express');
const { orgContext } = require('../db/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const DEEDS_DIR = path.join(DATA_DIR, 'deeds');
if (!fs.existsSync(DEEDS_DIR)) fs.mkdirSync(DEEDS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DEEDS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `deed_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /pdf|jpe?g|png/i.test(file.mimetype) || /\.(pdf|jpe?g|png)$/i.test(file.originalname);
    cb(ok ? null : new Error('Само PDF, JPEG или PNG'), ok);
  },
});

// Изображения → един многостраничен PDF (по страница на снимка).
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

const EXTRACT_PROMPT = `Това е български НОТАРИАЛЕН АКТ (PDF или снимка). Прочети целия документ внимателно и извлечи данните. Върни ги като ПРОСТИ РЕДОВЕ във формат „КЛЮЧ: стойност" (НЕ JSON), точно с тези ключове, всеки на нов ред:
СОБСТВЕНИЦИ: имена на собствениците/купувачите, разделени със запетая
АКТ: акт №, том, рег.№, дело
ДАТА: ГГГГ-ММ-ДД
НОТАРИУС: име на нотариуса
ВИД: вид на основния обект (Апартамент/Къща/Ателие/Студио/Магазин и др.)
АДРЕС: пълен адрес (град, район, ж.к./улица, бл./№, вход, етаж, ап.)
ИДЕНТИФИКАТОР: кадастрален идентификатор (формат XXXXX.XXXX.X.X.X)
ПЛОЩ: само число в кв.м (или празно)
ЕТАЖ: етаж
За ВСЯКА допълнителна единица (мазе/изба/таван/паркомясто/гараж) добави ОТДЕЛЕН ред:
ЕДИНИЦА: вид | площ(число) | идентификатор | кратко описание

ПРАВИЛА:
- Извлечи ВСИЧКИ обекти. Актът често включва основен имот + принадлежности (мазе/изба/таван/паркомясто/гараж) — по един ред „ЕДИНИЦА:" за всяка.
- Кадастрален идентификатор: препиши ТОЧНО, цифра по цифра. Имена на кирилица.
- НЕ използвай кавички за имена (пиши Младост 4, не „Младост 4").
- Ако поле липсва → остави стойността празна. НЕ измисляй.`;

module.exports = function (db) {
  const router = express.Router();

  // Качване + извличане. Запазва PDF + deed запис (несвързан още), връща данните
  // + предложено съответствие с имот + допълнителните единици за потвърждение.
  router.post('/extract', upload.array('files', 25), orgContext, async (req, res) => {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(400).json({ error: 'ANTHROPIC_API_KEY не е конфигуриран' });
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: 'Качи PDF или снимки на акта' });
      const isPdfFile = (x) => /pdf$/i.test(x.originalname) || x.mimetype === 'application/pdf';
      const pdfFiles = files.filter(isPdfFile);
      const imgFiles = files.filter(x => !isPdfFile(x));
      const anyPdf = pdfFiles.length > 0;

      let Anthropic;
      try { Anthropic = require('@anthropic-ai/sdk'); }
      catch (e) { return res.status(500).json({ error: '@anthropic-ai/sdk липсва: ' + e.message }); }
      const client = new Anthropic.default({ apiKey });

      // Блокове за Claude — ВСИЧКИ файлове заедно (PDF → document; снимка → image,
      // мащабирана за лимити). Много снимки = страници на един акт → четат се заедно.
      const blocks = [];
      for (const pf of pdfFiles) {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(pf.path).toString('base64') } });
      }
      for (const im of imgFiles) {
        const buf = await sharp(im.path).rotate().resize({ width: 2500, height: 2500, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
        blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } });
      }

      const response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 2000, // само структурирани данни → бърз отговор (без timeout)
        messages: [{ role: 'user', content: [...blocks, { type: 'text', text: EXTRACT_PROMPT }] }],
      });
      const stopReason = response.stop_reason;
      const raw = response.content.map(c => c.text || '').join('').trim();
      // Line-based parsing „КЛЮЧ: стойност" — толерира кавички/специални знаци в
      // стойностите (за разлика от JSON, който се чупи на неескейпната кавичка).
      const lines = raw.split(/\r?\n/);
      const lineKey = (x) => { const i = x.indexOf(':'); return i < 0 ? '' : x.slice(0, i).trim().toUpperCase(); };
      const lineVal = (x) => { const i = x.indexOf(':'); return i < 0 ? '' : x.slice(i + 1).trim(); };
      const getVal = (key) => { const l = lines.find(x => lineKey(x) === key); return l ? lineVal(l) : ''; };
      const toNum = (v) => { const n = parseFloat(String(v || '').replace(',', '.').replace(/[^\d.]/g, '')); return isNaN(n) ? null : n; };
      const data = {
        owners: getVal('СОБСТВЕНИЦИ').split(/[,;]/).map(s => s.trim()).filter(Boolean),
        deed: { number: getVal('АКТ'), date: getVal('ДАТА'), notary: getVal('НОТАРИУС') },
        main_unit: {
          type: getVal('ВИД'), address: getVal('АДРЕС'), cadastral_id: getVal('ИДЕНТИФИКАТОР'),
          area: toNum(getVal('ПЛОЩ')), floor: getVal('ЕТАЖ'),
        },
        additional_units: lines.filter(x => lineKey(x) === 'ЕДИНИЦА').map(l => {
          const parts = lineVal(l).split('|').map(s => s.trim());
          return { type: parts[0] || '', area: toNum(parts[1]), cadastral_id: parts[2] || '', description: parts[3] || '' };
        }),
      };
      const parsedOk = !!(data.main_unit.type || data.main_unit.address || data.main_unit.cadastral_id || data.deed.number);
      if (!parsedOk) {
        console.error('deed parse fail — stop_reason=%s, дължина=%d, начало=%s', stopReason, raw.length, raw.slice(0, 400));
        return res.status(422).json({
          error: 'Не успях да разчета акта — пробвай по-ясен скан/снимки.',
          debug: { stop_reason: stopReason, files: files.length, images: imgFiles.length, pdfs: pdfFiles.length, length: raw.length, ai_response: raw.slice(0, 600) },
        });
      }
      // Пълен текст: от текстовия слой на PDF-а (мигновено, без AI timeout).
      // За снимки/сканирани PDF без текстов слой → празно (структурата + PDF-ът остават).
      let fullText = '';
      if (anyPdf) { try { const pp = await require('pdf-parse')(fs.readFileSync(pdfFiles[0].path)); fullText = (pp.text || '').trim(); } catch (_) {} }
      data.full_text = fullText;

      // Съхрани като ЕДИН PDF: снимки → многостраничен PDF; единичен PDF → както е.
      let pdfPath, originalFormat;
      if (pdfFiles.length === 1 && imgFiles.length === 0) {
        pdfPath = pdfFiles[0].path; originalFormat = 'pdf';
      } else if (imgFiles.length > 0) {
        pdfPath = imgFiles[0].path + '.deed.pdf';
        await imagesToPdf(imgFiles.map(i => i.path), pdfPath);
        originalFormat = imgFiles.length > 1 ? `${imgFiles.length} снимки` : 'снимка';
      } else {
        pdfPath = pdfFiles[0].path; originalFormat = 'pdf'; // няколко PDF (рядко) → първия
      }

      const main = data.main_unit || {};
      const deed = data.deed || {};
      const r = db.prepare(`
        INSERT INTO property_deeds (pdf_path, original_format, cadastral_id, deed_number, deed_date, notary, area, owner_name, extracted_text, extracted_json)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(
        path.basename(pdfPath), originalFormat, main.cadastral_id || null,
        deed.number || null, deed.date || null, deed.notary || null,
        main.area != null ? (Number(main.area) || null) : null,
        Array.isArray(data.owners) ? data.owners.join(', ') : null,
        data.full_text || '', JSON.stringify(data)
      );

      // Предложи съответствие: по кадастрален идентификатор (точно), иначе по адрес
      const props = db.prepare('SELECT id, адрес, площ, тип, cadastral_id FROM properties ORDER BY id').all();
      const norm = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
      let match = null;
      if (main.cadastral_id) match = props.find(p => p.cadastral_id && norm(p.cadastral_id) === norm(main.cadastral_id));
      if (!match && main.address) {
        const a = norm(main.address);
        match = props.find(p => { const pa = norm(p['адрес']); return pa && a && (pa.includes(a) || a.includes(pa)); });
      }

      res.json({
        ok: true,
        deed_id: Number(r.lastInsertRowid),
        extracted: data,
        suggested_property: match ? { id: match.id, адрес: match['адрес'], площ: match['площ'], тип: match['тип'], cadastral_id: match.cadastral_id } : null,
        properties: props.map(p => ({ id: p.id, адрес: p['адрес'] })),
      });
    } catch (err) {
      console.error('deed extract failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Потвърждаване: свързва акта с имот, прилага обновления и добавя избрани
  // допълнителни единици като нови имоти.
  router.post('/:id/apply', (req, res) => {
    try {
      const deed = db.prepare('SELECT * FROM property_deeds WHERE id=?').get(req.params.id);
      if (!deed) return res.status(404).json({ error: 'Актът не е намерен' });
      const { property_id, updates, new_units } = req.body || {};

      if (property_id) {
        db.prepare('UPDATE property_deeds SET property_id=? WHERE id=?').run(Number(property_id), deed.id);
        if (updates && typeof updates === 'object') {
          const allowed = ['площ', 'тип', 'cadastral_id', 'адрес', 'район'];
          const sets = [], vals = [];
          for (const k of allowed) {
            if (updates[k] !== undefined && updates[k] !== '' && updates[k] !== null) { sets.push(`"${k}"=?`); vals.push(updates[k]); }
          }
          if (sets.length) { vals.push(Number(property_id)); db.prepare(`UPDATE properties SET ${sets.join(',')} WHERE id=?`).run(...vals); }
        }
      }

      const added = [];
      if (Array.isArray(new_units)) {
        for (const u of new_units) {
          if (!u || !u['адрес']) continue;
          const r = db.prepare(`
            INSERT INTO properties (адрес, район, статус, наем, наемател, площ, тип, покупна, ремонт, cadastral_id)
            VALUES (?,?,?,?,?,?,?,?,?,?)
          `).run(
            u['адрес'], u['район'] || '', '✅', 0, '',
            u['площ'] ? Number(u['площ']) : null, u['тип'] || 'Мазе', 0, 0, u.cadastral_id || null
          );
          added.push({ id: Number(r.lastInsertRowid), адрес: u['адрес'] });
        }
      }
      res.json({ ok: true, added });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Списък актове (по избор за имот)
  router.get('/', (req, res) => {
    const { property_id } = req.query;
    const rows = property_id
      ? db.prepare('SELECT id, property_id, original_format, cadastral_id, deed_number, deed_date, notary, area, owner_name, created_at FROM property_deeds WHERE property_id=? ORDER BY created_at DESC').all(property_id)
      : db.prepare('SELECT id, property_id, original_format, cadastral_id, deed_number, deed_date, notary, area, owner_name, created_at FROM property_deeds ORDER BY created_at DESC').all();
    res.json(rows);
  });

  // Извлеченият текст на конкретен акт
  router.get('/:id/text', (req, res) => {
    const row = db.prepare('SELECT extracted_text, extracted_json FROM property_deeds WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Не е намерен' });
    res.json({ text: row.extracted_text || '', data: row.extracted_json ? JSON.parse(row.extracted_json) : null });
  });

  // Сервиране на съхранения PDF (guard срещу path traversal)
  router.get('/:id/pdf', (req, res) => {
    const row = db.prepare('SELECT pdf_path FROM property_deeds WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Не е намерен' });
    const safe = path.basename(row.pdf_path);
    const full = path.join(DEEDS_DIR, safe);
    if (!full.startsWith(DEEDS_DIR) || !fs.existsSync(full)) return res.status(404).json({ error: 'Файлът липсва' });
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(full);
  });

  router.delete('/:id', (req, res) => {
    try {
      const row = db.prepare('SELECT pdf_path FROM property_deeds WHERE id=?').get(req.params.id);
      if (row) { try { fs.unlinkSync(path.join(DEEDS_DIR, path.basename(row.pdf_path))); } catch (_) {} }
      db.prepare('DELETE FROM property_deeds WHERE id=?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
};
