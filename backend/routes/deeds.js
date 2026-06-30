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

// Изображение → PDF (вгражда снимката като страница с размер по изображението).
function imageToPdf(imgPath, outPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ autoFirstPage: false });
      const stream = fs.createWriteStream(outPath);
      doc.pipe(stream);
      const img = doc.openImage(imgPath);
      doc.addPage({ size: [img.width, img.height], margin: 0 });
      doc.image(img, 0, 0);
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    } catch (e) { reject(e); }
  });
}

const EXTRACT_PROMPT = `Това е български НОТАРИАЛЕН АКТ (PDF или снимка). Прочети целия документ внимателно и извлечи данните. Върни САМО JSON обект, без markdown, без обяснения:
{
  "full_text": "целия прочетен текст на акта (дословно)",
  "owners": ["имена на собствениците/купувачите на кирилица"],
  "deed": { "number": "акт №, том, рег.№, дело", "date": "ГГГГ-ММ-ДД", "notary": "име на нотариуса" },
  "main_unit": {
    "type": "вид на основния обект (Апартамент/Къща/Ателие/Студио/Магазин и др.)",
    "address": "пълен адрес (град, ж.к./улица, бл./№, вход, етаж, ап.)",
    "cadastral_id": "кадастрален идентификатор (формат XXXXX.XXXX.X.X.X)",
    "area": число_площ_в_кв.м,
    "floor": "етаж"
  },
  "additional_units": [
    { "type": "Мазе/Изба/Таван/Паркомясто/Гараж", "cadastral_id": "идентификатор ако има", "area": число_кв.м, "description": "пояснение (напр. 'мазе №3 към ап.5')" }
  ]
}
ПРАВИЛА:
- Извлечи ВСИЧКИ самостоятелни обекти. Често актът включва основен имот + ПРИНАДЛЕЖНОСТИ (мазе/изба, таван, паркомясто, гараж) — изброй всяка в additional_units.
- Кадастрален идентификатор: препиши ТОЧНО, цифра по цифра.
- Площ: само число (кв.м), без текст.
- Имена на кирилица.
- Ако поле липсва/нечетимо → "" или [] или null. НЕ измисляй данни.`;

module.exports = function (db) {
  const router = express.Router();

  // Качване + извличане. Запазва PDF + deed запис (несвързан още), връща данните
  // + предложено съответствие с имот + допълнителните единици за потвърждение.
  router.post('/extract', upload.single('file'), orgContext, async (req, res) => {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(400).json({ error: 'ANTHROPIC_API_KEY не е конфигуриран' });
      const f = req.file;
      if (!f) return res.status(400).json({ error: 'Качи PDF или снимка на акта' });
      const isPdf = /pdf$/i.test(f.originalname) || f.mimetype === 'application/pdf';

      let Anthropic;
      try { Anthropic = require('@anthropic-ai/sdk'); }
      catch (e) { return res.status(500).json({ error: '@anthropic-ai/sdk липсва: ' + e.message }); }
      const client = new Anthropic.default({ apiKey });

      // Подготви блока за Claude (PDF → document; снимка → image, мащабирана за лимити)
      let block;
      if (isPdf) {
        block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(f.path).toString('base64') } };
      } else {
        const buf = await sharp(f.path).rotate().resize({ width: 2500, height: 2500, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
        block = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } };
      }

      const response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 16000, // актовете са дълги; ниският лимит отрязваше JSON-а
        messages: [{ role: 'user', content: [block, { type: 'text', text: EXTRACT_PROMPT }] }],
      });
      const stopReason = response.stop_reason;
      let raw = response.content.map(c => c.text || '').join('').trim();
      // Махни markdown ограждения ако има (```json ... ```)
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
      let data = null;
      if (s !== -1 && e > s) {
        try { data = JSON.parse(raw.slice(s, e + 1)); } catch (_) { /* пробваме fallback по-долу */ }
      }
      if (!data) {
        console.error('deed parse fail — stop_reason=%s, дължина=%d, начало=%s', stopReason, raw.length, raw.slice(0, 400));
        const hint = stopReason === 'max_tokens'
          ? 'Документът е прекалено дълъг — пробвай по-малко страници или го раздели.'
          : 'Не успях да разчета акта — пробвай по-ясен скан/PDF.';
        return res.status(422).json({
          error: hint,
          debug: { stop_reason: stopReason, is_pdf: isPdf, blocks: response.content.length, length: raw.length, ai_response: raw.slice(0, 600) },
        });
      }

      // Съхрани като PDF (снимка → PDF; PDF → както е)
      let pdfPath = f.path, originalFormat = 'pdf';
      if (!isPdf) {
        originalFormat = (path.extname(f.originalname).replace('.', '') || 'jpg').toLowerCase();
        pdfPath = f.path + '.pdf';
        await imageToPdf(f.path, pdfPath);
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
