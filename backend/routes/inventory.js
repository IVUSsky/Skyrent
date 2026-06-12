// Property inventory CRUD — furniture, appliances, electronics with photos
const { orgContext } = require('../db/db');
// and user manuals. Admin manages; tenants view their own property's items
// via /api/tenant/inventory (added in routes/tenant.js).

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

module.exports = function(db) {
  const router = express.Router();

  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
  const FILES_DIR = path.join(DATA_DIR, 'inventory_files');
  if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, FILES_DIR),
    filename:    (req, file, cb) => {
      const ext  = path.extname(file.originalname).toLowerCase().slice(0, 8);
      const safe = crypto.randomBytes(8).toString('hex');
      cb(null, `${Date.now()}_${safe}${ext}`);
    },
  });
  const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

  // Admin-only guard (tenants get a different endpoint mounted under /api/tenant)
  router.use((req, res, next) => {
    if (req.user?.role === 'tenant') {
      return res.status(403).json({ error: 'Само за администратори. Виж /api/tenant/inventory.' });
    }
    next();
  });

  // ── LIST items for a property ─────────────────────────────────────────────
  router.get('/property/:propertyId', (req, res) => {
    const items = db.prepare(`
      SELECT * FROM property_inventory WHERE property_id=?
      ORDER BY category, sort_order, name
    `).all(req.params.propertyId);
    // Attach file counts so the UI can show "3 снимки, 1 ръководство" without N+1
    for (const it of items) {
      const files = db.prepare('SELECT id, type, filename, original_name, size FROM inventory_files WHERE inventory_id=?').all(it.id);
      it.files = files;
      it.photos  = files.filter(f => f.type === 'photo');
      it.manuals = files.filter(f => f.type === 'manual');
      it.receipts = files.filter(f => f.type === 'receipt');
    }
    res.json(items);
  });

  // ── GET single item with files ────────────────────────────────────────────
  router.get('/:id', (req, res) => {
    const item = db.prepare('SELECT * FROM property_inventory WHERE id=?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    item.files = db.prepare('SELECT id, type, filename, original_name, size FROM inventory_files WHERE inventory_id=?').all(item.id);
    res.json(item);
  });

  // ── CREATE item ───────────────────────────────────────────────────────────
  router.post('/property/:propertyId', (req, res) => {
    const { category, name, brand, model, serial_number, purchase_date, purchase_price, warranty_end, notes, common_problems, sort_order } = req.body;
    if (!category || !name) return res.status(400).json({ error: 'category и name са задължителни' });

    const property = db.prepare('SELECT id FROM properties WHERE id=?').get(req.params.propertyId);
    if (!property) return res.status(404).json({ error: 'Имотът не е намерен' });

    const r = db.prepare(`
      INSERT INTO property_inventory
        (property_id, category, name, brand, model, serial_number, purchase_date, purchase_price, warranty_end, notes, common_problems, sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      req.params.propertyId, category, name,
      brand || '', model || '', serial_number || '',
      purchase_date || null,
      purchase_price ? Number(purchase_price) : null,
      warranty_end || null,
      notes || '', common_problems || '',
      Number.isInteger(sort_order) ? sort_order : 0
    );
    res.status(201).json({ id: r.lastInsertRowid });
  });

  // ── UPDATE item ───────────────────────────────────────────────────────────
  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM property_inventory WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const body = req.body;
    const set = (k, v) => v !== undefined ? v : existing[k];
    db.prepare(`
      UPDATE property_inventory SET
        category=?, name=?, brand=?, model=?, serial_number=?,
        purchase_date=?, purchase_price=?, warranty_end=?,
        notes=?, common_problems=?, sort_order=?,
        updated_at=datetime('now')
      WHERE id=?
    `).run(
      set('category', body.category),
      set('name', body.name),
      set('brand', body.brand),
      set('model', body.model),
      set('serial_number', body.serial_number),
      body.purchase_date !== undefined ? (body.purchase_date || null) : existing.purchase_date,
      body.purchase_price !== undefined ? (body.purchase_price ? Number(body.purchase_price) : null) : existing.purchase_price,
      body.warranty_end !== undefined ? (body.warranty_end || null) : existing.warranty_end,
      set('notes', body.notes),
      set('common_problems', body.common_problems),
      Number.isInteger(body.sort_order) ? body.sort_order : existing.sort_order,
      req.params.id
    );
    res.json({ ok: true });
  });

  // ── DELETE item (also removes files on disk) ──────────────────────────────
  router.delete('/:id', (req, res) => {
    const files = db.prepare('SELECT filename FROM inventory_files WHERE inventory_id=?').all(req.params.id);
    for (const f of files) {
      const fp = path.join(FILES_DIR, f.filename);
      if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch(_) {} }
    }
    db.prepare('DELETE FROM inventory_files WHERE inventory_id=?').run(req.params.id);
    db.prepare('DELETE FROM property_inventory WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── UPLOAD a file (photo / manual / receipt) ──────────────────────────────
  router.post('/:id/files', upload.single('file'), orgContext, (req, res) => {
    const item = db.prepare('SELECT id FROM property_inventory WHERE id=?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const type = (req.body.type || 'photo').toLowerCase();
    if (!['photo', 'manual', 'receipt'].includes(type)) {
      return res.status(400).json({ error: 'type трябва да е photo, manual или receipt' });
    }
    const r = db.prepare(`
      INSERT INTO inventory_files (inventory_id, type, filename, original_name, size)
      VALUES (?,?,?,?,?)
    `).run(item.id, type, req.file.filename, req.file.originalname, req.file.size);
    res.status(201).json({ id: r.lastInsertRowid, filename: req.file.filename });
  });

  // ── SERVE a file inline (no download disposition for photos) ──────────────
  router.get('/files/:fileId', (req, res) => {
    const file = db.prepare('SELECT * FROM inventory_files WHERE id=?').get(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'Not found' });
    const fp = path.join(FILES_DIR, file.filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing' });
    // Best-effort content-type by extension
    const ext = path.extname(file.filename).toLowerCase();
    const mimeMap = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    if (mimeMap[ext]) res.setHeader('Content-Type', mimeMap[ext]);
    if (file.type !== 'photo' && file.original_name) {
      res.setHeader('Content-Disposition', `inline; filename="${file.original_name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
    }
    fs.createReadStream(fp).pipe(res);
  });

  // ── AI: parse a purchase invoice (PDF or image) into structured items ─────
  // Returns { supplier, invoice_number, invoice_date, items: [...] }. Admin then
  // assigns each item to a property in the UI and POSTs to /bulk-import.
  router.post('/parse-invoice', upload.single('file'), orgContext, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Качете файл (PDF или снимка)' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      try { fs.unlinkSync(req.file.path); } catch(_) {}
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY не е конфигуриран' });
    }

    const mediaType = req.file.mimetype;
    const isPdf   = mediaType === 'application/pdf';
    const isImage = mediaType.startsWith('image/');
    if (!isPdf && !isImage) {
      try { fs.unlinkSync(req.file.path); } catch(_) {}
      return res.status(400).json({ error: 'Само PDF или снимка' });
    }

    try {
      const base64 = fs.readFileSync(req.file.path).toString('base64');

      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic.default
        ? new Anthropic.default({ apiKey })
        : new Anthropic({ apiKey });

      const prompt = `Прочети фактурата и извлечи списък с КУПЕНИ артикули (мебели, бяла техника, малки уреди, ВиК, електро). НЕ включвай услуги, доставка, такси, ДДС редове.

Върни СТРИКТНО JSON, без обяснения, без markdown wrappers:

{
  "supplier": "име на доставчика",
  "invoice_number": "номер на фактурата",
  "invoice_date": "YYYY-MM-DD",
  "currency": "EUR" или "BGN",
  "items": [
    {
      "name": "пълно описание на артикула",
      "category_suggested": една от: "мебели" | "бяла техника" | "малки уреди" | "вик" | "електро" | "друго",
      "brand": "марка или null",
      "model": "модел или null",
      "serial_number": "S/N ако се вижда или null",
      "quantity": 1,
      "unit_price": 850.00,
      "warranty_months": 24 (или null ако не пише)
    }
  ]
}

Ако quantity > 1, повтори артикула N пъти като отделни items (за да може admin да ги припише на различни апартаменти).`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            { type: isPdf ? 'document' : 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: prompt },
          ],
        }],
      });

      const text = (response.content?.[0]?.text || '').trim();
      const json = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
      let parsed;
      try { parsed = JSON.parse(json); }
      catch (e) {
        try { fs.unlinkSync(req.file.path); } catch(_) {}
        return res.status(500).json({ error: 'Claude върна невалиден JSON', raw: text.slice(0, 500) });
      }

      // Expand items with quantity > 1 into individual rows
      const expanded = [];
      for (const it of parsed.items || []) {
        const qty = Math.max(1, Number(it.quantity) || 1);
        for (let i = 0; i < qty; i++) {
          expanded.push({
            name: it.name,
            category_suggested: it.category_suggested || 'друго',
            brand: it.brand || '',
            model: it.model || '',
            serial_number: it.serial_number || '',
            unit_price: it.unit_price ? Number(it.unit_price) : null,
            warranty_months: it.warranty_months ? Number(it.warranty_months) : null,
          });
        }
      }

      // Keep the file in FILES_DIR for later attachment to imported items
      res.json({
        supplier:       parsed.supplier || '',
        invoice_number: parsed.invoice_number || '',
        invoice_date:   parsed.invoice_date || '',
        currency:       parsed.currency || 'EUR',
        items: expanded,
        _temp_filename: req.file.filename,
        _temp_original: req.file.originalname,
      });
    } catch (err) {
      try { fs.unlinkSync(req.file.path); } catch(_) {}
      console.error('parse-invoice error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── BULK-IMPORT: create inventory items from validated parse result ────────
  router.post('/bulk-import', (req, res) => {
    const { items, supplier, invoice_number, invoice_date, currency, _temp_filename, _temp_original } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Няма артикули за импорт' });
    }

    const noteBase = supplier || invoice_number
      ? `Купено от ${supplier || '—'}${invoice_number ? `, фактура № ${invoice_number}` : ''}${invoice_date ? ` от ${invoice_date}` : ''}`
      : '';

    const insertItem = db.prepare(`
      INSERT INTO property_inventory
        (property_id, category, name, brand, model, serial_number, purchase_date, purchase_price, warranty_end, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    const insertFile = db.prepare(`
      INSERT INTO inventory_files (inventory_id, type, filename, original_name, size)
      VALUES (?,?,?,?,?)
    `);

    const created = [];
    for (const item of items) {
      if (!item.property_id || !item.name) continue;

      // Compute warranty_end from invoice_date + warranty_months
      let warrantyEnd = null;
      if (invoice_date && item.warranty_months) {
        const d = new Date(invoice_date);
        if (!isNaN(d)) {
          d.setMonth(d.getMonth() + Number(item.warranty_months));
          warrantyEnd = d.toISOString().slice(0, 10);
        }
      }

      const r = insertItem.run(
        Number(item.property_id),
        item.category || 'друго',
        item.name,
        item.brand || '',
        item.model || '',
        item.serial_number || '',
        invoice_date || null,
        item.unit_price ? Number(item.unit_price) : null,
        warrantyEnd,
        noteBase
      );

      // Attach the receipt file as 'receipt' on every created item
      if (_temp_filename) {
        const fp = path.join(FILES_DIR, _temp_filename);
        if (fs.existsSync(fp)) {
          const stats = fs.statSync(fp);
          insertFile.run(r.lastInsertRowid, 'receipt', _temp_filename, _temp_original || _temp_filename, stats.size);
        }
      }

      created.push({ id: r.lastInsertRowid, property_id: item.property_id, name: item.name });
    }

    res.json({ ok: true, created: created.length, items: created });
  });

  // ── DELETE a file ─────────────────────────────────────────────────────────
  router.delete('/files/:fileId', (req, res) => {
    const file = db.prepare('SELECT * FROM inventory_files WHERE id=?').get(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'Not found' });
    const fp = path.join(FILES_DIR, file.filename);
    if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch(_) {} }
    db.prepare('DELETE FROM inventory_files WHERE id=?').run(req.params.fileId);
    res.json({ ok: true });
  });

  return router;
};
