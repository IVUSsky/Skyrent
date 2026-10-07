const Database = require('better-sqlite3');
const { internetOnlyPropertyIds, keepRentProperties } = require('./rentScope');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE contracts (id INTEGER PRIMARY KEY, property_id INTEGER, status TEXT, kind TEXT);
    INSERT INTO contracts (id, property_id, status, kind) VALUES
      (1, 58, 'active', 'интернет'),            -- ап.46 — само интернет
      (2, 41, 'active', 'интернет'),            -- ап.45 — само интернет
      (3, 2,  'active', 'наем'),                -- ап.9 — наем + интернет
      (4, 2,  'active', 'интернет'),
      (5, 6,  'active', 'наем'),                -- обикновен наем
      (6, 7,  'terminated', 'наем'),            -- прекратен
      (7, 7,  'active', 'интернет'),            -- остава само интернет → изключва се
      (8, 9,  'active', NULL);                  -- без вид → брои се за наем
  `);
});

describe('кои имоти не са наемни', () => {
  it('само интернет → изключени', () => {
    const s = internetOnlyPropertyIds(db);
    expect([...s].sort((a, b) => a - b)).toEqual([7, 41, 58]);
  });

  it('имот с наем и интернет остава', () => {
    expect(internetOnlyPropertyIds(db).has(2)).toBe(false);
  });

  it('договор без попълнен вид се брои за наем', () => {
    expect(internetOnlyPropertyIds(db).has(9)).toBe(false);
  });

  it('прекратеният наемен договор не спасява имота', () => {
    expect(internetOnlyPropertyIds(db).has(7)).toBe(true);
  });

  it('филтърът маха интернет имотите от списъка', () => {
    const props = [{ id: 2 }, { id: 6 }, { id: 58 }, { id: 41 }];
    expect(keepRentProperties(db, props).map(p => p.id)).toEqual([2, 6]);
  });

  it('работи и със списък по property_id', () => {
    expect(keepRentProperties(db, [{ property_id: 58 }, { property_id: 6 }]).map(p => p.property_id)).toEqual([6]);
  });

  it('липсваща таблица не чупи справката', () => {
    const empty = new Database(':memory:');
    expect(internetOnlyPropertyIds(empty).size).toBe(0);
    expect(keepRentProperties(empty, [{ id: 1 }])).toEqual([{ id: 1 }]);
  });
});
