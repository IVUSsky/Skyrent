// Unit tests for the invoice-number generator (lib/invoiceNumber.js).
// The module keeps TWO independent counters in the `settings` table (main +
// rent), with a legacy year-based fallback when neither is configured yet.
// Because it reads/writes `settings`, tests use an in-memory better-sqlite3 DB
// (the same engine the app uses in production). Each test starts from a fresh
// table so counter state never leaks between cases.
const Database = require('better-sqlite3');
const { nextInvoiceNumber, peekNextInvoiceNumber, counterKey } = require('./invoiceNumber');

let db;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
});

afterEach(() => db.close());

// Set a settings counter value (stored as text, mirroring production).
const setSetting = (key, value) =>
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key, String(value));

// --------------------------------------------------------------------------- 
describe('counterKey helper', () => {
  test('maps the rent flag to the rent series key', () => {
    expect(counterKey(true)).toBe('invoice_counter_rent');
    expect(counterKey(false)).toBe('invoice_counter_main');
  });
});

describe('nextInvoiceNumber — main series', () => {
  test('increments the configured main counter and zero-pads to 10 digits', () => {
    setSetting('invoice_counter_main', 61);
    expect(nextInvoiceNumber(db)).toBe('0000000062');

    // The consumed value is persisted (next call continues from here).
    const stored = db.prepare("SELECT value FROM settings WHERE key='invoice_counter_main'").get();
    expect(stored.value).toBe('62');
  });

  test('zero-pads small numbers correctly', () => {
    setSetting('invoice_counter_main', 5);
    expect(nextInvoiceNumber(db)).toBe('0000000006');
  });
});

describe('nextInvoiceNumber — rent series', () => {
  test('uses the separate rent counter when { rent: true }', () => {
    setSetting('invoice_counter_rent', 122);
    expect(nextInvoiceNumber(db, { rent: true })).toBe('0000000123');
  });

  test('main and rent counters advance independently', () => {
    setSetting('invoice_counter_main', 61);
    setSetting('invoice_counter_rent', 5);

    expect(nextInvoiceNumber(db)).toBe('0000000062');           // main -> 62
    expect(nextInvoiceNumber(db, { rent: true })).toBe('0000000006'); // rent -> 6

    // main was untouched by the rent call
    expect(nextInvoiceNumber(db)).toBe('0000000063');
  });
});

describe('nextInvoiceNumber — legacy year fallback', () => {
  test('falls back to the YYYYNNNNNN scheme when no series counter is set', () => {
    const year = new Date().getFullYear();
    expect(nextInvoiceNumber(db)).toBe(`${year}000001`);
  });

  test('increments the per-year counter on subsequent fallback calls', () => {
    const year = new Date().getFullYear();
    expect(nextInvoiceNumber(db)).toBe(`${year}000001`);
    expect(nextInvoiceNumber(db)).toBe(`${year}000002`);
  });
});

describe('peekNextInvoiceNumber — does not consume', () => {
  test('reports the next main number without advancing the counter', () => {
    setSetting('invoice_counter_main', 61);
    const peek = peekNextInvoiceNumber(db, false);

    expect(peek).toEqual({
      configured: true,
      counter: 61,
      next_sequential: 62,
      next_number: '0000000062',
    });

    // Counter must be unchanged after a peek.
    const stored = db.prepare("SELECT value FROM settings WHERE key='invoice_counter_main'").get();
    expect(stored.value).toBe('61');
  });

  test('reports the legacy year scheme when nothing is configured', () => {
    const year = new Date().getFullYear();
    expect(peekNextInvoiceNumber(db, false)).toEqual({
      configured: false,
      year,
      counter: 0,
      next_sequential: 1,
      next_number: `${year}000001`,
    });
  });
});

describe('readInt — defensive parsing', () => {
  test('parses a value that is wrapped in stray quotes (JSON string artefact)', () => {
    // Historical settings rows sometimes stored the number quoted; readInt
    // strips quotes before parseInt, so this must keep working.
    setSetting('invoice_counter_main', '"61"');
    expect(nextInvoiceNumber(db)).toBe('0000000062');
  });
});
