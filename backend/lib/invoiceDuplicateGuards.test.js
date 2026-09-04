// Тестове на пазача срещу дублирани фактури за НАЕМ.
//
// Пазачът е чист SQL предикат, вграден в generateRentInvoice (routes/invoices.js),
// затова тук се проверява самата заявка срещу in-memory better-sqlite3 — същият
// енджин, който работи в производство.
//
// Поводът: фактура за интернет за даден месец блокираше наема за същия имот и
// месец, защото предикатът не филтрираше по продукт. Интернетът се фактурира
// на плащане (всяко плащане → своя фактура) и няма отношение към наема.
const Database = require('better-sqlite3');

let db;

const RENT_GUARD = `
  SELECT id FROM rent_invoices
  WHERE property_id=? AND month=? AND type='invoice'
    AND (product IS NULL OR product='наем')
`;

const addInvoice = (over = {}) => {
  const row = {
    invoice_number: '1000000001', type: 'invoice', product: 'наем',
    property_id: 45, month: '2026-08', ...over,
  };
  db.prepare(`
    INSERT INTO rent_invoices (invoice_number, type, product, property_id, month)
    VALUES (@invoice_number, @type, @product, @property_id, @month)
  `).run(row);
  return row;
};

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE rent_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT, type TEXT, product TEXT,
      property_id INTEGER, month TEXT
    )
  `);
});

afterEach(() => db.close());

describe('пазач за фактура за наем', () => {
  it('хваща втора фактура за наем за същия имот и месец', () => {
    addInvoice({ product: 'наем' });
    expect(db.prepare(RENT_GUARD).get(45, '2026-08')).toBeTruthy();
  });

  it('третира стар запис без продукт (NULL) като наем', () => {
    addInvoice({ product: null });
    expect(db.prepare(RENT_GUARD).get(45, '2026-08')).toBeTruthy();
  });

  it('НЕ блокира наема заради интернет фактура за същия месец', () => {
    addInvoice({ product: 'интернет', invoice_number: '1000000065' });
    expect(db.prepare(RENT_GUARD).get(45, '2026-08')).toBeUndefined();
  });

  it('НЕ блокира наема и при две интернет фактури за месеца', () => {
    addInvoice({ product: 'интернет', invoice_number: '1000000065' });
    addInvoice({ product: 'интернет', invoice_number: '1000000066' });
    expect(db.prepare(RENT_GUARD).get(45, '2026-08')).toBeUndefined();
  });

  it('не се задейства за друг месец или друг имот', () => {
    addInvoice({ product: 'наем' });
    expect(db.prepare(RENT_GUARD).get(45, '2026-09')).toBeUndefined();
    expect(db.prepare(RENT_GUARD).get(46, '2026-08')).toBeUndefined();
  });

  it('пропуска кредитни известия — те не са дубликат', () => {
    addInvoice({ product: 'наем', type: 'credit_note' });
    expect(db.prepare(RENT_GUARD).get(45, '2026-08')).toBeUndefined();
  });
});
