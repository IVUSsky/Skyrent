// Stripe доставя събитията „поне веднъж" и повтаря при бавен отговор. Двете
// прегради в routes/payments.js са чист SQL и се проверяват тук както са там:
//   1) stripe_events(id PRIMARY KEY) + INSERT OR IGNORE → второто доставяне спира
//   2) internet_purchases.invoice_id: атомарна резервация (0) преди PDF-а →
//      две паралелни обработки не издават по фактура (Конджа 1000000071/72).
const Database = require('better-sqlite3');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE stripe_events (id TEXT PRIMARY KEY, type TEXT, received_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE internet_purchases (id INTEGER PRIMARY KEY, status TEXT, invoice_id INTEGER);
    INSERT INTO internet_purchases (id, status) VALUES (7, 'paid');
  `);
});
afterEach(() => db.close());

const claimEvent = (id, type) => db.prepare('INSERT OR IGNORE INTO stripe_events (id, type) VALUES (?, ?)').run(id, type).changes;
const claimInvoice = (pid) => db.prepare('UPDATE internet_purchases SET invoice_id=0 WHERE id=? AND invoice_id IS NULL').run(pid).changes;
const release = (pid) => db.prepare('UPDATE internet_purchases SET invoice_id=NULL WHERE id=? AND invoice_id=0').run(pid).changes;

describe('stripe_events — едно събитие, една обработка', () => {
  it('първото доставяне минава, повторното се отхвърля', () => {
    expect(claimEvent('evt_1', 'checkout.session.completed')).toBe(1);
    expect(claimEvent('evt_1', 'checkout.session.completed')).toBe(0);
  });
  it('различни събития не си пречат', () => {
    expect(claimEvent('evt_1', 'checkout.session.completed')).toBe(1);
    expect(claimEvent('evt_2', 'payment_intent.succeeded')).toBe(1);
  });
});

describe('internet_purchases.invoice_id — една фактура на покупка', () => {
  it('втората обработка не получава резервация', () => {
    expect(claimInvoice(7)).toBe(1);
    expect(claimInvoice(7)).toBe(0);
  });
  it('след записана фактура нова резервация няма', () => {
    claimInvoice(7);
    db.prepare('UPDATE internet_purchases SET invoice_id=? WHERE id=?').run(123, 7);
    expect(claimInvoice(7)).toBe(0);
  });
  it('провал при генериране освобождава резервацията, но не и реална фактура', () => {
    claimInvoice(7);
    expect(release(7)).toBe(1);
    expect(claimInvoice(7)).toBe(1);
    db.prepare('UPDATE internet_purchases SET invoice_id=? WHERE id=?').run(123, 7);
    expect(release(7)).toBe(0);
  });
});
