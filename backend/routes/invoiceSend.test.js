// Изпращане на фактура по мейл — адресат, текст според продукта, отбелязване
// на sent_at. Мрежата е подменена (никакъв истински мейл не тръгва).
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { sendInvoiceEmail } = require('./invoices');

// същият път като в invoices.js (DATA_DIR, иначе backend/data)
const PDF_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '../data'), 'invoices');

let db, calls, realFetch, pdfName;

beforeAll(() => {
  fs.mkdirSync(PDF_DIR, { recursive: true });
  pdfName = 'test_send_' + process.pid + '.pdf';
  fs.writeFileSync(path.join(PDF_DIR, pdfName), '%PDF-1.4 тест');
});
afterAll(() => { try { fs.unlinkSync(path.join(PDF_DIR, pdfName)); } catch (_) {} });

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key';
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE properties (id INTEGER PRIMARY KEY, email TEXT);
    CREATE TABLE contracts (id INTEGER PRIMARY KEY, property_id INTEGER, tenant_email TEXT, status TEXT, kind TEXT);
    CREATE TABLE rent_invoices (id INTEGER PRIMARY KEY, invoice_number TEXT, type TEXT, product TEXT, property_id INTEGER,
                                contract_id INTEGER, month TEXT, total REAL, tenant_name TEXT, recipient_name TEXT,
                                pdf_path TEXT, sent_at TEXT);
    INSERT INTO settings (key, value) VALUES ('issuer', '{"name":"Скай Кепитъл ЕООД"}');
    INSERT INTO properties (id, email) VALUES (1, 'imot@example.com'), (2, NULL);
  `);
  calls = [];
  realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ id: 'msg_1' }) };
  };
});
afterEach(() => { global.fetch = realFetch; });

const inv = (o = {}) => {
  const row = { invoice_number: '2026000001', type: 'invoice', product: 'наем', property_id: 1, contract_id: null,
    month: '2026-10', total: 300, tenant_name: 'Иван Иванов', recipient_name: '', pdf_path: pdfName, ...o };
  const r = db.prepare(`INSERT INTO rent_invoices (invoice_number, type, product, property_id, contract_id, month, total, tenant_name, recipient_name, pdf_path)
    VALUES (@invoice_number,@type,@product,@property_id,@contract_id,@month,@total,@tenant_name,@recipient_name,@pdf_path)`).run(row);
  return db.prepare('SELECT * FROM rent_invoices WHERE id=?').get(r.lastInsertRowid);
};

describe('изпращане на фактура', () => {
  it('праща на имейла на имота и отбелязва sent_at', async () => {
    const i = inv();
    const r = await sendInvoiceEmail(db, i);
    expect(r.ok).toBe(true);
    expect(r.sent_to).toBe('imot@example.com');
    expect(calls).toHaveLength(1);
    expect(calls[0].body.to).toEqual(['imot@example.com']);
    expect(calls[0].body.subject).toMatch(/Фактура № 2026000001 — наем/);
    expect(db.prepare('SELECT sent_at FROM rent_invoices WHERE id=?').get(i.id).sent_at).toBeTruthy();
  });

  it('без имейл на имота пада към имейла от договора', async () => {
    db.prepare("INSERT INTO contracts (id, property_id, tenant_email, status, kind) VALUES (7, 2, 'naemately@example.com', 'active', 'наем')").run();
    const r = await sendInvoiceEmail(db, inv({ property_id: 2 }));
    expect(r.ok).toBe(true);
    expect(calls[0].body.to).toEqual(['naemately@example.com']);
  });

  it('изричният адрес е с предимство', async () => {
    const r = await sendInvoiceEmail(db, inv(), 'drug@example.com');
    expect(r.ok).toBe(true);
    expect(calls[0].body.to).toEqual(['drug@example.com']);
  });

  it('никъде няма имейл → грешка, без мрежа и без sent_at', async () => {
    const i = inv({ property_id: 2 });
    const r = await sendInvoiceEmail(db, i);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
    expect(db.prepare('SELECT sent_at FROM rent_invoices WHERE id=?').get(i.id).sent_at).toBeNull();
  });

  it('депозитната фактура не се описва като „за наем"', async () => {
    const r = await sendInvoiceEmail(db, inv({ product: 'депозит', invoice_number: '1000000099' }));
    expect(r.ok).toBe(true);
    expect(calls[0].body.subject).toMatch(/гаранционен депозит/);
    expect(calls[0].body.html).toMatch(/гаранционен депозит/);
    expect(calls[0].body.html).not.toMatch(/за наем за/);
  });

  it('липсващ PDF → грешка, без мрежа', async () => {
    const r = await sendInvoiceEmail(db, inv({ pdf_path: 'няма-такъв.pdf' }));
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(calls).toHaveLength(0);
  });

  it('без RESEND_API_KEY не се праща нищо', async () => {
    delete process.env.RESEND_API_KEY;
    const r = await sendInvoiceEmail(db, inv());
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('грешка от Resend не отбелязва фактурата като изпратена', async () => {
    global.fetch = async () => ({ ok: false, json: async () => ({ message: 'domain not verified' }) });
    const i = inv();
    const r = await sendInvoiceEmail(db, i);
    expect(r).toMatchObject({ ok: false, error: 'domain not verified' });
    expect(db.prepare('SELECT sent_at FROM rent_invoices WHERE id=?').get(i.id).sent_at).toBeNull();
  });
});
