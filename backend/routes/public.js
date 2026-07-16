// Публичен каталог под наем — БЕЗ auth. Монтира се ПРЕДИ authMiddleware.
// Заобикаля ALS/dbProxy: отваря конкретната org база през getOrgDb(orgId).
// Връща само ПУБЛИКУВАНИ имоти и само безопасни полета.

const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { notifyAdmin } = require('../lib/notify');
const { buildRentalContract } = require('../lib/publicContractPdf');

// Лимит за публичния генератор на договори (PDF е по-тежък ресурс).
const contractLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 30,
  message: { error: 'Твърде много заявки. Опитайте по-късно.' },
  standardHeaders: true, legacyHeaders: false,
});

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

  // ── Рутер poll (интернет препродажба) ─────────────────────────────────
  // Рутерът пита ИЗХОДЯЩО какво е желаното състояние на нета. Нужно е, защото
  // някои ISP-та режат входящия достъп до публичния IP при спрян нет → Skyrent
  // не може да достигне рутера да го пусне обратно. Изходящото винаги минава.
  // Без JWT (рутерът не може) — авторизация чрез poll_token в URL-а.
  // Връща чист текст "1" (пуснат) или "0" (спрян) — лесно за RouterOS /tool/fetch.
  router.get('/router-poll/:org/:id', (req, res) => {
    res.set('Content-Type', 'text/plain');
    try {
      const org = Number(req.params.org), id = Number(req.params.id);
      const token = req.query.token || req.get('X-Poll-Token');
      if (!org || !id || !token) return res.status(400).send('0');
      const odb = openOrg(org);
      if (!odb) return res.status(404).send('0');
      const r = odb.prepare('SELECT id, poll_token, desired_access FROM routers WHERE id=?').get(id);
      if (!r || !r.poll_token || r.poll_token !== token) return res.status(403).send('0');
      odb.prepare("UPDATE routers SET poll_seen_at=datetime('now'), status='online', last_seen_at=datetime('now') WHERE id=?").run(id);
      const allow = (r.desired_access == null || r.desired_access) ? '1' : '0';
      return res.send(allow);
    } catch (e) { return res.status(500).send('0'); }
  });

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
        try { rows = db.prepare('SELECT id, адрес, район, наем, тип, площ, listing_desc, listing_video, наемател FROM properties WHERE published=1').all(); }
        catch { continue; }
        for (const p of rows) {
          if (p.наемател && String(p.наемател).trim()) continue; // отдаден → не се показва
          let photo = null;
          try { photo = db.prepare('SELECT id FROM property_photos WHERE property_id=? ORDER BY created_at LIMIT 1').get(p.id)?.id ?? null; } catch {}
          out.push({ org_id: o.id, id: p.id, район: p.район, адрес: p.адрес, наем: p.наем, тип: p.тип, площ: p.площ, desc: p.listing_desc || '', photo, video: !!p.listing_video });
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
    let white_label = false;
    try { const w = db.prepare("SELECT value FROM settings WHERE key='white_label'").get(); white_label = !!w && (w.value === 'true' || w.value === '"true"'); } catch (_) {}
    res.json({
      org_id: Number(req.params.orgId),
      id: p.id, адрес: p.адрес, район: p.район, наем: p.наем, тип: p.тип, площ: p.площ,
      desc: p.listing_desc || '', video: p.listing_video || '',
      photo_ids: photos.map(x => x.id), white_label,
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

  // SEO инструмент: генериране на „Договор за наем" (образец) → PDF. БЕЗ login.
  // Запитване за довършителни работи (страница /remonti) → имейл до Скай.
  // Rate limited (същия лимитер като договора — публична форма).
  router.post('/remont-inquiry', contractLimiter, async (req, res) => {
    try {
      const b = req.body || {};
      const name = String(b.name || '').trim().slice(0, 120);
      const phone = String(b.phone || '').trim().slice(0, 60);
      const email = String(b.email || '').trim().slice(0, 120);
      const obj = String(b.object || '').trim().slice(0, 200);
      const msg = String(b.message || '').trim().slice(0, 2000);
      if (!name || (!phone && !email)) {
        return res.status(400).json({ error: 'Име и телефон или имейл са задължителни' });
      }
      if (b.company) return res.json({ ok: true }); // honeypot — тихо игнорирай ботове

      const resendKey = process.env.RESEND_API_KEY;
      const to = process.env.REMONT_INQUIRY_EMAIL || 'info@skycapital.pro';
      if (resendKey) {
        const from = process.env.RESEND_FROM_EMAIL || 'info@skycapital.pro';
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `Sky Capital <${from}>`,
            to: [to],
            reply_to: email || undefined,
            subject: `🔨 Запитване за ремонт до ключ — ${name}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px">
              <h2 style="color:#15151e">Ново запитване — довършителни работи</h2>
              <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
                <tr><td style="color:#888">Име:</td><td><b>${esc(name)}</b></td></tr>
                <tr><td style="color:#888">Телефон:</td><td>${esc(phone) || '—'}</td></tr>
                <tr><td style="color:#888">Имейл:</td><td>${esc(email) || '—'}</td></tr>
                <tr><td style="color:#888">Обект:</td><td>${esc(obj) || '—'}</td></tr>
              </table>
              <p style="background:#f6f6f9;border-left:3px solid #c9a24b;padding:10px 14px;font-size:14px;white-space:pre-wrap">${esc(msg) || '(без съобщение)'}</p>
              <p style="font-size:12px;color:#999">Изпратено от формата на skycapital.pro/remonti</p>
            </div>`,
          }),
        });
      }
      // In-app известие към админите на org 1 (Скай) — resilient дори без Resend
      try { const odb = getOrgDb(1); notifyAdmin(odb, { kind: 'remont_inquiry', title: `🔨 Запитване за ремонт: ${name}`, body: (phone || email) + (obj ? ' · ' + obj : ''), link: 'dashboard' }); } catch (_) {}
      res.json({ ok: true });
    } catch (err) {
      console.error('[remont-inquiry]', err.message);
      res.status(500).json({ error: 'Грешка при изпращане — опитайте по-късно или се обадете.' });
    }
  });

  router.post('/rental-contract', contractLimiter, async (req, res) => {
    try {
      const f = req.body || {};
      if (!f.landlord_name || !f.tenant_name || !f.property_address) {
        return res.status(400).json({ error: 'Наемодател, наемател и адрес на имота са задължителни' });
      }
      const pdf = await buildRentalContract(f);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="dogovor-naem.pdf"');
      res.send(pdf);
    } catch (e) {
      console.warn('[rental-contract] failed:', e.message);
      res.status(500).json({ error: 'Грешка при генериране на документа' });
    }
  });

  // Динамичен sitemap: маркетинг страници + ВСИЧКИ публикувани обяви (cross-org).
  // Сервира се от api домейна; с Domain property в GSC (покрива и api., и root)
  // се подава директно. URL-ите сочат каноничния skycapital.pro.
  router.get('/sitemap.xml', (req, res) => {
    const SITE = 'https://skycapital.pro';
    const esc2 = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const urls = [
      { loc: SITE + '/', freq: 'weekly', pri: '1.0' },
      { loc: SITE + '/imoti', freq: 'daily', pri: '0.9' },
      { loc: SITE + '/dogovor-naem', freq: 'monthly', pri: '0.8' },
      { loc: SITE + '/kalkulator-naem', freq: 'monthly', pri: '0.8' },
      { loc: SITE + '/remonti', freq: 'monthly', pri: '0.8' },
      { loc: SITE + '/blog', freq: 'monthly', pri: '0.7' },
    ];
    try {
      const orgs = controlDb.prepare("SELECT id FROM organizations WHERE status != 'suspended'").all();
      for (const o of orgs) {
        let odb;
        try { odb = getOrgDb(o.id); } catch { continue; }
        let rows;
        try { rows = odb.prepare('SELECT id, наемател FROM properties WHERE published=1').all(); } catch { continue; }
        for (const p of rows) {
          if (p.наемател && String(p.наемател).trim()) continue; // отдаден → не се листва
          urls.push({ loc: `${SITE}/obiava/${o.id}-${p.id}`, freq: 'weekly', pri: '0.7' });
        }
      }
    } catch (_) {}
    const body = urls.map(u =>
      `  <url>\n    <loc>${esc2(u.loc)}</loc>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`
    ).join('\n');
    res.setHeader('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
  });

  return router;
};
