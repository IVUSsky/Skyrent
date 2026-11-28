// GET /api/reports/annual — заявката към базата: само фирмените сметки.
const Database = require('better-sqlite3');
const express = require('express');
const http = require('http');
const makeRouter = require('./reports');

let db, server, base, role;

beforeEach(async () => {
  role = 'admin';
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE properties (id INTEGER PRIMARY KEY, адрес TEXT, vat_exempt INTEGER DEFAULT 0);
    CREATE TABLE contracts (id INTEGER PRIMARY KEY, property_id INTEGER, status TEXT, monthly_rent REAL, currency TEXT, kind TEXT);
    CREATE TABLE loans (id INTEGER PRIMARY KEY, банка TEXT, остатък REAL, лихва REAL, вноска REAL, имоти TEXT, currency TEXT);
    CREATE TABLE import_sessions (id INTEGER PRIMARY KEY, filename TEXT, imported_at DATETIME, account_iban TEXT);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, session_id INTEGER, дата DATE, контрагент TEXT, основание TEXT,
      сума REAL, operation TEXT, категория TEXT, property_id INTEGER, месец TEXT, currency TEXT, scope TEXT);
    INSERT INTO settings VALUES ('account_scope_map', '{"BG00FIRM":"business","BG00LICHNA":"personal"}');
    INSERT INTO settings VALUES ('issuer', '{"name":"Скай Кепитъл ООД","mol":"Петър Петров","vat_number":"BG1","vat_rate":20}');
    INSERT INTO properties (id, адрес) VALUES (1, 'ап.1');
    INSERT INTO import_sessions VALUES (1, 'firm.xlsx', '2026-11-12', 'BG00FIRM'), (2, 'lichna.xlsx', '2026-11-12', 'BG00LICHNA');
    -- фирмената сметка
    INSERT INTO transactions (session_id, дата, контрагент, сума, operation, категория, property_id, месец, currency, scope)
      VALUES (1, '2026-03-05', 'Наемател', 1200, 'Кт', 'наем', 1, '2026-03', 'EUR', 'business');
    -- личната сметка: наем по личен имот, маркиран business — НЕ е на фирмата
    INSERT INTO transactions (session_id, дата, контрагент, сума, operation, категория, property_id, месец, currency, scope)
      VALUES (2, '2026-03-06', 'Друг', 500, 'Кт', 'наем', 1, '2026-03', 'EUR', 'business');
    -- ръчен запис без сесия (наем в брой) — НЕ е през банката
    INSERT INTO transactions (session_id, дата, контрагент, сума, operation, категория, property_id, месец, currency, scope)
      VALUES (NULL, '2026-03-07', 'Кеш', 400, 'Кт', 'наем', 1, '2026-03', 'EUR', 'business');
  `);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { role }; next(); });
  app.use('/api/reports', makeRouter(db));
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise(r => server.close(r));
  db.close();
});

test('брои само движенията по сметките, маркирани като фирмени', async () => {
  const r = await fetch(`${base}/api/reports/annual?year=2026`);
  expect(r.status).toBe(200);
  const j = await r.json();
  expect(j.source).toBe('accounts');
  expect(j.accounts).toEqual(['BG00FIRM']);
  expect(j.totals.rent_gross).toBe(1200);
  expect(j.totals.rent_net).toBe(1000);
  expect(j.years).toEqual([2026]);
  expect(j.company).toBe('Скай Кепитъл ООД');
});

test('без карта на сметките — импортираните бизнес движения, без ръчните', async () => {
  db.prepare("DELETE FROM settings WHERE key='account_scope_map'").run();
  const j = await (await fetch(`${base}/api/reports/annual?year=2026`)).json();
  expect(j.source).toBe('scope');
  expect(j.totals.rent_gross).toBe(1700);
});

test('само за администратор', async () => {
  role = 'tenant';
  const r = await fetch(`${base}/api/reports/annual?year=2026`);
  expect(r.status).toBe(403);
});

test('невалидна година → 400', async () => {
  const r = await fetch(`${base}/api/reports/annual?year=1900`);
  expect(r.status).toBe(400);
});
