// Тестове на запомнянето при присвояване на платец
// (PATCH /api/import/transactions/:id в routes/import.js).
//
// Поводът: присвояването правеше само `UPDATE transactions SET property_id`,
// без да записва правило. Затова при всяко ново банково извлечение същият
// наемател излизаше „неразпознат" и работата се повтаряше ръчно всеки месец.
// Смяната на КАТЕГОРИЯ винаги е учила; присвояването на ПЛАТЕЦ — не.
//
// Тук се проверяват двете части на логиката срещу in-memory better-sqlite3:
// upsert-ът на правилото и ретроактивното прилагане.
const Database = require('better-sqlite3');

let db;
const norm = s => (s || '').replace(/\s+/g, ' ').trim();

// Огледало на логиката от рутера — държим я в една функция, за да се тества.
function assignPayer(db, txId, pid, { learn = true } = {}) {
  db.prepare('UPDATE transactions SET property_id=? WHERE id=?').run(pid, txId);
  const tx = db.prepare('SELECT * FROM transactions WHERE id=?').get(txId);
  let rule_saved = false, affected = 0;

  if (learn !== false && tx && tx.контрагент) {
    const pattern = norm(tx.контрагент);
    const patLower = pattern.toLowerCase();
    const all = db.prepare('SELECT id, pattern FROM tx_rules').all();
    const existing = all.find(r => norm(r.pattern).toLowerCase() === patLower);
    if (existing) {
      db.prepare('UPDATE tx_rules SET pattern=?, property_id=? WHERE id=?').run(pattern, pid, existing.id);
    } else {
      db.prepare('INSERT INTO tx_rules (pattern, категория, property_id, scope) VALUES (?,?,?,?)')
        .run(pattern, tx.категория || 'наем', pid, tx.scope || 'business');
    }
    rule_saved = true;

    const others = db.prepare(
      'SELECT id, контрагент FROM transactions WHERE (property_id IS NULL OR property_id=0) AND id != ?'
    ).all(txId);
    const toUpdate = others.filter(t => t.контрагент && norm(t.контрагент).toLowerCase().includes(patLower));
    if (toUpdate.length) {
      const upd = db.prepare('UPDATE transactions SET property_id=? WHERE id=?');
      db.transaction(list => list.forEach(t => upd.run(pid, t.id)))(toUpdate);
      affected = toUpdate.length;
    }
  }
  return { rule_saved, affected };
}

const addTx = (over = {}) => {
  const row = { контрагент: 'ИВАН ПЕТРОВ', категория: 'наем', property_id: null, scope: 'business', ...over };
  return db.prepare(
    'INSERT INTO transactions (контрагент, категория, property_id, scope) VALUES (@контрагент,@категория,@property_id,@scope)'
  ).run(row).lastInsertRowid;
};

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      контрагент TEXT, категория TEXT, property_id INTEGER, scope TEXT
    );
    CREATE TABLE tx_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT, категория TEXT, property_id INTEGER, scope TEXT
    );
  `);
});
afterEach(() => db.close());

describe('запомняне при присвояване на платец', () => {
  it('записва правило, за да не пита пак при следващото извлечение', () => {
    const id = addTx();
    const r = assignPayer(db, id, 7);
    expect(r.rule_saved).toBe(true);
    const rule = db.prepare('SELECT * FROM tx_rules').get();
    expect(rule.pattern).toBe('ИВАН ПЕТРОВ');
    expect(rule.property_id).toBe(7);
    expect(rule.категория).toBe('наем');
  });

  it('прилага имота и към другите плащания на същия платец', () => {
    const id = addTx();
    addTx(); addTx();
    const r = assignPayer(db, id, 7);
    expect(r.affected).toBe(2);
    expect(db.prepare('SELECT COUNT(*) c FROM transactions WHERE property_id=7').get().c).toBe(3);
  });

  it('не пипа плащания, които вече имат имот', () => {
    const id = addTx();
    const other = addTx({ property_id: 9 });
    assignPayer(db, id, 7);
    expect(db.prepare('SELECT property_id FROM transactions WHERE id=?').get(other).property_id).toBe(9);
  });

  it('не пипа чужди платци', () => {
    const id = addTx();
    const foreign = addTx({ контрагент: 'ГЕОРГИ ДИМИТРОВ' });
    assignPayer(db, id, 7);
    expect(db.prepare('SELECT property_id FROM transactions WHERE id=?').get(foreign).property_id).toBeNull();
  });

  it('нормализира вътрешните интервали — PDF и Excel дават различен брой', () => {
    const id = addTx({ контрагент: 'ИВАН   ПЕТРОВ' });
    const spaced = addTx({ контрагент: 'ИВАН ПЕТРОВ' });
    assignPayer(db, id, 7);
    expect(db.prepare('SELECT pattern FROM tx_rules').get().pattern).toBe('ИВАН ПЕТРОВ');
    expect(db.prepare('SELECT property_id FROM transactions WHERE id=?').get(spaced).property_id).toBe(7);
  });

  it('обновява съществуващо правило, без да сменя категорията му', () => {
    db.prepare("INSERT INTO tx_rules (pattern, категория, property_id, scope) VALUES ('ИВАН ПЕТРОВ','депозит',3,'business')").run();
    const id = addTx();
    assignPayer(db, id, 7);
    const rules = db.prepare('SELECT * FROM tx_rules').all();
    expect(rules).toHaveLength(1);                 // не се дублира
    expect(rules[0].property_id).toBe(7);          // имотът се обновява
    expect(rules[0].категория).toBe('депозит');    // категорията остава
  });

  it('learn:false не записва нищо — за еднократно плащане вместо друг', () => {
    const id = addTx();
    const other = addTx();
    const r = assignPayer(db, id, 7, { learn: false });
    expect(r.rule_saved).toBe(false);
    expect(db.prepare('SELECT COUNT(*) c FROM tx_rules').get().c).toBe(0);
    expect(db.prepare('SELECT property_id FROM transactions WHERE id=?').get(other).property_id).toBeNull();
  });
});
