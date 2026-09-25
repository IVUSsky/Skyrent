// Възстановяване на прекратен договор — историята на наемателите не бива да се
// дублира. ⛔ затваря отворения ред; ↩️ трябва да отмени точно това, а не да
// залепи второ наемане на същия човек в същия имот.
const Database = require('better-sqlite3');
const { reinstateContract } = require('./contractReinstate');

let db;

const addContract = (over = {}) => {
  const row = {
    contract_number: 'C-1', tenant_name: 'Хабип Муса', property_id: 1,
    status: 'terminated', start_date: '2026-08-09', end_date: '2026-08-09',
    monthly_rent: 667, deposit: 1000, kind: 'наем', terminated_at: '2026-08-09 19:49:31',
    activated_at: '2026-08-09 19:51:48', conditions: null, notes: null, ...over,
  };
  return db.prepare(`
    INSERT INTO contracts (contract_number, tenant_name, property_id, status, start_date, end_date,
                           monthly_rent, deposit, kind, terminated_at, activated_at, conditions, notes)
    VALUES (@contract_number, @tenant_name, @property_id, @status, @start_date, @end_date,
            @monthly_rent, @deposit, @kind, @terminated_at, @activated_at, @conditions, @notes)
  `).run(row).lastInsertRowid;
};

const addHistory = (over = {}) => db.prepare(`
  INSERT INTO tenant_history (property_id, tenant_name, start_date, end_date, monthly_rent, deposit)
  VALUES (@property_id, @tenant_name, @start_date, @end_date, @monthly_rent, @deposit)
`).run({
  property_id: 1, tenant_name: 'Хабип Муса', start_date: '2026-08-09',
  end_date: '2026-08-09', monthly_rent: 667, deposit: 1000, ...over,
}).lastInsertRowid;

const get = (id) => db.prepare('SELECT * FROM contracts WHERE id=?').get(id);
const history = () => db.prepare('SELECT * FROM tenant_history ORDER BY id').all();

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_number TEXT, tenant_name TEXT, property_id INTEGER, status TEXT,
      start_date TEXT, end_date TEXT, monthly_rent REAL, deposit REAL,
      kind TEXT DEFAULT 'наем', terminated_at TEXT, activated_at TEXT,
      conditions TEXT, notes TEXT
    );
    CREATE TABLE tenant_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER, tenant_name TEXT, start_date TEXT, end_date TEXT,
      monthly_rent REAL, deposit REAL, conditions TEXT, notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      наемател TEXT, наем REAL, статус TEXT, updated_at DATETIME
    );
    INSERT INTO properties (id, наемател, наем, статус) VALUES (1, NULL, 0, '🔑');
  `);
});
afterEach(() => db.close());

describe('възстановяване на прекратен договор', () => {
  it('връща статуса и чисти датата на прекратяване', () => {
    const id = addContract();
    reinstateContract(db, get(id));
    const c = get(id);
    expect(c.status).toBe('active');
    expect(c.terminated_at).toBeNull();
  });

  it('вписва подадената крайна дата вместо тази от прекратяването', () => {
    const id = addContract({ end_date: '2026-08-09' });
    reinstateContract(db, get(id), { endDate: '2027-08-09' });
    expect(get(id).end_date).toBe('2027-08-09');
  });

  it('празна дата прави договора безсрочен', () => {
    const id = addContract();
    reinstateContract(db, get(id), { endDate: '' });
    expect(get(id).end_date).toBeNull();
  });

  it('отваря наново реда в историята, вместо да вмъква втори', () => {
    const id = addContract();
    addHistory({ end_date: '2026-08-09' });
    const r = reinstateContract(db, get(id), { endDate: '2027-08-09' });
    expect(r.history).toBe('reopened');
    const h = history();
    expect(h).toHaveLength(1);
    expect(h[0].end_date).toBe('2027-08-09');
  });

  it('вмъква ред само ако наемателят го няма в историята', () => {
    const id = addContract();
    const r = reinstateContract(db, get(id));
    expect(r.history).toBe('inserted');
    expect(history()).toHaveLength(1);
  });

  it('не дублира, когато редът вече е отворен', () => {
    const id = addContract();
    addHistory({ end_date: null });
    const r = reinstateContract(db, get(id));
    expect(r.history).toBe('kept');
    expect(history()).toHaveLength(1);
  });

  it('затваря отворения ред на друг наемател — имотът не е зает от двама', () => {
    const id = addContract();
    addHistory({ end_date: '2026-08-09' });
    addHistory({ tenant_name: 'Друг Наемател', start_date: '2026-08-10', end_date: null });
    const r = reinstateContract(db, get(id), { endDate: '2027-08-09' });
    expect(r.closed).toBe(1);
    const other = history().find(x => x.tenant_name === 'Друг Наемател');
    expect(other.end_date).toBeTruthy();
  });

  it('различната големина на буквите в името не прави нов ред', () => {
    const id = addContract({ tenant_name: 'ХАБИП МУСА' });
    addHistory({ tenant_name: 'Хабип Муса', end_date: '2026-08-09' });
    const r = reinstateContract(db, get(id));
    expect(r.history).toBe('reopened');
    expect(history()).toHaveLength(1);
  });

  it('връща наемателя и наема в имота', () => {
    const id = addContract();
    reinstateContract(db, get(id));
    const p = db.prepare('SELECT * FROM properties WHERE id=1').get();
    expect(p.наемател).toBe('Хабип Муса');
    expect(p.наем).toBe(667);
    expect(p.статус).toBe('✅');
  });

  it('интернет договорът не пипа имота и историята', () => {
    const id = addContract({ kind: 'интернет', monthly_rent: 25.98 });
    const r = reinstateContract(db, get(id));
    expect(r.history).toBe('skipped');
    expect(history()).toHaveLength(0);
    expect(db.prepare('SELECT * FROM properties WHERE id=1').get().наем).toBe(0);
    expect(get(id).status).toBe('active');
  });
});
