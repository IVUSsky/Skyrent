const Database = require('better-sqlite3');
const { remindable, reminderSubject, reminderBody, monthName, dueDate, daysLate,
        paidSignForMonth, alreadySent } = require('./rentReminder');

const on = (iso) => new Date(iso + 'T12:00:00Z');

const prop = (over) => ({
  id: 7, адрес: 'Фонтани 4А', наемател: 'Стефан Петров',
  email: 'stefan@example.com', наем: 650, is_overdue: true, due_day: 5, ...over,
});

describe('кой влиза в списъка за напомняне', () => {
  it('закъснял наемател с имейл', () => {
    const rows = remindable([prop()], { month: '2026-11', today: on('2026-11-10') });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ property_id: 7, tenant: 'Стефан Петров', can_send: true, days_late: 5 });
  });

  it('който не е закъснял — не влиза', () => {
    expect(remindable([prop({ is_overdue: false })], { month: '2026-11', today: on('2026-11-10') })).toHaveLength(0);
  });

  it('имот без наем не влиза — няма какво да се иска', () => {
    expect(remindable([prop({ наем: 0 })], { month: '2026-11', today: on('2026-11-10') })).toHaveLength(0);
  });

  it('закъснял без имейл влиза, но е заключен — иначе просто изчезва без следа', () => {
    const rows = remindable([prop({ email: '  ' })], { month: '2026-11', today: on('2026-11-10') });
    expect(rows).toHaveLength(1);
    expect(rows[0].can_send).toBe(false);
    expect(rows[0].blocked).toMatch(/имейл/);
  });

  it('най-закъснелите са най-напред', () => {
    const rows = remindable([
      prop({ id: 1, due_day: 15 }),
      prop({ id: 2, due_day: 1 }),
    ], { month: '2026-11', today: on('2026-11-20') });
    expect(rows.map(r => r.id ?? r.property_id)).toEqual([2, 1]);
    expect(rows[0].days_late).toBe(19);
  });
});

describe('падеж и закъснение', () => {
  it('31-во число в месец с 30 дни не прелива в следващия', () => {
    expect(dueDate('2026-11', 31).toISOString().slice(0, 10)).toBe('2026-11-30');
  });

  it('в деня на падежа закъснението е 0', () => {
    expect(daysLate('2026-11', 5, on('2026-11-05'))).toBe(0);
  });

  it('преди падежа не става отрицателно', () => {
    expect(daysLate('2026-11', 15, on('2026-11-02'))).toBe(0);
  });

  it('месецът се изписва на български', () => {
    expect(monthName('2026-11')).toBe('ноември 2026');
  });
});

describe('текстът на писмото', () => {
  const row = remindable([prop()], { month: '2026-11', today: on('2026-11-10') })[0];

  it('заглавието казва кой имот и кой месец', () => {
    expect(reminderSubject(row)).toBe('Напомняне за наем — Фонтани 4А, ноември 2026');
  });

  it('съдържа сумата, падежа и колко дни', () => {
    const b = reminderBody(row);
    expect(b).toContain('Стефан Петров');
    expect(b).toContain('650,00 EUR');
    expect(b).toContain('05.11.2026');
    expect(b).toContain('преди 5 дни');
  });

  it('ВИНАГИ дава изход, ако плащането вече е направено', () => {
    expect(reminderBody(row)).toMatch(/вече е направено/);
  });

  it('няма заплахи, лихви и неустойки — това е първо напомняне', () => {
    expect(reminderBody(row)).not.toMatch(/лихв|неустойк|прекрат|съд/i);
  });

  it('банковата сметка влиза само ако е подадена', () => {
    expect(reminderBody(row)).not.toContain('Банкова сметка');
    expect(reminderBody(row, { iban: 'BG00XXXX', name: 'Sky Capital' })).toContain('Банкова сметка: BG00XXXX');
  });

  it('един ден е „ден", не „дни"', () => {
    const r1 = remindable([prop()], { month: '2026-11', today: on('2026-11-06') })[0];
    expect(reminderBody(r1)).toContain('преди 1 ден');
  });

  it('без име не остава висяща запетая', () => {
    const r = remindable([prop({ наемател: '' })], { month: '2026-11', today: on('2026-11-10') })[0];
    expect(reminderBody(r).split('\n')[0]).toBe('Здравейте,');
  });
});

describe('признак за плащане — преградата пред изпращането', () => {
  let db;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE transactions (id INTEGER PRIMARY KEY, property_id INTEGER, категория TEXT, operation TEXT, месец TEXT, сума REAL);
      CREATE TABLE manual_rent_payments (id INTEGER PRIMARY KEY, property_id INTEGER, month TEXT, amount REAL);
      CREATE TABLE rent_invoices (id INTEGER PRIMARY KEY, property_id INTEGER, month TEXT, type TEXT, product TEXT, paid_at TEXT, total REAL);
      CREATE TABLE rent_reminders (id INTEGER PRIMARY KEY, property_id INTEGER, month TEXT, sent_to TEXT, created_at TEXT);
    `);
  });

  it('нищо никъде → може да се праща', () => {
    expect(paidSignForMonth(db, 7, '2026-11').paid).toBe(false);
  });

  it('банков превод за месеца спира писмото', () => {
    db.exec("INSERT INTO transactions (property_id, категория, operation, месец, сума) VALUES (7,'наем','Кт','2026-11',650)");
    expect(paidSignForMonth(db, 7, '2026-11')).toMatchObject({ paid: true });
  });

  it('частична сума също спира — не упрекваме за 50 €', () => {
    db.exec("INSERT INTO transactions (property_id, категория, operation, месец, сума) VALUES (7,'наем','Кт','2026-11',50)");
    expect(paidSignForMonth(db, 7, '2026-11').paid).toBe(true);
  });

  it('плащане в брой и платена фактура спират писмото', () => {
    db.exec("INSERT INTO manual_rent_payments (property_id, month, amount) VALUES (8,'2026-11',650)");
    db.exec("INSERT INTO rent_invoices (property_id, month, type, product, paid_at, total) VALUES (9,'2026-11','invoice','наем','2026-11-03',650)");
    expect(paidSignForMonth(db, 8, '2026-11').paid).toBe(true);
    expect(paidSignForMonth(db, 9, '2026-11').paid).toBe(true);
  });

  it('неплатена фактура не е плащане', () => {
    db.exec("INSERT INTO rent_invoices (property_id, month, type, product, paid_at, total) VALUES (9,'2026-11','invoice','наем',NULL,650)");
    expect(paidSignForMonth(db, 9, '2026-11').paid).toBe(false);
  });

  it('плащане за следващ месец спира писмото — вероятно предплащане', () => {
    db.exec("INSERT INTO transactions (property_id, категория, operation, месец, сума) VALUES (7,'наем','Кт','2026-12',650)");
    expect(paidSignForMonth(db, 7, '2026-11')).toMatchObject({ paid: true, reason: expect.stringMatching(/предплащане/) });
  });

  it('чужд имот и друга категория не се броят', () => {
    db.exec("INSERT INTO transactions (property_id, категория, operation, месец, сума) VALUES (8,'наем','Кт','2026-11',650)");
    db.exec("INSERT INTO transactions (property_id, категория, operation, месец, сума) VALUES (7,'ток','Кт','2026-11',650)");
    expect(paidSignForMonth(db, 7, '2026-11').paid).toBe(false);
  });

  it('липсващи таблици не чупят — връща „може да се праща", а не изключение', () => {
    expect(paidSignForMonth(new Database(':memory:'), 7, '2026-11').paid).toBe(false);
  });

  it('вече изпратено напомняне се помни за същия месец', () => {
    expect(alreadySent(db, 7, '2026-11')).toBeNull();
    db.exec("INSERT INTO rent_reminders (property_id, month, sent_to, created_at) VALUES (7,'2026-11','a@b.bg','2026-11-10 09:00')");
    expect(alreadySent(db, 7, '2026-11')).toMatchObject({ sent_to: 'a@b.bg' });
    expect(alreadySent(db, 7, '2026-10')).toBeNull();
  });
});
