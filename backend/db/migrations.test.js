// Миграциите на org базата — че колоните, от които зависят функциите,
// наистина се появяват.
//
// Повод (03.11.2026): схемата на `smart_devices` стоеше в routes/smart.js, в
// тялото на `module.exports = function(db)`. Там `db` е per-request прокси без
// избрана организация, затова ALTER-ите пропадаха и се поглъщаха от
// `catch(_) {}`. На ПРОД колоната `tenant_control` липсваше, `PATCH` на кое
// да е устройство връщаше 500, а управлението от приложението на наемателя не
// работеше за нито един имот — мълчаливо, от деня на качването.
//
// Тестът пуска миграциите върху празна база и проверява колоните. Пропадне ли
// миграция пак, тук светва червено, а не след месец на ПРОД.
const Database = require('better-sqlite3');
const { runTenantMigrations } = require('./migrations');

const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);

let db;
beforeAll(() => {
  db = new Database(':memory:');
  const log = console.log;
  console.log = () => {};              // миграциите са словоохотливи
  try { runTenantMigrations(db); } finally { console.log = log; }
});

describe('смарт устройства', () => {
  it('таблицата съществува', () => {
    expect(columns(db, 'smart_devices')).toEqual(expect.arrayContaining(['id', 'property_id', 'tuya_device_id', 'name', 'type', 'enabled']));
  });

  it('колоните, от които зависи достъпът на наемателя', () => {
    const c = columns(db, 'smart_devices');
    expect(c).toContain('tenant_control');         // PR #241
    expect(c).toContain('tenant_control_risky');   // 03.11.2026
    expect(c).toContain('ir_remote_id');           // PR #255
  });

  it('PATCH-ът на устройство минава (точната заявка от routes/smart.js)', () => {
    db.prepare("INSERT INTO smart_devices (id, property_id, tuya_device_id, name, type) VALUES (1, 26, 'tuya1', 'Бушон', 'breaker')").run();
    expect(() => db.prepare(`UPDATE smart_devices SET name=COALESCE(?,name), type=COALESCE(?,type),
        property_id=COALESCE(?,property_id), tenant_control=COALESCE(?,tenant_control),
        tenant_control_risky=COALESCE(?,tenant_control_risky), ir_remote_id=COALESCE(?,ir_remote_id)
      WHERE id=?`).run('Брава', null, null, 1, 1, null, 1)).not.toThrow();
    const row = db.prepare('SELECT * FROM smart_devices WHERE id=1').get();
    expect(row).toMatchObject({ name: 'Брава', tenant_control: 1, tenant_control_risky: 1 });
  });

  it('новото устройство по подразбиране НЕ се управлява от наемателя', () => {
    db.prepare("INSERT INTO smart_devices (id, property_id, tuya_device_id, name, type) VALUES (2, 26, 'tuya2', 'Клапан', 'valve')").run();
    expect(db.prepare('SELECT * FROM smart_devices WHERE id=2').get())
      .toMatchObject({ tenant_control: 0, tenant_control_risky: 0 });
  });
});

describe('напомняния за наем', () => {
  it('таблицата и колоните ѝ', () => {
    expect(columns(db, 'rent_reminders')).toEqual(expect.arrayContaining(['property_id', 'month', 'sent_to', 'subject', 'body', 'sent_by']));
  });
});

describe('повторно пускане', () => {
  it('миграциите минават два пъти без грешка и без да трият данни', () => {
    const before = db.prepare('SELECT COUNT(*) c FROM smart_devices').get().c;
    const log = console.log;
    console.log = () => {};
    try { expect(() => runTenantMigrations(db)).not.toThrow(); } finally { console.log = log; }
    expect(db.prepare('SELECT COUNT(*) c FROM smart_devices').get().c).toBe(before);
  });
});
