// Един имот — един действащ договор.
//
// Поводът: в списъка за избор на имот при нов договор излизаха и вече
// отдадените. Избор по грешка → два активни договора върху един имот → двойно
// фактуриране и объркана заетост. Интерфейсът вече ги заключва, но истинската
// защита е при АКТИВИРАНЕТО (routes/contracts.js) — стара отворена страница или
// директна заявка иначе минават.
//
// Тук се проверява самият предикат срещу in-memory better-sqlite3.
const Database = require('better-sqlite3');

let db;

const CONFLICT = `
  SELECT id, contract_number, tenant_name, end_date FROM contracts
  WHERE property_id=? AND status='active' AND id<>?
`;

const add = (over = {}) => {
  const row = {
    contract_number: 'C-1', tenant_name: 'Иван Петров',
    property_id: 10, status: 'draft', end_date: null, ...over,
  };
  return db.prepare(`
    INSERT INTO contracts (contract_number, tenant_name, property_id, status, end_date)
    VALUES (@contract_number, @tenant_name, @property_id, @status, @end_date)
  `).run(row).lastInsertRowid;
};

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_number TEXT, tenant_name TEXT,
    property_id INTEGER, status TEXT, end_date TEXT
  )`);
});
afterEach(() => db.close());

describe('пазач при активиране на договор', () => {
  it('спира втори договор върху имот с действащ', () => {
    add({ status: 'active', contract_number: 'C-100' });
    const draft = add({ status: 'draft' });
    const hit = db.prepare(CONFLICT).get(10, draft);
    expect(hit?.contract_number).toBe('C-100');
  });

  it('пуска активиране, когато имотът е свободен', () => {
    const draft = add({ status: 'draft' });
    expect(db.prepare(CONFLICT).get(10, draft)).toBeUndefined();
  });

  it('прекратеният договор не блокира новия', () => {
    add({ status: 'terminated', contract_number: 'C-стар' });
    add({ status: 'ended', contract_number: 'C-по-стар' });
    const draft = add({ status: 'draft' });
    expect(db.prepare(CONFLICT).get(10, draft)).toBeUndefined();
  });

  it('не се спъва в самия себе си при повторно активиране', () => {
    const c = add({ status: 'active' });
    expect(db.prepare(CONFLICT).get(10, c)).toBeUndefined();
  });

  it('друг имот не пречи', () => {
    add({ status: 'active', property_id: 11 });
    const draft = add({ status: 'draft', property_id: 10 });
    expect(db.prepare(CONFLICT).get(10, draft)).toBeUndefined();
  });

  it('договор без имот не се проверява', () => {
    add({ status: 'active', property_id: null });
    const draft = add({ status: 'draft', property_id: null });
    expect(db.prepare(CONFLICT).get(null, draft)).toBeUndefined();
  });

  it('няколко чернови за същия имот съжителстват — спира се чак активирането', () => {
    const a = add({ status: 'draft' });
    const b = add({ status: 'draft' });
    expect(db.prepare(CONFLICT).get(10, a)).toBeUndefined();
    expect(db.prepare(CONFLICT).get(10, b)).toBeUndefined();
    // след като едната стане активна, другата вече се блокира
    db.prepare("UPDATE contracts SET status='active' WHERE id=?").run(a);
    expect(db.prepare(CONFLICT).get(10, b)).toBeTruthy();
  });
});
