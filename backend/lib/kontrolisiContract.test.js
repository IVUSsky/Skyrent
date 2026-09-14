// Писмото към счетоводителя носи условията в текста, не само PDF отзад.
// Затова се тества какво влиза в него: липсващо поле или грешна валута води до
// грешно осчетоводяване, а това се открива месеци по-късно.
const Database = require('better-sqlite3');
const { kontrolisiContractsOn, buildContractEmail, contractRows } = require('./kontrolisiContract');

const CONTRACT = {
  id: 44, contract_number: '2026-025',
  landlord_name: 'Скай Кепитъл ООД',
  tenant_name: 'ИЛИЯ ИЛИЕВ', tenant_egn: '9312093028',
  property_address: 'Фонтани, София, Младост 4 — Гараж № 38, ет. -1',
  start_date: '2026-09-14', end_date: '2027-09-13',
  monthly_rent: 170, deposit: 170, currency: 'EUR',
  payment_day: 5, payment_method: 'банков превод',
  activated_at: '2026-09-14 07:13:47',
};

const val = (rows, label) => rows.find(([k]) => k === label)?.[1];

describe('настройка kontrolisi_contracts', () => {
  let db;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
  });
  afterEach(() => db.close());

  const put = (v) => db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('kontrolisi_contracts', v);

  it('изключена, докато не е зададена', () => {
    expect(kontrolisiContractsOn(db)).toBe(false);
  });

  // Настройките се пазят като JSON.stringify(value) → булевото true става "true".
  it('разпознава "true" такова, каквото го пише настройката', () => {
    put('true');
    expect(kontrolisiContractsOn(db)).toBe(true);
  });

  it('разпознава и "1"', () => {
    put('1');
    expect(kontrolisiContractsOn(db)).toBe(true);
  });

  it('"false" остава изключено', () => {
    put('false');
    expect(kontrolisiContractsOn(db)).toBe(false);
  });

  // Пази се от мълчаливо разширяване: фактурният ключ НЕ включва договорите.
  it('kontrolisi_auto не включва договорите', () => {
    db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run('kontrolisi_auto', 'true');
    expect(kontrolisiContractsOn(db)).toBe(false);
  });
});

describe('редовете в писмото', () => {
  it('носят условията, по които се осчетоводява', () => {
    const r = contractRows(CONTRACT);
    expect(val(r, 'Наемател')).toBe('ИЛИЯ ИЛИЕВ');
    expect(val(r, 'ЕГН / ЕИК на наемателя')).toBe('9312093028');
    expect(val(r, 'Срок')).toBe('14.09.2026 – 13.09.2027');
    expect(val(r, 'Месечен наем')).toBe('170,00 EUR');
    expect(val(r, 'Депозит')).toBe('170,00 EUR');
    expect(val(r, 'Падеж на наема')).toBe('до 5-то число');
  });

  it('безсрочният договор си личи, вместо да остане празно', () => {
    const r = contractRows({ ...CONTRACT, end_date: null });
    expect(val(r, 'Срок')).toBe('14.09.2026 – безсрочен');
  });

  it('нулев депозит отпада, вместо да се пише 0,00', () => {
    const r = contractRows({ ...CONTRACT, deposit: 0 });
    expect(val(r, 'Депозит')).toBeUndefined();
  });

  it('празните полета не стигат до писмото', () => {
    const r = contractRows({ id: 9, contract_number: '2026-099', tenant_name: 'Иван' });
    expect(r.map(([k]) => k)).toEqual(['Наемател']);
    for (const [, v] of r) expect(String(v)).not.toMatch(/undefined|null|NaN/);
  });

  it('валутата идва от договора, не е закована', () => {
    const r = contractRows({ ...CONTRACT, currency: 'BGN' });
    expect(val(r, 'Месечен наем')).toBe('170,00 BGN');
  });
});

describe('писмото', () => {
  it('темата носи номера и наемателя', () => {
    const m = buildContractEmail(CONTRACT, 'Скай Кепитъл ООД');
    expect(m.subject).toBe('Договор за наем № 2026-025 — ИЛИЯ ИЛИЕВ');
  });

  it('прикаченият файл се кръщава по номера на договора', () => {
    expect(buildContractEmail(CONTRACT, 'X').attachmentName).toBe('Договор_2026-025');
  });

  it('договор без номер пак се изпраща, с id', () => {
    const m = buildContractEmail({ id: 7, tenant_name: 'Петър' }, 'X');
    expect(m.subject).toContain('#7');
    expect(m.attachmentName).toBe('Договор_7');
  });

  it('всички стойности се появяват в тялото', () => {
    const m = buildContractEmail(CONTRACT, 'Скай Кепитъл ООД');
    for (const [, v] of m.rows) expect(m.html).toContain(v.replace(/&/g, '&amp;'));
  });

  // Имена на наематели идват от сканирана лична карта — не се вярва на входа.
  it('екранира HTML от полетата на договора', () => {
    const m = buildContractEmail({ ...CONTRACT, tenant_name: '<script>x</script>' }, 'X');
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });
});
