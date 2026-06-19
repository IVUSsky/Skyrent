// Публичен каталог под наем — БЕЗ auth. Монтира се ПРЕДИ authMiddleware.
// Заобикаля ALS/dbProxy: отваря конкретната org база през getOrgDb(orgId).
// Връща само ПУБЛИКУВАНИ имоти и само безопасни полета.

const express = require('express');
const path = require('path');
const fs = require('fs');
const { notifyAdmin } = require('../lib/notify');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const PHOTOS_DIR = path.join(DATA_DIR, 'property_photos');

const esc = (s) => String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// Имейл до наемодателя при ново запитване (best-effort). Получател: issuer.email
// от org settings → fallback org admin имейл от control.db.
async function sendInquiryEmail(db, controlDb, orgId, inq, propAddr) {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return;
    let to = null;
    try { const s = db.prepare("SELECT value FROM settings WHERE key='issuer'").get(); if (s) to = JSON.parse(s.value)?.email || null; } catch (_) {}
    if (!to && controlDb) { try { to = controlDb.prepare("SELECT email FROM users WHERE organization_id=? AND email IS NOT NULL AND email!='' ORDER BY is_superadmin DESC, id ASC LIMIT 1").get(orgId)?.email || null; } catch (_) {} }
    if (!to) return;
    const from = process.env.RESEND_FROM_EMAIL || 'info@skycapital.pro';
    const html = `<p>Ново запитване за обявата <b>${esc(propAddr || 'имот под наем')}</b>:</p>
      <p><b>${esc(inq.name)}</b><br>${inq.phone ? 'Тел: ' + esc(inq.phone) + '<br>' : ''}${inq.email ? 'Имейл: ' + esc(inq.email) + '<br>' : ''}${inq.message ? 'Съобщение: ' + esc(inq.message) : ''}</p>
      <p>Виж всички запитвания в Skyrent → таб <b>Имоти → 📨 Запитвания</b>.</p>`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `Skyrent <${from}>`, to: [to], subject: `Ново запитване — ${propAddr || 'обява под наем'}`, html }),
    });
  } catch (e) { console.warn('[inquiry email] failed:', e.message); }
}

module.exports = function (getOrgDb, controlDb) {
  const router = express.Router();

  const openOrg = (orgId) => {
    const id = Number(orgId);
    if (!id || id < 1) return null;
    try { return getOrgDb(id); } catch { return null; }
  };

  // Каталог — събира публикуваните обяви от ВСИЧКИ организации (cross-org).
  // Филтри: ?city= &type= &min= &max=. За малък мащаб iterира org базите;
  // при растеж → материализиран индекс.
  router.get('/catalog', (req, res) => {
    try {
      const { city, type, min, max } = req.query;
      const orgs = controlDb.prepare("SELECT id FROM organizations WHERE status != 'suspended'").all();
      const out = [];
      for (const o of orgs) {
        let db;
        try { db = getOrgDb(o.id); } catch { continue; }
        let rows;
        try { rows = db.prepare('SELECT id, адрес, район, наем, тип, площ, listing_desc, наемател FROM properties WHERE published=1').all(); }
        catch { continue; }
        for (const p of rows) {
          if (p.наемател && String(p.наемател).trim()) continue; // отдаден → не се показва
          let photo = null;
          try { photo = db.prepare('SELECT id FROM property_photos WHERE property_id=? ORDER BY created_at LIMIT 1').get(p.id)?.id ?? null; } catch {}
          out.push({ org_id: o.id, id: p.id, район: p.район, адрес: p.адрес, наем: p.наем, тип: p.тип, площ: p.площ, desc: p.listing_desc || '', photo });
        }
      }
      let list = out;
      if (city) { const c = String(city).toLowerCase(); list = list.filter(x => (x.район || '').toLowerCase().includes(c) || (x.адрес || '').toLowerCase().includes(c)); }
      if (type) list = list.filter(x => x.тип === type);
      if (min) list = list.filter(x => Number(x.наем) >= Number(min));
      if (max) list = list.filter(x => Number(x.наем) <= Number(max));
      list.sort((a, b) => Number(a.наем) - Number(b.наем));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Една обява (само ако е публикувана)
  router.get('/listings/:orgId/:id', (req, res) => {
    const db = openOrg(req.params.orgId);
    if (!db) return res.status(404).json({ error: 'Не е намерена' });
    const p = db.prepare('SELECT id, адрес, район, наем, тип, площ, listing_desc, listing_video, published, наемател FROM properties WHERE id=?').get(req.params.id);
    // 404 ако не е публикувана ИЛИ е отдадена (има наемател)
    if (!p || !p.published || (p.наемател && String(p.наемател).trim())) return res.status(404).json({ error: 'Не е намерена или вече е отдадена' });
    const photos = db.prepare('SELECT id FROM property_photos WHERE property_id=? ORDER BY created_at').all(p.id);
    res.json({
      org_id: Number(req.params.orgId),
      id: p.id, адрес: p.адрес, район: p.район, наем: p.наем, тип: p.тип, площ: p.площ,
      desc: p.listing_desc || '', video: p.listing_video || '',
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
    const p = db.prepare('SELECT id, published, адрес FROM properties WHERE id=?').get(req.params.id);
    if (!p || !p.published) return res.status(404).json({ error: 'Не е намерена' });
    const { name, email, phone, message } = req.body || {};
    if (!name || (!email && !phone)) return res.status(400).json({ error: 'Име и контакт (имейл или телефон) са задължителни' });
    const inq = {
      name: String(name).slice(0, 120), email: String(email || '').slice(0, 160),
      phone: String(phone || '').slice(0, 40), message: String(message || '').slice(0, 1000),
    };
    const r = db.prepare('INSERT INTO listing_inquiries (property_id, name, email, phone, message) VALUES (?,?,?,?,?)')
      .run(p.id, inq.name, inq.email, inq.phone, inq.message);
    // Известия за наемодателя (best-effort): in-app 🔔 + имейл
    try {
      notifyAdmin(db, {
        kind: 'listing_inquiry',
        title: 'Ново запитване за обява под наем',
        body: `${inq.name}${inq.phone ? ' · ' + inq.phone : ''}${inq.email ? ' · ' + inq.email : ''}${p.адрес ? ' — ' + p.адрес : ''}`,
        link: 'portfolio', ref_type: 'listing_inquiry', ref_id: r.lastInsertRowid,
      });
    } catch (_) {}
    sendInquiryEmail(db, controlDb, Number(req.params.orgId), inq, p.адрес).catch(() => {});
    res.json({ ok: true });
  });

  return router;
};
