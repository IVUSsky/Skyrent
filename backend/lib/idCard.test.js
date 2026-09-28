// Данните са ИЗМИСЛЕНИ — служат само за проверка на алгоритмите (контролни цифри).
const { parseMrz, validateEgn, isDateLike, normalizeDate, cleanDocNumber, looksLikeDocNumber, normalizeIdCard, checkDigit } = require('./idCard');

describe('контролна цифра по ICAO 9303', () => {
  it('примерите от стандарта', () => {
    expect(checkDigit('520727')).toBe('3');
    expect(checkDigit('AB2134<<<')).toBe('5');
  });
});

describe('ЕГН', () => {
  it('приема валидно ЕГН (контролна сума)', () => {
    expect(validateEgn('7523169263')).toBe(true); // пример от НАП
  });
  it('отхвърля сгрешена цифра, грешна дължина, невалиден месец', () => {
    expect(validateEgn('7523169264')).toBe(false);
    expect(validateEgn('752316926')).toBe(false);
    expect(validateEgn('7593169263')).toBe(false);
  });
});

describe('дата или номер', () => {
  it('разпознава дати в различни формати', () => {
    ['2030-05-12', '12.05.2030', '12/05/30', '300512'].forEach(v => expect(isDateLike(v)).toBe(true));
  });
  it('9-цифрен номер не е дата', () => {
    expect(isDateLike('641228123')).toBe(false);
    expect(looksLikeDocNumber('641228123')).toBe(true);
  });
  it('маха етикети и разделители', () => {
    expect(cleanDocNumber('№ 641 228 123')).toBe('641228123');
    expect(cleanDocNumber('л.к. № 641-228-123')).toBe('641228123');
  });
  it('нормализира датите към ГГГГ-ММ-ДД', () => {
    expect(normalizeDate('12.05.2030')).toBe('2030-05-12');
    expect(normalizeDate('2030-5-1')).toBe('2030-05-01');
  });
  it('паспортен номер с букви минава само в режим „не български"', () => {
    expect(looksLikeDocNumber('X1234567', { bulgarian: true })).toBe(false);
    expect(looksLikeDocNumber('X1234567', { bulgarian: false })).toBe(true);
  });
});

describe('MRZ на лична карта (TD1)', () => {
  // Изграден с валидни контролни цифри: номер 641228123, ЕГН 7523169263,
  // роден 16.03.1975, валидна до 12.05.2030.
  const l1 = 'IDBGR6412281234752316926300000';
  const line1 = l1.slice(0, 5) + '641228123' + checkDigit('641228123') + '7523169263' + '<<<<<';
  const line2 = '750316' + checkDigit('750316') + 'M' + '300512' + checkDigit('300512') + 'BGR' + '<'.repeat(11) + '0';
  const line3 = 'IVANOV<<IVAN<PETROV<<<<<<<<<<<';

  it('вади номера, ЕГН и датите с верни контролни цифри', () => {
    const m = parseMrz([line1, line2, line3].join('\n'));
    expect(m.ok).toBe(true);
    expect(m.format).toBe('TD1');
    expect(m.doc_number).toBe('641228123');
    expect(m.doc_number_valid).toBe(true);
    expect(m.egn).toBe('7523169263');
    expect(m.birth_date).toBe('1975-03-16');
    expect(m.expiry_date).toBe('2030-05-12');
    expect(m.sex).toBe('М');
  });
  it('сгрешена цифра в номера → предупреждение', () => {
    const bad = line1.slice(0, 5) + '641228124' + line1.slice(14);
    const m = parseMrz([bad, line2, line3].join('\n'));
    expect(m.doc_number_valid).toBe(false);
    expect(m.warnings.join(' ')).toMatch(/контролната цифра/);
  });
  it('без MRZ или непълна', () => {
    expect(parseMrz('').ok).toBe(false);
    expect(parseMrz(line1).ok).toBe(false);
  });
});

describe('подреждане на извлечените данни', () => {
  const base = { tenant_name: 'ИВАН ПЕТРОВ ИВАНОВ', egn: '7523169263', id_issued_date: '12.05.2020', id_valid_until: '12.05.2030', birth_date: '16.03.1975', permanent_address: 'гр. София' };

  it('казусът 28.09: в номера е разчетена дата на валидност → номерът се изчиства + предупреждение', () => {
    const { data, warnings } = normalizeIdCard({ ...base, id_number: '2030-05-12' });
    expect(data.id_number).toBe('');
    expect(data.id_valid_until).toBe('2030-05-12');
    expect(warnings.join(' ')).toMatch(/номер на документа беше разчетена дата/);
  });
  it('липсващ номер → предупреждение къде да го търси', () => {
    const { data, warnings } = normalizeIdCard({ ...base, id_number: '' });
    expect(data.id_number).toBe('');
    expect(warnings.join(' ')).toMatch(/долу дясно/);
  });
  it('нормален номер минава и се чисти от разделители', () => {
    const { data, warnings } = normalizeIdCard({ ...base, id_number: '№ 641 228 123' });
    expect(data.id_number).toBe('641228123');
    expect(warnings).toEqual([]);
  });
  it('номер, съвпадащ с дата от документа → изчиства се', () => {
    const { data, warnings } = normalizeIdCard({ ...base, id_number: '12052030', id_valid_until: '12052030' });
    expect(data.id_number).toBe('');
    expect(warnings.join(' ')).toMatch(/съвпада с дата/);
  });
  it('MRZ от гърба е с предимство и допълва липсващото', () => {
    const line1 = 'IDBGR' + '641228123' + checkDigit('641228123') + '7523169263' + '<<<<<';
    const line2 = '750316' + checkDigit('750316') + 'M' + '300512' + checkDigit('300512') + 'BGR' + '<'.repeat(11) + '0';
    const { data, warnings } = normalizeIdCard({ tenant_name: 'ИВАН ПЕТРОВ ИВАНОВ', id_number: '2030-05-12', egn: '', mrz: [line1, line2, 'IVANOV<<IVAN<<<<<<<<<<<<<<<<<<'].join('\n') });
    expect(data.id_number).toBe('641228123');
    expect(data.egn).toBe('7523169263');
    expect(data.birth_date).toBe('1975-03-16');
    expect(data.id_valid_until).toBe('2030-05-12');
    expect(warnings).toEqual([]);
  });
  it('разминаване между лицевата страна и MRZ → предупреждение', () => {
    const line1 = 'IDBGR' + '641228123' + checkDigit('641228123') + '7523169263' + '<<<<<';
    const line2 = '750316' + checkDigit('750316') + 'M' + '300512' + checkDigit('300512') + 'BGR' + '<'.repeat(11) + '0';
    const { warnings } = normalizeIdCard({ ...base, id_number: '641228124', mrz: [line1, line2, 'X<<X<<<<<<<<<<<<<<<<<<<<<<<<<<'].join('\n') });
    expect(warnings.join(' ')).toMatch(/различава от този в MRZ/);
  });
  it('сгрешено ЕГН → предупреждение, но данните минават', () => {
    const { data, warnings } = normalizeIdCard({ ...base, egn: '7523169264', id_number: '641228123' });
    expect(data.egn).toBe('7523169264');
    expect(warnings.join(' ')).toMatch(/ЕГН/);
  });
  it('разменени издаване/валидност се оправят', () => {
    const { data, warnings } = normalizeIdCard({ ...base, id_number: '641228123', id_issued_date: '2030-05-12', id_valid_until: '2020-05-12' });
    expect(data.id_issued_date).toBe('2020-05-12');
    expect(data.id_valid_until).toBe('2030-05-12');
    expect(warnings.join(' ')).toMatch(/разменени/);
  });
  it('чужд паспорт: буквено-цифрен номер минава', () => {
    const p2 = 'X1234567<' + checkDigit('X1234567<') + 'ROU' + '850101' + checkDigit('850101') + 'M' + '300512' + checkDigit('300512') + '<'.repeat(14) + '04';
    const { data, warnings } = normalizeIdCard({ tenant_name: 'ION POPESCU', id_number: 'X1234567', mrz: 'P<ROUPOPESCU<<ION<<<<<<<<<<<<<<<<<<<<<<<<<<<\n' + p2 });
    expect(data.id_number).toBe('X1234567');
    expect(warnings).toEqual([]);
  });
});
