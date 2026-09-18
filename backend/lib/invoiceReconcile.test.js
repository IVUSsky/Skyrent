// Сверяване фактура ↔ банков превод / ръчно плащане (in-memory better-sqlite3).
const Database = require('better-sqlite3');
const { reconcileInvoices } = require('./invoiceReconcile');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE properties (id INTEGER PRIMARY KEY, наем REAL);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, дата TEXT, контрагент TEXT, сума REAL, currency TEXT,
                               operation TEXT, категория TEXT, property_id INTEGER, месец TEXT);
    CREATE TABLE manual_rent_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, property_id INTEGER, month TEXT, amount REAL, payment_type TEXT);
    CREATE TABLE rent_invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT, type TEXT DEFAULT 'invoice', product TEXT,
                                property_id INTEGER, month TEXT, total REAL, paid_at TEXT, payment_method TEXT,
                                bank_tx_id INTEGER, manual_payment_id INTEGER, issued_at TEXT, contract_id INTEGER);
    INSERT INTO properties (id, наем) VALUES (9, 300), (19, 153);
  `);
});
const inv = (o) => db.prepare(`INSERT INTO rent_invoices (invoice_number, product, property_id, month, total, issued_at, paid_at, payment_method)
  VALUES (@n, @product, @pid, @month, @total, @issued, @paid_at, @pm)`).run({ n: '1', product: 'наем', pid: 9, month: '2026-09', total: 300, issued: '2026-09-18', paid_at: null, pm: null, ...o }).lastInsertRowid;
const tx = (o) => db.prepare(`INSERT INTO transactions (дата, контрагент, сума, currency, operation, категория, property_id, месец)
  VALUES (@d, @k, @s, @cur, 'Кт', @cat, @pid, @m)`).run({ d: '2026-09-05', k: 'SEBASTIAN', s: 300, cur: 'EUR', cat: 'наем', pid: 9, m: '2026-09', ...o }).lastInsertRowid;
const get = (id) => db.prepare('SELECT * FROM rent_invoices WHERE id=?').get(id);

describe('фактура за наем', () => {
  it('банков превод „наем" за същия месец → платена (банка, датата на превода, bank_tx_id)', () => {
    const id = inv({}); const t = tx({});
    const r = reconcileInvoices(db);
    expect(r.changes).toEqual([expect.objectContaining({ id, action: 'paid', method: 'bank', paid_at: '2026-09-05' })]);
    const row = get(id);
    expect(row.paid_at).toBe('2026-09-05 00:00:00');
    expect(row.payment_method).toBe('bank');
    expect(row.bank_tx_id).toBe(t);
  });
  it('dry → нищо не се записва', () => {
    const id = inv({}); tx({});
    const r = reconcileInvoices(db, { dry: true });
    expect(r.changes).toHaveLength(1);
    expect(get(id).paid_at).toBeNull();
  });
  it('частично плащане не покрива фактурата', () => {
    const id = inv({}); tx({ s: 150 });
    expect(reconcileInvoices(db).changes).toHaveLength(0);
    expect(get(id).paid_at).toBeNull();
  });
  it('толеранс 1 € за закръгляне бруто/нето', () => {
    const id = inv({ total: 36.82 }); tx({ s: 37, pid: 9 });
    reconcileInvoices(db);
    expect(get(id).paid_at).not.toBeNull();
  });
  it('превод за друг месец не покрива', () => {
    const id = inv({}); tx({ m: '2026-08' });
    reconcileInvoices(db);
    expect(get(id).paid_at).toBeNull();
  });
  it('ръчно отбелязано плащане в брой → платена (cash, manual_payment_id)', () => {
    const id = inv({});
    const mid = db.prepare(`INSERT INTO manual_rent_payments (property_id, month, amount, payment_type) VALUES (9,'2026-09',300,'брой')`).run().lastInsertRowid;
    reconcileInvoices(db);
    const row = get(id);
    expect(row.payment_method).toBe('cash');
    expect(row.manual_payment_id).toBe(mid);
  });
  it('Stripe и ръчно „✓ Платена" не се пипат дори без превод', () => {
    const a = inv({ paid_at: '2026-09-02 10:00:00', pm: 'stripe' });
    const b = inv({ n: '2', paid_at: '2026-09-03 00:00:00', pm: 'bank' });
    const r = reconcileInvoices(db);
    expect(r.changes).toHaveLength(0);
    expect(get(a).paid_at).toBe('2026-09-02 10:00:00');
    expect(get(b).paid_at).toBe('2026-09-03 00:00:00');
  });
  it('изведен статус пада, когато преводът изчезне', () => {
    const id = inv({}); const t = tx({});
    reconcileInvoices(db);
    expect(get(id).paid_at).not.toBeNull();
    db.prepare('DELETE FROM transactions WHERE id=?').run(t);
    const r = reconcileInvoices(db);
    expect(r.changes).toEqual([expect.objectContaining({ id, action: 'unpaid' })]);
    expect(get(id).paid_at).toBeNull();
    expect(get(id).bank_tx_id).toBeNull();
  });
  it('BGN превод се преизчислява в EUR', () => {
    const id = inv({ total: 100, month: '2025-11' }); tx({ s: 195.58, cur: 'BGN', m: '2025-11', d: '2025-11-03' });
    reconcileInvoices(db);
    expect(get(id).paid_at).toBe('2025-11-03 00:00:00');
  });
  it('филтър по имот/месец', () => {
    const a = inv({}); tx({});
    const b = inv({ n: '2', pid: 19, total: 153 }); tx({ pid: 19, s: 153 });
    reconcileInvoices(db, { property_id: 19, month: '2026-09' });
    expect(get(a).paid_at).toBeNull();
    expect(get(b).paid_at).not.toBeNull();
  });
});

describe('фактура за депозит', () => {
  it('превод „депозит_получен" около датата на фактурата → платена', () => {
    const id = inv({ product: 'депозит', total: 300, month: '2026-09' });
    tx({ cat: 'депозит_получен', m: '2026-09', d: '2026-09-01' });
    reconcileInvoices(db);
    expect(get(id).paid_at).toBe('2026-09-01 00:00:00');
  });
  it('„наем + депозит" в един превод: наемът е платен, излишъкът покрива депозита (Илия 340 = 170 + 170)', () => {
    db.prepare('UPDATE properties SET наем=170 WHERE id=9').run();
    const rent = inv({ total: 170 });
    const dep = inv({ n: '2', product: 'депозит', total: 170 });
    tx({ s: 340 });
    const r = reconcileInvoices(db);
    expect(r.changes.map(c => c.action)).toEqual(['paid', 'paid']);
    expect(get(rent).paid_at).not.toBeNull();
    expect(get(dep).paid_at).not.toBeNull();
  });
  it('само наемът е преведен → депозитът остава неплатен', () => {
    const rent = inv({ total: 300 });
    const dep = inv({ n: '2', product: 'депозит', total: 300 });
    tx({ s: 300 });
    reconcileInvoices(db);
    expect(get(rent).paid_at).not.toBeNull();
    expect(get(dep).paid_at).toBeNull();
  });
  it('депозит, преведен 4 месеца по-рано, не се връзва', () => {
    const id = inv({ product: 'депозит', total: 300, issued: '2026-09-18' });
    tx({ cat: 'депозит_получен', d: '2026-05-01', m: '2026-05' });
    reconcileInvoices(db);
    expect(get(id).paid_at).toBeNull();
  });
});
