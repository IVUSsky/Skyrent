// Един имот — един действащ договор.
//
// Поводът: в списъка за избор на имот при нов договор излизаха и вече
// отдадените. Избор по грешка → два активни договора върху един имот → двойно
// фактуриране и объркана заетост. Интерфейсът вече ги заключва, но истинската
// защита е при АКТИВИРАНЕТО (routes/contracts.js) — стара отворена страница или
// директна заявка иначе минават.
//
// Пазачът е ПО ВИД: интернет договорът (Sky като доставчик) съжителства с
// наемния върху същия имот — същият наемател купува и интернет.
//
// Тук се проверява самият предикат срещу in-memory better-sqlite3.
const Database = require('better-sqlite3');

let db;

const CONFLICT = `
  SELECT id, contract_number, tenant_name, end_date FROM contracts
  WHERE property_id=? AND status='active' AND id<>? AND COALESCE(kind,'наем')=?
`;
const conflict = (propId, selfId, kind = 'наем') => db.prepare(CONFLICT).get(propId, selfId, kind);

const add = (over = {}) => {
  const row = {
    contract_number: 'C-1', tenant_name: 'Иван Петров',
    property_id: 10, status: 'draft', end_date: null, kind: 'наем', ...over,
  };
  return db.prepare(`
    INSERT INTO contracts (contract_number, tenant_name, property_id, status, end_date, kind)
    VALUES (@contract_number, @tenant_name, @property_id, @status, @end_date, @kind)
  `).run(row).lastInsertRowid;
};

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_number TEXT, tenant_name TEXT,
    property_id INTEGER, status TEXT, end_date TEXT, kind TEXT DEFAULT 'наем'
  )`);
});
afterEach(() => db.close());

describe('пазач при активиране на договор', () => {
  it('спира втори договор върху имот с действащ', () => {
    add({ status: 'active', contract_number: 'C-100' });
    const draft = add({ status: 'draft' });
    const hit = conflict(10, draft);
    expect(hit?.contract_number).toBe('C-100');
  });

  it('пуска активиране, когато имотът е свободен', () => {
    const draft = add({ status: 'draft' });
    expect(conflict(10, draft)).toBeUndefined();
  });

  it('прекратеният договор не блокира новия', () => {
    add({ status: 'terminated', contract_number: 'C-стар' });
    add({ status: 'ended', contract_number: 'C-по-стар' });
    const draft = add({ status: 'draft' });
    expect(conflict(10, draft)).toBeUndefined();
  });

  it('не се спъва в самия себе си при повторно активиране', () => {
    const c = add({ status: 'active' });
    expect(conflict(10, c)).toBeUndefined();
  });

  it('друг имот не пречи', () => {
    add({ status: 'active', property_id: 11 });
    const draft = add({ status: 'draft', property_id: 10 });
    expect(conflict(10, draft)).toBeUndefined();
  });

  it('договор без имот не се проверява', () => {
    add({ status: 'active', property_id: null });
    const draft = add({ status: 'draft', property_id: null });
    expect(conflict(null, draft)).toBeUndefined();
  });

  it('интернет договор минава върху имот с действащ наемен (и обратно)', () => {
    add({ status: 'active', contract_number: 'C-100' });
    const net = add({ status: 'draft', kind: 'интернет' });
    expect(conflict(10, net, 'интернет')).toBeUndefined();
    add({ status: 'active', kind: 'интернет', contract_number: 'N-1' });
    const rent = add({ status: 'draft' });
    expect(conflict(10, rent, 'наем')?.contract_number).toBe('C-100');
  });

  it('втори интернет договор върху същия имот се спира', () => {
    add({ status: 'active', kind: 'интернет', contract_number: 'N-1' });
    const net = add({ status: 'draft', kind: 'интернет' });
    expect(conflict(10, net, 'интернет')?.contract_number).toBe('N-1');
  });

  it('стар ред без вид (NULL) се брои за наемен', () => {
    add({ status: 'active', contract_number: 'C-null', kind: null });
    const rent = add({ status: 'draft' });
    expect(conflict(10, rent, 'наем')?.contract_number).toBe('C-null');
    const net = add({ status: 'draft', kind: 'интернет' });
    expect(conflict(10, net, 'интернет')).toBeUndefined();
  });

  it('няколко чернови за същия имот съжителстват — спира се чак активирането', () => {
    const a = add({ status: 'draft' });
    const b = add({ status: 'draft' });
    expect(conflict(10, a)).toBeUndefined();
    expect(conflict(10, b)).toBeUndefined();
    // след като едната стане активна, другата вече се блокира
    db.prepare("UPDATE contracts SET status='active' WHERE id=?").run(a);
    expect(conflict(10, b)).toBeTruthy();
  });
});
