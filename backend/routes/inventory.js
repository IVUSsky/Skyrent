// Property inventory CRUD — furniture, appliances, electronics with photos
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
  router.post('/:id/files', upload.single('file'), (req, res) => {
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
