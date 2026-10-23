const Database = require('better-sqlite3');
const { rentReceivedByProperty } = require('./rentReceived');

const fresh = () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, property_id INTEGER, сума REAL,
      operation TEXT, категория TEXT, дата TEXT, месец TEXT, currency TEXT, scope TEXT);
    CREATE TABLE manual_rent_payments (id INTEGER PRIMARY KEY, property_id INTEGER,
      month TEXT, amount REAL, payment_type TEXT);
    CREATE TABLE rent_invoices (id INTEGER PRIMARY KEY, type TEXT, product TEXT,
      property_id INTEGER, month TEXT, total REAL, paid_at TEXT,
      bank_tx_id INTEGER, manual_payment_id INTEGER, payment_method TEXT);
  `);
  return db;
};
const bank = (db, o) => db.prepare(`INSERT INTO transactions
  (property_id, сума, operation, категория, дата, месец, currency, scope)
  VALUES (@pid, @s, 'Кт', 'наем', @d, @m, @cur, @scope)`).run({
    pid: 1, s: 500, d: '2026-05-10', m: '2026-05', cur: 'EUR', scope: 'business', ...o });

describe('rentReceivedByProperty', () => {
  it('събира банка, брой и карта по имот', () => {
    const db = fresh();
    bank(db, { pid: 1, s: 500 });
    db.prepare("INSERT INTO manual_rent_payments (property_id, month, amount) VALUES (1,'2026-06',300)").run();
    db.prepare(`INSERT INTO rent_invoices (type, product, property_id, month, total, paid_at, payment_method)
                VALUES ('invoice','наем',1,'2026-07',200,'2026-07-05','stripe')`).run();
    const r = rentReceivedByProperty(db, '2026-01');
    expect(r.byProperty.get(1)).toBeCloseTo(1000, 2);
    expect(r.total).toBeCloseTo(1000, 2);
    expect(r.bySource).toEqual({ bank: 500, manual: 300, invoice: 200 });
  });

  it('не брои два пъти фактура, вързана за банково движение', () => {
    // Иначе всяко плащане с издадена фактура влиза двойно.
    const db = fresh();
    bank(db, { pid: 1, s: 500 });
    db.prepare(`INSERT INTO rent_invoices (type, product, property_id, month, total, paid_at, bank_tx_id)
                VALUES ('invoice','наем',1,'2026-05',500,'2026-05-10',77)`).run();
    expect(rentReceivedByProperty(db, '2026-01').total).toBeCloseTo(500, 2);
  });

  it('левовете се превалутират по колоната, не по датата', () => {
    const db = fresh();
    bank(db, { pid: 1, s: 1955.83, cur: 'BGN', d: '2026-03-01', m: '2026-03' });
    expect(rentReceivedByProperty(db, '2026-01').byProperty.get(1)).toBeCloseTo(1000, 1);
  });

  it('празна валута пада на датата', () => {
    const db = fresh();
    bank(db, { pid: 1, s: 1955.83, cur: null, d: '2025-03-01', m: '2025-03' });
    expect(rentReceivedByProperty(db, '2025-01').byProperty.get(1)).toBeCloseTo(1000, 1);
  });

  it('личният наем не е приход на дружеството', () => {
    const db = fresh();
    bank(db, { pid: 1, s: 500, scope: 'personal' });
    expect(rentReceivedByProperty(db, '2026-01').total).toBe(0);
  });

  it('само категория „наем\" и само Кт', () => {
    const db = fresh();
    db.prepare(`INSERT INTO transactions (property_id, сума, operation, категория, дата, месец, currency, scope)
                VALUES (1, 500, 'Дт', 'наем', '2026-05-10', '2026-05', 'EUR', 'business')`).run();
    db.prepare(`INSERT INTO transactions (property_id, сума, operation, категория, дата, месец, currency, scope)
                VALUES (1, 500, 'Кт', 'депозит_получен', '2026-05-10', '2026-05', 'EUR', 'business')`).run();
    expect(rentReceivedByProperty(db, '2026-01').total).toBe(0);
  });

  it('извън прозореца не влиза', () => {
    const db = fresh();
    bank(db, { pid: 1, s: 500, m: '2025-11' });
    expect(rentReceivedByProperty(db, '2026-01').total).toBe(0);
  });

  it('неплатена фактура не е приход', () => {
    const db = fresh();
    db.prepare(`INSERT INTO rent_invoices (type, product, property_id, month, total, paid_at)
                VALUES ('invoice','наем',1,'2026-07',200,NULL)`).run();
    expect(rentReceivedByProperty(db, '2026-01').total).toBe(0);
  });

  it('кредитно известие не е приход', () => {
    const db = fresh();
    db.prepare(`INSERT INTO rent_invoices (type, product, property_id, month, total, paid_at)
                VALUES ('credit_note','наем',1,'2026-07',200,'2026-07-05')`).run();
    expect(rentReceivedByProperty(db, '2026-01').total).toBe(0);
  });

  it('интернет фактура не е наем', () => {
    const db = fresh();
    db.prepare(`INSERT INTO rent_invoices (type, product, property_id, month, total, paid_at)
                VALUES ('invoice','интернет',1,'2026-07',20,'2026-07-05')`).run();
    expect(rentReceivedByProperty(db, '2026-01').total).toBe(0);
  });

  it('плащане без имот влиза в общото, но не по имот', () => {
    const db = fresh();
    bank(db, { pid: null, s: 400 });
    const r = rentReceivedByProperty(db, '2026-01');
    expect(r.total).toBeCloseTo(400, 2);
    expect(r.byProperty.size).toBe(0);
  });

  it('липсващи таблици не хвърлят', () => {
    const db = new Database(':memory:');
    const r = rentReceivedByProperty(db, '2026-01');
    expect(r.total).toBe(0);
    expect(r.byProperty.size).toBe(0);
  });
});
