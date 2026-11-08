const { canMove, moveNote } = require('./contractMove');

const apA = { id: 20, адрес: 'Пз. Болнична 7, ап.А' };
const apB = { id: 21, адрес: 'Пз. Болнична 7, ап.Б' };
const c26 = { id: 26, property_id: 20, status: 'active', tenant_name: 'Наемател Б',
              start_date: '2025-11-03', end_date: '2026-11-03', notes: '' };

describe('преместване на договор между имоти', () => {
  it('празен имот приема договора', () => {
    expect(canMove(c26, apB, [])).toEqual({ ok: true });
  });

  it('имот с друг действащ договор за същия период ОТКАЗВА', () => {
    const r = canMove(c26, apB, [{ id: 25, status: 'active', tenant_name: 'Друг Наемател',
      start_date: '2026-02-12', end_date: '2027-02-12' }]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ап\.Б/);
    expect(r.error).toMatch(/Друг Наемател/);
    expect(r.error).toMatch(/Прекрати или премести него първо/);
  });

  it('но договор за ДРУГ период минава — това е нормална смяна на наематели', () => {
    expect(canMove(c26, apB, [{ id: 25, status: 'active', tenant_name: 'Стар',
      start_date: '2024-01-01', end_date: '2025-01-01' }])).toEqual({ ok: true });
  });

  it('прекратен договор не е пречка', () => {
    const notActive = { ...c26, status: 'terminated' };
    expect(canMove(notActive, apB, [{ id: 25, status: 'active', start_date: '2026-01-01', end_date: '2027-01-01' }]))
      .toEqual({ ok: true });
  });

  it('безсрочният отсреща блокира всичко след началото си', () => {
    const r = canMove(c26, apB, [{ id: 25, status: 'active', tenant_name: 'Безсрочен', start_date: '2025-01-01', end_date: null }]);
    expect(r.ok).toBe(false);
  });

  it('същият имот не е преместване', () => {
    expect(canMove(c26, apA, []).error).toMatch(/вече е на този имот/);
  });

  it('несъществуващ имот → ясен отказ', () => {
    expect(canMove(c26, null, []).error).toMatch(/Имотът не е намерен/);
  });

  it('самият той отсреща не си пречи', () => {
    expect(canMove(c26, apB, [c26])).toEqual({ ok: true });
  });
});

describe('следа в бележките', () => {
  it('пише откъде закъде и кога', () => {
    const n = moveNote(c26, apA, apB, new Date('2026-11-08T10:00:00Z'));
    expect(n).toContain('2026-11-08');
    expect(n).toContain('ап.А');
    expect(n).toContain('ап.Б');
  });

  it('не трие заварената бележка', () => {
    const n = moveNote({ ...c26, notes: 'от архивиран договор' }, apA, apB, new Date('2026-11-08T10:00:00Z'));
    expect(n).toMatch(/^от архивиран договор/);
    expect(n).toContain('преместен');
  });
});
