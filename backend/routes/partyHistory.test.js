// История на контакта — през самия ендпойнт.
//
// Рискът тук не е в подреждането (то е в lib/contactHistory.test.js), а в
// заявките: пет таблици, нито една от които не сочи към указателя. Тестът
// пуска истинския рутер върху база със същата схема.
const Database = require('better-sqlite3');
const express = require('express');
const http = require('http');
const makeRouter = require('./contracts');

let db, server, base;

beforeEach(async () => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE properties (id INTEGER PRIMARY KEY, адрес TEXT);
    CREATE TABLE tenant_directory (id INTEGER PRIMARY KEY, name TEXT, egn TEXT, address TEXT, phone TEXT,
      email TEXT, doc_type TEXT, doc_number TEXT, doc_date TEXT, doc_country TEXT, dob TEXT, notes TEXT,
      created_at DATETIME, updated_at DATETIME);
    CREATE TABLE contracts (id INTEGER PRIMARY KEY, contract_number TEXT, property_id INTEGER, status TEXT,
      tenant_name TEXT, tenant_egn TEXT, tenant_email TEXT, tenant_phone TEXT,
      tenant2_name TEXT, tenant2_egn TEXT, tenant2_email TEXT,
      tenant_user_id INTEGER, created_at DATETIME, terminated_at DATETIME);
    CREATE TABLE rent_reminders (id INTEGER PRIMARY KEY, property_id INTEGER, month TEXT, sent_to TEXT,
      subject TEXT, body TEXT, sent_by TEXT, created_at DATETIME);
    CREATE TABLE rent_invoices (id INTEGER PRIMARY KEY, invoice_number TEXT, property_id INTEGER, month TEXT,
      tenant_name TEXT, recipient_name TEXT, total REAL, sent_at DATETIME, paid_at DATETIME);
    CREATE TABLE support_tickets (id INTEGER PRIMARY KEY, user_id INTEGER, property_id INTEGER, category TEXT,
      title TEXT, description TEXT, status TEXT, created_at DATETIME, resolved_at DATETIME);
    CREATE TABLE tenant_chat_messages (id INTEGER PRIMARY KEY, tenant_user_id INTEGER, role TEXT, content TEXT, created_at DATETIME);

    INSERT INTO properties (id, адрес) VALUES (26, 'ап.4А бл.15'), (27, 'ап.5 бл.15');
    INSERT INTO tenant_directory (id, name, egn, phone, email) VALUES
      (1, 'Стефан Петров', '8505051234', '0888123456', 'stefan@example.com'),
      (2, 'Друг Човек',    '7001011111', '0877000000', 'drug@example.com');
    INSERT INTO contracts (id, contract_number, property_id, status, tenant_name, tenant_egn, tenant_email, tenant_user_id, created_at) VALUES
      (7, '2026-041', 26, 'active', 'Стефан Петров', '8505051234', 'stefan@example.com', 32, '2026-01-05 10:00:00');
    INSERT INTO contracts (id, contract_number, property_id, status, tenant_name, tenant_egn, tenant_email, tenant_user_id, created_at) VALUES
      (8, '2026-037', 27, 'active', 'Друг Човек', '7001011111', 'drug@example.com', 33, '2026-02-01 10:00:00');
    INSERT INTO rent_reminders (property_id, month, sent_to, subject, sent_by, created_at) VALUES
      (26, '2026-10', 'stefan@example.com', 'Напомняне', 'IVUS', '2026-10-20 09:00:00'),
      (27, '2026-10', 'drug@example.com',   'Напомняне', 'IVUS', '2026-10-21 09:00:00');
    INSERT INTO rent_invoices (invoice_number, property_id, month, tenant_name, total, sent_at, paid_at) VALUES
      ('2026000010', 26, '2026-10', 'Стефан Петров', 650, '2026-10-02 08:00:00', '2026-10-04 12:00:00');
    INSERT INTO support_tickets (user_id, property_id, title, description, status, created_at, resolved_at) VALUES
      (32, 26, 'Тече кранът', 'в банята', 'resolved', '2026-09-01 15:00:00', '2026-09-03 11:00:00');
    INSERT INTO tenant_chat_messages (tenant_user_id, role, content, created_at) VALUES
      (32, 'user', 'Къде е спирателният кран?', '2026-08-10 12:00:00'),
      (32, 'assistant', 'В банята', '2026-08-10 12:00:05');
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

afterEach(async () => { await new Promise(r => server.close(r)); });

const hist = (id) => fetch(`${base}/api/contracts/parties/${id}/history`).then(async r => ({ s: r.status, d: await r.json() }));

describe('GET /parties/:id/history', () => {
  it('събира всичко за този човек', async () => {
    const { s, d } = await hist(1);
    expect(s).toBe(200);
    const kinds = d.events.map(e => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['reminder', 'contract', 'invoice_sent', 'invoice_paid', 'ticket', 'chat']));
  });

  it('най-новото е най-отгоре', async () => {
    const t = (await hist(1)).d.events.map(e => e.at);
    expect(t).toEqual([...t].sort().reverse());
  });

  it('НЕ смесва историята на другия наемател', async () => {
    const d = (await hist(1)).d;
    const text = JSON.stringify(d);
    expect(text).not.toMatch(/drug@example\.com/);
    expect(text).not.toMatch(/2026-037/);
  });

  it('вторият наемател по договор също вижда договора си', async () => {
    db.prepare("UPDATE contracts SET tenant2_name='Втора Наемателка', tenant2_egn='9001011234' WHERE id=8").run();
    db.prepare("INSERT INTO tenant_directory (id, name, egn) VALUES (3, 'Втора Наемателка', '9001011234')").run();
    const d = (await hist(3)).d;
    expect(d.events.some(e => e.kind === 'contract' && /2026-037/.test(e.title))).toBe(true);
  });

  it('непознат контакт → 404, не празен списък', async () => {
    expect((await hist(999)).s).toBe(404);
  });

  it('контакт без нищо записано връща празно, без грешка', async () => {
    db.prepare("INSERT INTO tenant_directory (id, name, egn) VALUES (4, 'Нов Контакт', '6001011111')").run();
    const { s, d } = await hist(4);
    expect(s).toBe(200);
    expect(d.events).toEqual([]);
  });

  it('липсваща таблица не чупи историята', async () => {
    db.exec('DROP TABLE support_tickets');
    const { s, d } = await hist(1);
    expect(s).toBe(200);
    expect(d.events.some(e => e.kind === 'reminder')).toBe(true);
  });
});
