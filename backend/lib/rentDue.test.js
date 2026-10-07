const Database = require('better-sqlite3');
const { isOverdue, dueDayMap } = require('./rentDue');

const on = (iso) => new Date(iso + 'T12:00:00');

describe('закъснял ли е наемът', () => {
  it('текущият месец преди падежа → не е закъснял (случаят 07.10 със Стефан, 15-о число)', () => {
    expect(isOverdue('2026-10', 15, on('2026-10-07'))).toBe(false);
    expect(isOverdue('2026-10', 18, on('2026-10-07'))).toBe(false);
  });

  it('текущият месец след падежа → закъснял', () => {
    expect(isOverdue('2026-10', 5, on('2026-10-07'))).toBe(true);
    expect(isOverdue('2026-10', 15, on('2026-10-16'))).toBe(true);
  });

  it('в самия ден на падежа още не е закъснение', () => {
    expect(isOverdue('2026-10', 15, on('2026-10-15'))).toBe(false);
  });

  it('минал месец — винаги закъснение', () => {
    expect(isOverdue('2026-09', 28, on('2026-10-07'))).toBe(true);
  });

  it('бъдещ месец — никога', () => {
    expect(isOverdue('2026-11', 1, on('2026-10-07'))).toBe(false);
  });

  it('липсващ или абсурден ден → 5-о число', () => {
    expect(isOverdue('2026-10', null, on('2026-10-04'))).toBe(false);
    expect(isOverdue('2026-10', null, on('2026-10-06'))).toBe(true);
    expect(isOverdue('2026-10', 99, on('2026-10-27'))).toBe(false);  // ограничено до 28
  });
});

describe('ден на плащане по договор', () => {
  let db;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE contracts (id INTEGER PRIMARY KEY, property_id INTEGER, status TEXT, kind TEXT, payment_day INTEGER, created_at TEXT);
      INSERT INTO contracts (id, property_id, status, kind, payment_day, created_at) VALUES
        (1, 2,  'active',     'наем',     15, '2026-01-01'),
        (2, 57, 'active',     'наем',     18, '2026-01-01'),
        (3, 58, 'active',     'интернет', 1,  '2026-01-01'),
        (4, 9,  'terminated', 'наем',     20, '2026-01-01');
    `);
  });

  it('взима се от активния наемен договор', () => {
    const m = dueDayMap(db);
    expect(m[2]).toBe(15);
    expect(m[57]).toBe(18);
  });

  it('интернет и прекратени договори не дават ден', () => {
    const m = dueDayMap(db);
    expect(m[58]).toBeUndefined();
    expect(m[9]).toBeUndefined();
  });

  it('липсваща таблица не чупи', () => {
    expect(dueDayMap(new Database(':memory:'))).toEqual({});
  });
});
