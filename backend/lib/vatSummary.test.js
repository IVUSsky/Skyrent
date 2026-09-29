const Database = require('better-sqlite3');
const { summarizeVat, vatSummary, vatRows, monthEnd } = require('./vatSummary');

describe('край на месеца', () => {
  it('различните дължини на месеците, вкл. високосна година', () => {
    expect(monthEnd('2026-09')).toBe('2026-09-30');
    expect(monthEnd('2026-10')).toBe('2026-10-31');
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2024-02')).toBe('2024-02-29');
  });
});

describe('сумиране', () => {
  it('фактури минус кредитни известия', () => {
    const s = summarizeVat([
      { type: 'invoice', product: 'наем', vat_rate: 20, count: 3, amount: 1000, vat_amount: 200, total: 1200 },
      { type: 'credit_note', product: 'наем', vat_rate: 20, count: 1, amount: 100, vat_amount: 20, total: 120 },
    ]);
    expect(s.invoices).toMatchObject({ count: 3, base: 1000, vat: 200, total: 1200 });
    expect(s.credit_notes).toMatchObject({ count: 1, vat: 20 });
    expect(s.vat_due).toBe(180);
  });
  it('освободени (0%) не вдигат ДДС-то', () => {
    const s = summarizeVat([
      { type: 'invoice', product: 'наем', vat_rate: 20, count: 1, amount: 100, vat_amount: 20, total: 120 },
      { type: 'invoice', product: 'наем', vat_rate: 0, count: 1, amount: 300, vat_amount: 0, total: 300 },
    ]);
    expect(s.vat_due).toBe(20);
    expect(s.by_rate['0']).toMatchObject({ base: 300, vat: 0 });
    expect(s.by_rate['20']).toMatchObject({ base: 100, vat: 20 });
  });
  it('разбивка по продукт, с приспаднато КИ', () => {
    const s = summarizeVat([
      { type: 'invoice', product: 'наем', vat_rate: 20, count: 2, amount: 500, vat_amount: 100, total: 600 },
      { type: 'invoice', product: 'интернет', vat_rate: 20, count: 4, amount: 50, vat_amount: 10, total: 60 },
      { type: 'credit_note', product: 'интернет', vat_rate: 20, count: 1, amount: 12.5, vat_amount: 2.5, total: 15 },
    ]);
    expect(s.by_product['наем']).toMatchObject({ count: 2, vat: 100 });
    expect(s.by_product['интернет']).toMatchObject({ count: 3, base: 37.5, vat: 7.5 });
    expect(s.vat_due).toBe(107.5);
  });
  it('закръгляне до стотинка', () => {
    const s = summarizeVat([
      { type: 'invoice', product: 'интернет', vat_rate: 20, count: 3, amount: 37.49999, vat_amount: 7.4999, total: 44.9999 },
    ]);
    expect(s.invoices.vat).toBe(7.5);
    expect(s.vat_due).toBe(7.5);
  });
  it('празен месец', () => {
    const s = summarizeVat([]);
    expect(s.vat_due).toBe(0);
    expect(s.invoices.count).toBe(0);
  });
});

describe('справка от базата', () => {
  let db;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE properties (id INTEGER PRIMARY KEY, адрес TEXT);
      CREATE TABLE rent_invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT, type TEXT, product TEXT,
        property_id INTEGER, month TEXT, issued_at TEXT, tax_event_date TEXT, recipient_name TEXT, tenant_name TEXT,
        amount REAL, vat_rate REAL, vat_amount REAL, total REAL, paid_at TEXT, sent_at TEXT);
      INSERT INTO properties (id, адрес) VALUES (1, 'Иширков 24, ап.1');
    `);
    const ins = db.prepare(`INSERT INTO rent_invoices (invoice_number, type, product, property_id, month, issued_at, tax_event_date, tenant_name, amount, vat_rate, vat_amount, total)
      VALUES (@n,@t,@p,1,@m,@i,@te,@who,@a,@r,@v,@tot)`);
    // издадена на 18.09 за наем за ОКТОМВРИ (про-рата) → влиза в септемврийската справка
    ins.run({ n: 'A', t: 'invoice', p: 'наем', m: '2026-10', i: '2026-09-18', te: null, who: 'Иван', a: 100, r: 20, v: 20, tot: 120 });
    ins.run({ n: 'B', t: 'invoice', p: 'наем', m: '2026-09', i: '2026-09-01', te: null, who: 'Петър', a: 300, r: 20, v: 60, tot: 360 });
    // данъчното събитие е в октомври, макар издадена в края на септември
    ins.run({ n: 'C', t: 'invoice', p: 'интернет', m: '2026-09', i: '2026-09-30', te: '2026-10-01', who: 'Мария', a: 12.5, r: 20, v: 2.5, tot: 15 });
    ins.run({ n: 'D', t: 'credit_note', p: 'наем', m: '2026-09', i: '2026-09-20', te: null, who: 'Петър', a: 50, r: 20, v: 10, tot: 60 });
    // друг месец — не влиза
    ins.run({ n: 'E', t: 'invoice', p: 'наем', m: '2026-08', i: '2026-08-01', te: null, who: 'Иван', a: 100, r: 20, v: 20, tot: 120 });
  });

  it('периодът е по данъчно събитие/издаване, не по наемен месец', () => {
    const s = vatSummary(db, '2026-09');
    expect(s.invoices.count).toBe(2);        // A и B (C е с данъчно събитие в октомври)
    expect(s.invoices.vat).toBe(80);
    expect(s.credit_notes.vat).toBe(10);
    expect(s.vat_due).toBe(70);
    const oct = vatSummary(db, '2026-10');
    expect(oct.invoices.count).toBe(1);      // C
    expect(oct.vat_due).toBe(2.5);
  });

  it('редовете за списъка носят получател, имот и суми', () => {
    const rows = vatRows(db, '2026-09');
    expect(rows.map(r => r.invoice_number)).toEqual(['B', 'A', 'D']);
    expect(rows[0]).toMatchObject({ tenant_name: 'Петър', property_address: 'Иширков 24, ап.1', total: 360 });
  });

  it('невалиден месец → грешка', () => {
    expect(() => vatSummary(db, '2026')).toThrow();
  });
});
