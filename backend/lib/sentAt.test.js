const { normalizeSentAt } = require('./sentAt');

describe('normalizeSentAt', () => {
  it('приема пълна дата с час и я връща непроменена', () => {
    expect(normalizeSentAt('2026-11-01 07:00:01')).toEqual({ ok: true, value: '2026-11-01 07:00:01' });
  });

  it('допълва 00:00:00 при дата без час', () => {
    expect(normalizeSentAt('2026-11-01')).toEqual({ ok: true, value: '2026-11-01 00:00:00' });
  });

  it('приема ISO разделителя T, но връща формата на datetime(now)', () => {
    expect(normalizeSentAt('2026-11-01T07:00:01')).toEqual({ ok: true, value: '2026-11-01 07:00:01' });
  });

  it('маха обкръжаващите празни знаци', () => {
    expect(normalizeSentAt('  2026-11-01 07:00:01  ').value).toBe('2026-11-01 07:00:01');
  });

  for (const empty of [null, undefined, '', '   ']) {
    it(`${JSON.stringify(empty)} значи „изчисти“`, () => {
      expect(normalizeSentAt(empty)).toEqual({ ok: true, value: null });
    });
  }

  // Същината: SQLite не би отказал нито едно от тези.
  it('отказва 31 февруари, вместо да превърти на март', () => {
    const r = normalizeSentAt('2026-02-31 00:00:00');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('28 дни');
  });

  it('знае за високосна година', () => {
    expect(normalizeSentAt('2028-02-29').ok).toBe(true);
    expect(normalizeSentAt('2026-02-29').ok).toBe(false);
  });

  it('отказва 13-и месец', () => {
    expect(normalizeSentAt('2026-13-01 00:00:00').ok).toBe(false);
  });

  it('отказва невалиден час', () => {
    expect(normalizeSentAt('2026-11-01 24:00:00').ok).toBe(false);
    expect(normalizeSentAt('2026-11-01 07:60:00').ok).toBe(false);
  });

  it('отказва свободен текст и други формати', () => {
    for (const bad of ['глупости', '01.11.2026', '2026-11-1', '2026/11/01', '2026-11-01 07:00']) {
      expect(normalizeSentAt(bad).ok, bad).toBe(false);
    }
  });

  it('не хвърля при нетекстови стойности', () => {
    for (const bad of [0, 42, {}, [], true]) {
      expect(() => normalizeSentAt(bad)).not.toThrow();
      expect(normalizeSentAt(bad).ok).toBe(false);
    }
  });
});
