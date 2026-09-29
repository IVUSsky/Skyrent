const Database = require('better-sqlite3');
const { readSettings, writeSettings, dueToday, billableProperties, runMonthlyInvoicing } = require('./monthlyInvoiceCron');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE properties (id INTEGER PRIMARY KEY, адрес TEXT, наемател TEXT, email TEXT, статус TEXT, invoice_enabled INTEGER);
    CREATE TABLE rent_invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT, type TEXT DEFAULT 'invoice',
                                product TEXT, property_id INTEGER, month TEXT, total REAL, pdf_path TEXT, sent_at TEXT);
    INSERT INTO properties (id, адрес, наемател, email, статус, invoice_enabled) VALUES
      (1, 'Иширков 24, ап.1', 'Иван Иванов', 'ivan@example.com', '✅', 1),
      (2, 'Иширков 24, ап.2', 'Петър Петров', NULL, '✅', 1),
      (3, 'Мл.3 бл.305', 'Кели', NULL, '✅', 0),          -- без фактуриране
      (4, 'Празен апартамент', '', NULL, '✅', 1),          -- без наемател
      (5, 'В ремонт', 'Някой', NULL, '🔧', 1);             -- не е активен
  `);
});

describe('настройка', () => {
  it('по подразбиране всичко е изключено', () => {
    expect(readSettings(db)).toEqual({ enabled: false, day: 1, send: false });
  });
  it('записва и ограничава деня до 1–28', () => {
    expect(writeSettings(db, { enabled: true, day: 31, send: true })).toEqual({ enabled: true, day: 28, send: true });
    expect(writeSettings(db, { day: 0 }).day).toBe(28);
    expect(writeSettings(db, { day: 5 })).toEqual({ enabled: true, day: 5, send: true });
  });
  it('повреден JSON не чупи — връща изключено', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('monthly_invoicing', 'не-json')").run();
    expect(readSettings(db).enabled).toBe(false);
  });
});

describe('кога се пуска', () => {
  it('изключено → не се пуска', () => {
    expect(dueToday(db, new Date('2026-11-01T07:00:00')).due).toBe(false);
  });
  it('включено, но друг ден → не', () => {
    writeSettings(db, { enabled: true, day: 5 });
    expect(dueToday(db, new Date('2026-11-01T07:00:00')).due).toBe(false);
  });
  it('включено и денят съвпада → да', () => {
    writeSettings(db, { enabled: true, day: 5 });
    expect(dueToday(db, new Date('2026-11-05T07:00:00')).due).toBe(true);
  });
  it('вече пуснато този месец → не се повтаря (рестарт на контейнера)', () => {
    writeSettings(db, { enabled: true, day: 5 });
    db.prepare("INSERT INTO settings (key, value) VALUES ('monthly_invoicing_last_run', '2026-11')").run();
    const d = dueToday(db, new Date('2026-11-05T07:00:00'));
    expect(d.due).toBe(false);
    expect(d.reason).toMatch(/вече/);
  });
  it('следващият месец пак се пуска', () => {
    writeSettings(db, { enabled: true, day: 5 });
    db.prepare("INSERT INTO settings (key, value) VALUES ('monthly_invoicing_last_run', '2026-11')").run();
    expect(dueToday(db, new Date('2026-12-05T07:00:00')).due).toBe(true);
  });
});

describe('обхват', () => {
  it('само имоти с включено фактуриране, активни и с наемател', () => {
    expect(billableProperties(db).map(p => p.id)).toEqual([1, 2]);
  });
});

describe('издаване', () => {
  const fakeGenerate = (calls) => async (_db, { property_id, month }) => {
    calls.push({ property_id, month });
    const r = _db.prepare("INSERT INTO rent_invoices (invoice_number, product, property_id, month, total, pdf_path) VALUES (?, 'наем', ?, ?, 300, 'x.pdf')")
      .run('INV' + property_id, property_id, month);
    return { ok: true, id: r.lastInsertRowid, invoice_number: 'INV' + property_id };
  };

  it('издава за всички подходящи имоти и отбелязва месеца', async () => {
    const calls = [];
    const r = await runMonthlyInvoicing(db, { month: '2026-11', generate: fakeGenerate(calls), send_fn: async () => ({ ok: true }) });
    expect(calls.map(c => c.property_id)).toEqual([1, 2]);
    expect(r.created).toHaveLength(2);
    expect(r.sent).toHaveLength(0); // изпращането е изключено
    expect(db.prepare("SELECT value FROM settings WHERE key='monthly_invoicing_last_run'").get().value).toBe('2026-11');
  });

  it('вече издадена фактура се прескача (без дубликат)', async () => {
    const r = await runMonthlyInvoicing(db, { month: '2026-11', generate: async () => ({ ok: false, reason: 'duplicate' }), send_fn: async () => ({ ok: true }) });
    expect(r.created).toHaveLength(0);
    expect(r.skipped.map(s => s.reason)).toEqual(['duplicate', 'duplicate']);
  });

  it('преглед (dry) не издава нищо и показва кое би се издало', async () => {
    db.prepare("INSERT INTO rent_invoices (invoice_number, product, property_id, month, total) VALUES ('X1','наем',1,'2026-11',300)").run();
    const r = await runMonthlyInvoicing(db, { month: '2026-11', dry: true });
    expect(r.created.map(c => c.property_id)).toEqual([2]);
    expect(r.skipped[0]).toMatchObject({ property_id: 1, reason: 'duplicate', invoice_number: 'X1' });
    expect(db.prepare("SELECT COUNT(*) c FROM rent_invoices").get().c).toBe(1);
    expect(db.prepare("SELECT value FROM settings WHERE key='monthly_invoicing_last_run'").get()).toBeUndefined();
  });

  it('с включено изпращане праща всяка издадена фактура', async () => {
    writeSettings(db, { enabled: true, day: 1, send: true });
    const sent = [];
    const r = await runMonthlyInvoicing(db, { month: '2026-11', generate: fakeGenerate([]),
      send_fn: async (_db, inv) => { sent.push(inv.invoice_number); return { ok: true, sent_to: 'x@example.com' }; } });
    expect(sent).toEqual(['INV1', 'INV2']);
    expect(r.sent).toHaveLength(2);
  });

  it('неуспешно изпращане не спира останалите и се връща като грешка', async () => {
    writeSettings(db, { enabled: true, day: 1, send: true });
    const r = await runMonthlyInvoicing(db, { month: '2026-11', generate: fakeGenerate([]),
      send_fn: async (_db, inv) => inv.property_id === 1 ? { ok: false, error: 'Няма email адрес' } : { ok: true, sent_to: 'x@example.com' } });
    expect(r.created).toHaveLength(2);
    expect(r.sent).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ property_id: 1, error: 'Няма email адрес' });
  });

  it('грешка при издаване на един имот не проваля останалите', async () => {
    const r = await runMonthlyInvoicing(db, { month: '2026-11',
      generate: async (_db, { property_id }) => { if (property_id === 1) throw new Error('PDF гръмна'); return { ok: true, id: 9, invoice_number: 'INV2' }; },
      send_fn: async () => ({ ok: true }) });
    expect(r.errors[0]).toMatchObject({ property_id: 1, error: 'PDF гръмна' });
    expect(r.created.map(c => c.property_id)).toEqual([2]);
  });
});
