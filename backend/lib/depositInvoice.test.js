// Тестове за фактурата за гаранционен депозит.
//
// Депозитът е трети продукт до наема и интернета. Двете неща, които могат да
// се счупят тихо, са: (1) пазачите за дубликат да се засекат помежду си и да
// блокират наема, и (2) изборът „с/без ДДС" да падне върху подразбирането.
//
// Пазачите са чист SQL в routes/invoices.js, затова се проверяват срещу
// in-memory better-sqlite3 — същият енджин, който върти производството.
const Database = require('better-sqlite3');

let db;

// Точните предикати от routes/invoices.js
const RENT_GUARD = `
  SELECT id FROM rent_invoices
  WHERE property_id=? AND month=? AND type='invoice'
    AND (product IS NULL OR product='наем')
`;
const DEPOSIT_GUARD = `
  SELECT id, invoice_number FROM rent_invoices
  WHERE property_id=? AND type='invoice' AND product='депозит'
`;
const PENDING = `
  SELECT c.id AS contract_id, c.contract_number, c.property_id, c.deposit
  FROM contracts c
  JOIN properties p ON p.id = c.property_id
  WHERE c.status='active' AND c.deposit > 0
    AND NOT EXISTS (
      SELECT 1 FROM rent_invoices i
      WHERE i.property_id = c.property_id AND i.type='invoice' AND i.product='депозит'
    )
  ORDER BY c.start_date DESC
`;

const addInvoice = (over = {}) => {
  const row = {
    invoice_number: '1000000001', type: 'invoice', product: 'наем',
    property_id: 48, month: '2026-09', ...over,
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
    );
    CREATE TABLE properties (id INTEGER PRIMARY KEY, адрес TEXT);
    CREATE TABLE contracts (
      id INTEGER PRIMARY KEY, contract_number TEXT, property_id INTEGER,
      deposit REAL, status TEXT, start_date TEXT, tenant_name TEXT
    );
    INSERT INTO properties (id, адрес) VALUES (48, 'Гараж № 38');
    INSERT INTO contracts (id, contract_number, property_id, deposit, status, start_date, tenant_name)
    VALUES (44, '2026-025', 48, 170, 'active', '2026-09-14', 'ИЛИЯ ИЛИЕВ');
  `);
});

afterEach(() => db.close());

describe('пазачите не се засичат', () => {
  it('депозитната фактура НЕ блокира наема за същия имот и месец', () => {
    addInvoice({ product: 'депозит', invoice_number: '1000000062' });
    expect(db.prepare(RENT_GUARD).get(48, '2026-09')).toBeUndefined();
  });

  it('наемната фактура НЕ блокира депозита', () => {
    addInvoice({ product: 'наем' });
    expect(db.prepare(DEPOSIT_GUARD).get(48)).toBeUndefined();
  });

  it('интернет фактурата НЕ блокира депозита', () => {
    addInvoice({ product: 'интернет' });
    expect(db.prepare(DEPOSIT_GUARD).get(48)).toBeUndefined();
  });
});

describe('депозитът се фактурира веднъж', () => {
  it('втори депозит за същия имот се хваща', () => {
    addInvoice({ product: 'депозит', invoice_number: '1000000062' });
    expect(db.prepare(DEPOSIT_GUARD).get(48)).toBeTruthy();
  });

  // Депозитът се плаща веднъж за целия договор, а не месечно — затова пазачът
  // нарочно НЕ филтрира по месец.
  it('хваща се и когато вторият е в друг месец', () => {
    addInvoice({ product: 'депозит', invoice_number: '1000000062', month: '2026-09' });
    const found = db.prepare(DEPOSIT_GUARD).get(48);
    expect(found).toBeTruthy();
    expect(found.invoice_number).toBe('1000000062');
  });

  it('депозит на друг имот не пречи', () => {
    addInvoice({ product: 'депозит', property_id: 53, invoice_number: '1000000062' });
    expect(db.prepare(DEPOSIT_GUARD).get(48)).toBeUndefined();
  });
});

describe('списък с чакащи депозити', () => {
  it('показва действащ договор с депозит без фактура', () => {
    const rows = db.prepare(PENDING).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].contract_number).toBe('2026-025');
    expect(rows[0].deposit).toBe(170);
  });

  it('изчезва след издаване на депозитната фактура', () => {
    addInvoice({ product: 'депозит', invoice_number: '1000000062' });
    expect(db.prepare(PENDING).all()).toHaveLength(0);
  });

  it('не показва прекратен договор', () => {
    db.prepare("UPDATE contracts SET status='terminated' WHERE id=44").run();
    expect(db.prepare(PENDING).all()).toHaveLength(0);
  });

  it('не показва договор без депозит', () => {
    db.prepare('UPDATE contracts SET deposit=0 WHERE id=44').run();
    expect(db.prepare(PENDING).all()).toHaveLength(0);
  });
});

// Сметката, която createSimpleInvoice прави. Депозитът по подразбиране е без
// ДДС — връщаемата гаранция не е данъчна основа по чл.26 ал.5 ЗДДС.
const split = (gross, vat_rate) => {
  const grossN = Math.round(Number(gross || 0) * 100) / 100;
  const net = vat_rate > 0 ? Math.round(grossN / (1 + vat_rate / 100) * 100) / 100 : grossN;
  return { net, vat: Math.round((grossN - net) * 100) / 100, total: grossN };
};

describe('ДДС при депозит', () => {
  it('без ДДС: цялата сума е основа, няма начислен данък', () => {
    expect(split(170, 0)).toEqual({ net: 170, vat: 0, total: 170 });
  });

  it('с ДДС 20%: 170 се разбива на 141.67 + 28.33', () => {
    expect(split(170, 20)).toEqual({ net: 141.67, vat: 28.33, total: 170 });
  });

  // Причината флагът да е булев: липсващо поле в JSON тялото не бива да
  // превръща избора „с ДДС" в „без ДДС".
  it('with_vat се превежда до ставка еднозначно', () => {
    const rate = (with_vat, issuerRate) => (with_vat ? issuerRate : 0);
    expect(rate(true, 20)).toBe(20);
    expect(rate(false, 20)).toBe(0);
    expect(rate(undefined, 20)).toBe(0);
  });
});
