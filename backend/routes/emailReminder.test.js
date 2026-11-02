// Напомнянията за забавен наем — през самите ендпойнти.
//
// Важното тук не е текстът (той е в lib/rentReminder.test.js), а ПРЕГРАДИТЕ:
// писмо не бива да тръгва към платил, към човек, чийто падеж не е дошъл, или
// втори път за същия месец. Екранът може да е отпреди половин час, затова
// проверките са в сървъра и се тестват там.
//
// Мрежата е подменена — никакъв истински мейл не тръгва.
const Database = require('better-sqlite3');
const express = require('express');
const http = require('http');
const makeRouter = require('./email');

let db, server, base, sent, realFetch;

beforeEach(async () => {
  process.env.RESEND_API_KEY = 'test-key';
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE properties (id INTEGER PRIMARY KEY, адрес TEXT, наемател TEXT, email TEXT, телефон TEXT, наем REAL, статус TEXT);
    CREATE TABLE contracts (id INTEGER PRIMARY KEY, property_id INTEGER, tenant_email TEXT, status TEXT, kind TEXT, payment_day INTEGER, created_at TEXT);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, property_id INTEGER, категория TEXT, operation TEXT, месец TEXT, сума REAL);
    CREATE TABLE manual_rent_payments (id INTEGER PRIMARY KEY, property_id INTEGER, month TEXT, amount REAL);
    CREATE TABLE rent_invoices (id INTEGER PRIMARY KEY, property_id INTEGER, month TEXT, type TEXT, product TEXT, paid_at TEXT, total REAL);
    CREATE TABLE rent_reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, property_id INTEGER, month TEXT, sent_to TEXT,
                                 subject TEXT, body TEXT, sent_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO settings (key, value) VALUES
      ('issuer', '{"name":"Скай Кепитъл ЕООД","iban":"BG75PRCB92301053911901","email":"office@sky.bg"}'),
      ('smtp', '{"from_email":"office@sky.bg","from_name":"Скай Кепитъл"}');
    INSERT INTO properties (id, адрес, наемател, email, наем, статус) VALUES
      (1, 'Фонтани 4А', 'Стефан Петров', 'stefan@example.com', 650, '✅'),
      (2, 'Иширков 9',  'Мария Иванова', NULL,                 500, '✅'),
      (3, 'Стелар 64',  'Платил Платилов', 'platil@example.com', 700, '✅'),
      (4, 'Паркомясто', 'Никой',         'nikoy@example.com',   0,  '✅'),
      (5, 'Продаден',   'Стар наемател', 'star@example.com',  600, '🔴');
    INSERT INTO contracts (id, property_id, tenant_email, status, kind, payment_day, created_at) VALUES
      (10, 2, 'maria@example.com', 'active', 'наем', 5, '2026-01-01');
  `);

  sent = [];
  realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (base && u.startsWith(base)) return realFetch(url, opts);   // нашият собствен тестов клиент
    sent.push({ url: u, body: JSON.parse(opts.body) });             // Resend
    return {
      ok: true, status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'msg_1' }),
    };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/email', makeRouter(db));
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  global.fetch = realFetch;
  await new Promise(r => server.close(r));
});

// Миналият месец — закъснял е, независимо на кой ден пускаме теста.
const LAST = (() => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
})();

const get = (p) => realFetch(base + p).then(async r => ({ status: r.status, d: await r.json() }));
const post = (p, body) => realFetch(base + p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then(async r => ({ status: r.status, d: await r.json() }));

describe('GET /reminders — кой закъснява и какво ще му пишем', () => {
  it('изрежда закъснелите с готово писмо', async () => {
    const { d } = await get(`/api/email/reminders?month=${LAST}`);
    const byId = Object.fromEntries(d.reminders.map(r => [r.property_id, r]));
    expect(byId[1]).toBeTruthy();
    expect(byId[1].subject).toMatch(/Напомняне за наем — Фонтани 4А/);
    expect(byId[1].body).toContain('650,00 EUR');
    expect(byId[1].body).toContain('BG75PRCB92301053911901');
    expect(byId[1].body).toContain('Скай Кепитъл ЕООД');
    expect(byId[1].can_send).toBe(true);
  });

  it('имейлът се допълва от договора, когато по имота липсва', async () => {
    const { d } = await get(`/api/email/reminders?month=${LAST}`);
    const maria = d.reminders.find(r => r.property_id === 2);
    expect(maria.email).toBe('maria@example.com');
    expect(maria.can_send).toBe(true);
  });

  it('имот с наем 0 и неактивен имот не влизат', async () => {
    const { d } = await get(`/api/email/reminders?month=${LAST}`);
    const ids = d.reminders.map(r => r.property_id);
    expect(ids).not.toContain(4);
    expect(ids).not.toContain(5);
  });

  it('платилият е в списъка, но заключен — вижда се защо', async () => {
    db.prepare("INSERT INTO transactions (property_id, категория, operation, месец, сума) VALUES (3,'наем','Кт',?,700)").run(LAST);
    const { d } = await get(`/api/email/reminders?month=${LAST}`);
    const p = d.reminders.find(r => r.property_id === 3);
    expect(p.can_send).toBe(false);
    expect(p.blocked).toMatch(/банков превод/);
  });

  it('може да се поиска само един имот', async () => {
    const { d } = await get(`/api/email/reminders?month=${LAST}&ids=1`);
    expect(d.reminders.map(r => r.property_id)).toEqual([1]);
  });
});

describe('POST /reminder — изпращане след преглед', () => {
  it('праща писмото и го записва', async () => {
    const { status, d } = await post('/api/email/reminder', { property_id: 1, month: LAST });
    expect(status).toBe(200);
    expect(d.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].body.to).toBe('stefan@example.com');
    expect(sent[0].body.subject).toMatch(/Фонтани 4А/);
    expect(sent[0].body.html).toContain('650,00 EUR');
    const row = db.prepare('SELECT * FROM rent_reminders WHERE property_id=1').get();
    expect(row.sent_to).toBe('stefan@example.com');
    expect(row.month).toBe(LAST);
  });

  it('поправеният текст е този, който тръгва', async () => {
    await post('/api/email/reminder', {
      property_id: 1, month: LAST, subject: 'Моя тема', body: 'Моят текст.\n\nВтори абзац.',
    });
    expect(sent[0].body.subject).toBe('Моя тема');
    expect(sent[0].body.html).toContain('<p>Моят текст.</p>');
    expect(sent[0].body.html).toContain('<p>Втори абзац.</p>');
  });

  it('НЕ праща на платил наема', async () => {
    db.prepare('INSERT INTO manual_rent_payments (property_id, month, amount) VALUES (1,?,650)').run(LAST);
    const { status, d } = await post('/api/email/reminder', { property_id: 1, month: LAST });
    expect(status).toBe(409);
    expect(d.error).toMatch(/ръчно въведено плащане/);
    expect(sent).toHaveLength(0);
  });

  it('НЕ праща на човек, чийто падеж още не е дошъл', async () => {
    const { status, d } = await post('/api/email/reminder', { property_id: 1, month: '2099-01' });
    expect(status).toBe(400);
    expect(d.error).toMatch(/не е в списъка на закъснелите/);
    expect(sent).toHaveLength(0);
  });

  it('второ напомняне за същия месец иска изрично потвърждение', async () => {
    await post('/api/email/reminder', { property_id: 1, month: LAST });
    const again = await post('/api/email/reminder', { property_id: 1, month: LAST });
    expect(again.status).toBe(409);
    expect(again.d.error).toMatch(/Вече е изпратено/);
    expect(sent).toHaveLength(1);

    const forced = await post('/api/email/reminder', { property_id: 1, month: LAST, force: true });
    expect(forced.d.ok).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('без имот не праща — няма как да се провери плащането', async () => {
    const { status, d } = await post('/api/email/reminder', { to: 'who@example.com', month: LAST });
    expect(status).toBe(400);
    expect(d.error).toMatch(/Липсва имот/);
    expect(sent).toHaveLength(0);
  });

  it('без имейл никъде не праща', async () => {
    db.prepare('UPDATE contracts SET tenant_email=NULL WHERE property_id=2').run();
    const { status, d } = await post('/api/email/reminder', { property_id: 2, month: LAST });
    expect(status).toBe(400);
    expect(d.error).toMatch(/имейл/);
    expect(sent).toHaveLength(0);
  });
});
