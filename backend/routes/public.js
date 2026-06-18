// Публичен каталог под наем — БЕЗ auth. Монтира се ПРЕДИ authMiddleware.
// Заобикаля ALS/dbProxy: отваря конкретната org база през getOrgDb(orgId).
// Връща само ПУБЛИКУВАНИ имоти и само безопасни полета.

const express = require('express');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const PHOTOS_DIR = path.join(DATA_DIR, 'property_photos');

module.exports = function (getOrgDb) {
  const router = express.Router();

  const openOrg = (orgId) => {
    const id = Number(orgId);
    if (!id || id < 1) return null;
    try { return getOrgDb(id); } catch { return null; }
  };

  // Една обява (само ако е публикувана)
  router.get('/listings/:orgId/:id', (req, res) => {
    const db = openOrg(req.params.orgId);
    if (!db) return res.status(404).json({ error: 'Не е намерена' });
    const p = db.prepare('SELECT id, адрес, район, наем, тип, площ, listing_desc, published FROM properties WHERE id=?').get(req.params.id);
    if (!p || !p.published) return res.status(404).json({ error: 'Не е намерена' });
    const photos = db.prepare('SELECT id FROM property_photos WHERE property_id=? ORDER BY created_at').all(p.id);
    res.json({
      org_id: Number(req.params.orgId),
      id: p.id, адрес: p.адрес, район: p.район, наем: p.наем, тип: p.тип, площ: p.площ,
      desc: p.listing_desc || '',
      photo_ids: photos.map(x => x.id),
    });
  });

  // Снимка на публикувана обява
  router.get('/listings/:orgId/:id/photo/:photoId', (req, res) => {
    const db = openOrg(req.params.orgId);
    if (!db) return res.status(404).end();
    const p = db.prepare('SELECT published FROM properties WHERE id=?').get(req.params.id);
    if (!p || !p.published) return res.status(404).end();
    const ph = db.prepare('SELECT filename FROM property_photos WHERE id=? AND property_id=?').get(req.params.photoId, req.params.id);
    if (!ph) return res.status(404).end();
    const fp = path.join(PHOTOS_DIR, path.basename(ph.filename));
    if (!fp.startsWith(PHOTOS_DIR) || !fs.existsSync(fp)) return res.status(404).end();
    res.sendFile(fp);
  });

  // Запитване → lead за наемодателя
  router.post('/listings/:orgId/:id/inquiry', (req, res) => {
    const db = openOrg(req.params.orgId);
    if (!db) return res.status(404).json({ error: 'Не е намерена' });
    const p = db.prepare('SELECT id, published FROM properties WHERE id=?').get(req.params.id);
    if (!p || !p.published) return res.status(404).json({ error: 'Не е намерена' });
    const { name, email, phone, message } = req.body || {};
    if (!name || (!email && !phone)) return res.status(400).json({ error: 'Име и контакт (имейл или телефон) са задължителни' });
    db.prepare('INSERT INTO listing_inquiries (property_id, name, email, phone, message) VALUES (?,?,?,?,?)')
      .run(p.id, String(name).slice(0, 120), String(email || '').slice(0, 160), String(phone || '').slice(0, 40), String(message || '').slice(0, 1000));
    res.json({ ok: true });
  });

  return router;
};
