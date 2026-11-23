// Партидите на договора — редакция през PUT /api/contracts/:id.
//
// Договорът пази собствено копие на партидите от имота към деня на създаване.
// Поправка в имота после не стига до договора, затова полетата трябва да се
// редактират и тук — без да се пипа подписаният PDF.
const Database = require('better-sqlite3');
const express = require('express');
const http = require('http');
const makeRouter = require('./contracts');

let db, server, base;

beforeEach(async () => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE properties (id INTEGER PRIMARY KEY, адрес TEXT, абонат_ток TEXT);
    CREATE TABLE contracts (id INTEGER PRIMARY KEY, contract_number TEXT, property_id INTEGER, status TEXT,
      kind TEXT, template_id INTEGER, pdf_path TEXT, signed_pdf_path TEXT, protocol_pdf_path TEXT,
      payment_day INTEGER, monthly_rent REAL, deposit REAL,
      deposit_at_signing REAL, deposit_part_1 REAL, deposit_part_2 REAL, deposit_months TEXT,
      абонат_ток TEXT, абонат_вода TEXT, абонат_тец TEXT, абонат_вход TEXT);
    CREATE TABLE contract_templates (id INTEGER PRIMARY KEY, name TEXT, kind TEXT);
    INSERT INTO contract_templates (id, name, kind) VALUES (7, 'Наем', 'наем');
    INSERT INTO properties (id, адрес, абонат_ток) VALUES (5, 'бл.64', '310262395207');
    INSERT INTO contracts (id, contract_number, property_id, status, kind, template_id, pdf_path, signed_pdf_path,
      payment_day, monthly_rent, deposit, абонат_ток, абонат_вода, абонат_тец, абонат_вход)
    VALUES (51, '2026-032', 5, 'active', 'наем', 7, 'contract_2026-032.pdf', 'signed.pdf',
      5, 680, 680, '370761395207', '260094', '210078279', '');
  `);
  db.control = db;
  db.orgId = 1;

  const app = express();
  app.use(express.json());
  app.use('/api/contracts', makeRouter(db));
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise(r => server.close(r));
  db.close();
});

const put = (id, body) => fetch(`${base}/api/contracts/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('партидите на договора се поправят, без да се прегенерира PDF', async () => {
  const r = await put(51, {
    абонат_ток: '310262395207', абонат_вода: '2000947511', абонат_тец: ' 2100672570 ', regenerate: false,
  });
  const j = await r.json();
  expect(r.status).toBe(200);
  expect(j.regenerated).toBe(false);
  const c = db.prepare('SELECT * FROM contracts WHERE id=51').get();
  expect(c.абонат_ток).toBe('310262395207');
  expect(c.абонат_вода).toBe('2000947511');
  expect(c.абонат_тец).toBe('2100672570');           // изчистен от интервали
  expect(c.pdf_path).toBe('contract_2026-032.pdf');   // документът не е пипнат
  expect(c.signed_pdf_path).toBe('signed.pdf');
  expect(c.monthly_rent).toBe(680);                    // другото не е пипнато
});

test('празна партида се записва като NULL', async () => {
  await put(51, { абонат_вода: '', regenerate: false });
  expect(db.prepare('SELECT абонат_вода FROM contracts WHERE id=51').get().абонат_вода).toBeNull();
});

test('договорът не пише обратно в имота', async () => {
  await put(51, { абонат_ток: '999999999999', regenerate: false });
  expect(db.prepare('SELECT абонат_ток FROM properties WHERE id=5').get().абонат_ток).toBe('310262395207');
});
