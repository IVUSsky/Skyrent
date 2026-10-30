// Освобождаване на имота при ⛔. Същината: обявата на вече публикуван имот
// трябва да се появи сама, без да се трие името на ръка — и без прекратяването
// да вкарва в публичния каталог имот, който собственикът не е пускал там.
const Database = require('better-sqlite3');
const { releaseProperty } = require('./propertyRelease');

let db;

const addProperty = (over = {}) => {
  const row = {
    адрес: 'Фонтани 4А, ап. 9', наемател: 'Хабип Муса', наем: 667, статус: '✅',
    телефон: '0888123456', email: 'habip@example.com', published: 1, ...over,
  };
  return db.prepare(`
    INSERT INTO properties (адрес, наемател, наем, статус, телефон, email, published)
    VALUES (@адрес, @наемател, @наем, @статус, @телефон, @email, @published)
  `).run(row).lastInsertRowid;
};

const addContract = (over = {}) => {
  const row = {
    tenant_name: 'Хабип Муса', property_id: 1, status: 'terminated',
    kind: 'наем', monthly_rent: 667, ...over,
  };
  return db.prepare(`
    INSERT INTO contracts (tenant_name, property_id, status, kind, monthly_rent)
    VALUES (@tenant_name, @property_id, @status, @kind, @monthly_rent)
  `).run(row).lastInsertRowid;
};

const prop = (id = 1) => db.prepare('SELECT * FROM properties WHERE id=?').get(id);
const contract = (id) => db.prepare('SELECT * FROM contracts WHERE id=?').get(id);

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      адрес TEXT, наемател TEXT, наем REAL, статус TEXT,
      телефон TEXT, email TEXT, published INTEGER DEFAULT 0,
      updated_at DATETIME
    );
    CREATE TABLE contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_name TEXT, property_id INTEGER, status TEXT,
      kind TEXT DEFAULT 'наем', monthly_rent REAL
    );
    CREATE TABLE property_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
});
afterEach(() => db.close());

describe('освобождаване на имота при прекратен договор', () => {
  it('изчиства наемателя — обявата на публикуван имот лъсва сама', () => {
    addProperty();
    const id = addContract();

    const r = releaseProperty(db, contract(id));

    expect(r.released).toBe(true);
    expect(r.published).toBe(true);
    // Каталогът крие всеки имот с НЕПРАЗЕН наемател — празният низ го пуска.
    expect(prop().наемател).toBe('');
  });

  it('не пипа published — прекратяването не вкарва нов имот в каталога', () => {
    addProperty({ published: 0 });
    const id = addContract();

    const r = releaseProperty(db, contract(id));

    expect(r.released).toBe(true);
    expect(r.published).toBe(false);
    expect(prop().published).toBe(0);
  });

  it('пази наема и статуса — обявата иска цена, портфейлът иска имота', () => {
    addProperty();
    const id = addContract();

    releaseProperty(db, contract(id));

    expect(prop().наем).toBe(667);
    expect(prop().статус).toBe('✅');
  });

  it('чисти телефона и имейла — те бяха на наемателя', () => {
    addProperty();
    const id = addContract();

    releaseProperty(db, contract(id));

    expect(prop().телефон).toBeNull();
    expect(prop().email).toBeNull();
  });

  it('не освобождава имот с друг действащ договор (интернетът тече)', () => {
    addProperty();
    const rent = addContract();
    addContract({ kind: 'интернет', status: 'active' });

    const r = releaseProperty(db, contract(rent));

    expect(r.released).toBe(false);
    expect(r.reason).toBe('other_active_contract');
    expect(prop().наемател).toBe('Хабип Муса');
  });

  it('прекратяваният договор не се брои за „друг действащ"', () => {
    addProperty();
    // Редът още е 'active' — маршрутът вика releaseProperty след UPDATE-а, но
    // пазачът не бива да зависи от реда на операциите.
    const id = addContract({ status: 'active' });

    expect(releaseProperty(db, contract(id)).released).toBe(true);
  });

  it('договор без имот не чупи нищо', () => {
    const id = addContract({ property_id: null });

    const r = releaseProperty(db, contract(id));

    expect(r.released).toBe(false);
    expect(r.reason).toBe('no_property');
  });

  it('брои снимките — обява без снимка не е готова обява', () => {
    addProperty();
    const id = addContract();
    db.prepare('INSERT INTO property_photos (property_id) VALUES (1)').run();
    db.prepare('INSERT INTO property_photos (property_id) VALUES (1)').run();

    expect(releaseProperty(db, contract(id)).photos).toBe(2);
  });
});
