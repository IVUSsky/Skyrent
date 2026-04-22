const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const PHOTOS_DIR = path.join(__dirname, '../data/property_photos');
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PHOTOS_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `prop_${req.params.id}_${Date.now()}${ext}`);
  },
});
const uploadPhoto = multer({ storage: photoStorage, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = function(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM properties ORDER BY id').all();
    res.json(rows);
  });

  // Rent payment status for a given month
  router.get('/rent-status', (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const props = db.prepare(
      `SELECT * FROM properties WHERE статус = '✅' AND наемател IS NOT NULL AND наемател != '' ORDER BY адрес`
    ).all();

    // Bank-imported payments
    const bankPaid = db.prepare(
      `SELECT property_id, SUM(сума) as paid_amount, COUNT(*) as tx_count
       FROM transactions WHERE категория = 'наем' AND месец = ?
       GROUP BY property_id`
    ).all(month);
    const bankMap = {};
    bankPaid.forEach(p => { bankMap[p.property_id] = p; });

    // Manual payments (cash / other bank)
    const manualPaid = db.prepare(
      `SELECT property_id, amount, payment_type, notes
       FROM manual_rent_payments WHERE month = ?`
    ).all(month);
    const manualMap = {};
    manualPaid.forEach(p => { manualMap[p.property_id] = p; });

    const result = props.map(p => {
      const bank   = bankMap[p.id];
      const manual = manualMap[p.id];
      const paid_amount = (bank ? bank.paid_amount : 0) + (manual ? manual.amount : 0);
      return {
        ...p,
        paid_amount,
        tx_count:      bank   ? bank.tx_count      : 0,
        is_paid:       !!(bank || manual),
        manual_payment: manual || null,
      };
    });

    res.json({ month, properties: result });
  });

  // Mark rent as paid manually
  router.post('/:id/mark-paid', (req, res) => {
    try {
      const { month, amount, payment_type, notes } = req.body;
      if (!month) return res.status(400).json({ error: 'month е задължителен' });
      db.prepare(`
        INSERT INTO manual_rent_payments (property_id, month, amount, payment_type, notes)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(property_id, month) DO UPDATE SET amount=excluded.amount, payment_type=excluded.payment_type, notes=excluded.notes
      `).run(req.params.id, month, Number(amount) || 0, payment_type || 'брой', notes || null);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Unmark manual rent payment
  router.delete('/:id/mark-paid', (req, res) => {
    const month = req.query.month;
    if (!month) return res.status(400).json({ error: 'month е задължителен' });
    db.prepare('DELETE FROM manual_rent_payments WHERE property_id = ? AND month = ?').run(req.params.id, month);
    res.json({ ok: true });
  });

  router.post('/', (req, res) => {
    try {
      const { адрес, район, статус, наем, наемател, площ, тип, покупна, ремонт, market_val, email, телефон } = req.body;
      if (!адрес) return res.status(400).json({ error: 'адрес е задължителен' });
      const r = db.prepare(`
        INSERT INTO properties (адрес, район, статус, наем, наемател, площ, тип, покупна, ремонт, market_val, email, телефон)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        адрес, район || '', статус || '✅',
        Number(наем) || 0, наемател || '',
        площ ? Number(площ) : null, тип || 'друго',
        Number(покупна) || 0, Number(ремонт) || 0,
        market_val ? Number(market_val) : null,
        email || null, телефон || null
      );
      const created = db.prepare('SELECT * FROM properties WHERE id = ?').get(r.lastInsertRowid);
      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', (req, res) => {
    try {
      console.log('PUT body:', JSON.stringify(req.body));
      const cols = db.prepare('PRAGMA table_info(properties)').all();
      console.log('Columns:', cols.map(c => c.name));

      const id = parseInt(req.params.id);
      const body = req.body;

      // Вземи текущия запис първо
      const current = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
      if (!current) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Merge - ако ново поле липсва, пази старото
      const адрес      = body.адрес      !== undefined ? body.адрес      : current.адрес;
      const район      = body.район      !== undefined ? body.район      : current.район;
      const наем       = body.наем       !== undefined ? body.наем       : current.наем;
      const наемател   = body.наемател   !== undefined ? body.наемател   : current.наемател;
      const статус     = body.статус     !== undefined ? body.статус     : current.статус;
      const market_val = body.market_val !== undefined ? body.market_val : current.market_val;
      const тип        = body.тип        !== undefined ? body.тип        : current.тип;
      const площ       = body.площ       !== undefined ? body.площ       : current.площ;
      const покупна    = body.покупна    !== undefined ? body.покупна    : current.покупна;
      const ремонт     = body.ремонт     !== undefined ? body.ремонт     : current.ремонт;
      const email              = body.email              !== undefined ? body.email              : current.email;
      const телефон            = body.телефон            !== undefined ? body.телефон            : current.телефон;
      const invoice_enabled    = body.invoice_enabled    !== undefined ? body.invoice_enabled    : current.invoice_enabled;
      const invoice_recipient  = body.invoice_recipient  !== undefined ? body.invoice_recipient  : current.invoice_recipient;
      const абонат_ток  = body.абонат_ток  !== undefined ? body.абонат_ток  : current.абонат_ток;
      const абонат_вода = body.абонат_вода !== undefined ? body.абонат_вода : current.абонат_вода;
      const абонат_тец  = body.абонат_тец  !== undefined ? body.абонат_тец  : current.абонат_тец;
      const абонат_вход = body.абонат_вход !== undefined ? body.абонат_вход : current.абонат_вход;

      db.prepare(`
        UPDATE properties
        SET адрес=?, район=?, наем=?, наемател=?, статус=?, market_val=?, тип=?, площ=?, покупна=?, ремонт=?,
            email=?, телефон=?, invoice_enabled=?, invoice_recipient=?,
            абонат_ток=?, абонат_вода=?, абонат_тец=?, абонат_вход=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(адрес, район, наем, наемател, статус, market_val, тип, площ, покупна, ремонт, email, телефон, invoice_enabled, invoice_recipient, абонат_ток, абонат_вода, абонат_тец, абонат_вход, id);

      const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
      console.log('Saved тип:', updated.тип, '| покупна:', updated.покупна, '| ремонт:', updated.ремонт);

      res.json({ success: true, property: updated });
    } catch (err) {
      console.error('PUT error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Tenant history ────────────────────────────────────────────
  router.get('/:id/tenants', (req, res) => {
    const rows = db.prepare('SELECT * FROM tenant_history WHERE property_id = ? ORDER BY start_date DESC').all(req.params.id);
    res.json(rows);
  });

  router.post('/:id/tenants', (req, res) => {
    const { tenant_name, start_date, end_date, monthly_rent, deposit, conditions, notes } = req.body;
    if (!tenant_name) return res.status(400).json({ error: 'tenant_name е задължително' });
    // Auto-close previous open lease
    db.prepare("UPDATE tenant_history SET end_date = ? WHERE property_id = ? AND (end_date IS NULL OR end_date = '') AND id != -1")
      .run(start_date || new Date().toISOString().slice(0,10), req.params.id);
    const r = db.prepare(`
      INSERT INTO tenant_history (property_id, tenant_name, start_date, end_date, monthly_rent, deposit, conditions, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, tenant_name, start_date||null, end_date||null, Number(monthly_rent)||0, Number(deposit)||0, conditions||null, notes||null);
    // Also update current tenant in properties table
    db.prepare("UPDATE properties SET наемател=?, наем=? WHERE id=?").run(tenant_name, Number(monthly_rent)||0, req.params.id);
    res.status(201).json({ id: r.lastInsertRowid });
  });

  router.put('/tenants/:tid', (req, res) => {
    const { tenant_name, start_date, end_date, monthly_rent, deposit, conditions, notes } = req.body;
    db.prepare(`UPDATE tenant_history SET tenant_name=?, start_date=?, end_date=?, monthly_rent=?, deposit=?, conditions=?, notes=? WHERE id=?`)
      .run(tenant_name, start_date||null, end_date||null, Number(monthly_rent)||0, Number(deposit)||0, conditions||null, notes||null, req.params.tid);
    res.json({ ok: true });
  });

  router.delete('/tenants/:tid', (req, res) => {
    db.prepare('DELETE FROM tenant_history WHERE id = ?').run(req.params.tid);
    res.json({ ok: true });
  });

  // ── Monthly history per property ──────────────────────────────
  router.get('/:id/monthly', (req, res) => {
    const id = req.params.id;
    const rentRows = db.prepare(`
      SELECT месец, SUM(сума) as наем_total, COUNT(*) as tx_count
      FROM transactions
      WHERE property_id = ? AND категория = 'наем' AND месец IS NOT NULL
      GROUP BY месец ORDER BY месец
    `).all(id);

    const expRows = db.prepare(`
      SELECT месец, SUM(amount) as expense_total, COUNT(*) as exp_count
      FROM expense_invoices
      WHERE property_id = ? AND месец IS NOT NULL
      GROUP BY месец ORDER BY месец
    `).all(id);

    // Merge by month
    const monthMap = {};
    rentRows.forEach(r => {
      monthMap[r.месец] = { месец: r.месец, наем: r.наем_total || 0, разходи: 0 };
    });
    expRows.forEach(r => {
      if (!monthMap[r.месец]) monthMap[r.месец] = { месец: r.месец, наем: 0, разходи: 0 };
      monthMap[r.месец].разходи = r.expense_total || 0;
    });

    const result = Object.values(monthMap).sort((a, b) => a.месец.localeCompare(b.месец));
    res.json(result);
  });

  // ── Property photos ───────────────────────────────────────────
  router.get('/:id/photos', (req, res) => {
    const rows = db.prepare('SELECT * FROM property_photos WHERE property_id=? ORDER BY created_at').all(req.params.id);
    res.json(rows);
  });

  router.post('/:id/photos', uploadPhoto.array('photos', 20), (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Няма файлове' });
    const inserted = req.files.map(f => {
      const caption = req.body.caption || '';
      const r = db.prepare('INSERT INTO property_photos (property_id, filename, caption) VALUES (?,?,?)').run(req.params.id, f.filename, caption);
      return { id: r.lastInsertRowid, filename: f.filename, caption };
    });
    res.status(201).json(inserted);
  });

  router.patch('/:id/photos/:photoId', (req, res) => {
    db.prepare('UPDATE property_photos SET caption=? WHERE id=? AND property_id=?').run(req.body.caption || '', req.params.photoId, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id/photos/:photoId', (req, res) => {
    const row = db.prepare('SELECT filename FROM property_photos WHERE id=? AND property_id=?').get(req.params.photoId, req.params.id);
    if (row) {
      const fp = path.join(PHOTOS_DIR, row.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      db.prepare('DELETE FROM property_photos WHERE id=?').run(req.params.photoId);
    }
    res.json({ ok: true });
  });

  // Serve photo file
  router.get('/:id/photos/:photoId/file', (req, res) => {
    const row = db.prepare('SELECT filename FROM property_photos WHERE id=? AND property_id=?').get(req.params.photoId, req.params.id);
    if (!row) return res.status(404).end();
    res.sendFile(path.join(PHOTOS_DIR, row.filename));
  });

  return router;
};
