const Database = require('better-sqlite3');
const { withTenantEmail, contractEmails } = require('./tenantEmailFallback');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE contracts (id INTEGER PRIMARY KEY, property_id INTEGER, status TEXT, kind TEXT, tenant_email TEXT, created_at TEXT);
    INSERT INTO contracts (id, property_id, status, kind, tenant_email, created_at) VALUES
      (1, 1,  'active',     'наем',     'habip.mollaali@abv.bg', '2026-01-01'),
      (2, 21, 'active',     'наем',     'guygorlemyldirim@gmail.com', '2026-02-01'),
      (3, 11, 'active',     'наем',     '', '2026-03-01'),
      (4, 2,  'active',     'интернет', 'net@example.com', '2026-04-01'),
      (5, 2,  'active',     'наем',     'rent@example.com', '2026-03-01'),
      (6, 30, 'terminated', 'наем',     'stari@example.com', '2026-01-01');
  `);
});

describe('имейл от договора', () => {
  it('взима се само от активни договори с попълнен имейл', () => {
    const m = contractEmails(db);
    expect(m[1]).toBe('habip.mollaali@abv.bg');
    expect(m[21]).toBe('guygorlemyldirim@gmail.com');
    expect(m[11]).toBeUndefined();   // празен имейл
    expect(m[30]).toBeUndefined();   // прекратен договор
  });

  it('наемният договор е с предимство пред интернет', () => {
    expect(contractEmails(db)[2]).toBe('rent@example.com');
  });
});

describe('допълване в справката', () => {
  it('имот без имейл го взима от договора', () => {
    const r = withTenantEmail(db, [{ id: 1, email: '' }]);
    expect(r[0]).toMatchObject({ email: 'habip.mollaali@abv.bg', email_source: 'договор' });
  });

  it('имейлът по имота е с предимство', () => {
    const r = withTenantEmail(db, [{ id: 1, email: 'imot@example.com' }]);
    expect(r[0]).toMatchObject({ email: 'imot@example.com', email_source: 'имот' });
  });

  it('никъде няма имейл → null и ясен признак', () => {
    const r = withTenantEmail(db, [{ id: 11, email: null }]);
    expect(r[0]).toMatchObject({ email: null, email_source: null });
  });

  it('интервалите не минават за адрес', () => {
    const r = withTenantEmail(db, [{ id: 1, email: '   ' }]);
    expect(r[0].email).toBe('habip.mollaali@abv.bg');
  });

  it('работи и със списък по property_id', () => {
    expect(withTenantEmail(db, [{ property_id: 21 }])[0].email).toBe('guygorlemyldirim@gmail.com');
  });

  it('липсваща таблица не чупи справката', () => {
    const empty = new Database(':memory:');
    expect(withTenantEmail(empty, [{ id: 1, email: 'a@b.bg' }])[0].email).toBe('a@b.bg');
  });
});
