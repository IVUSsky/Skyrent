// Дубликати в указателя. Най-важното, което тези тестове пазят, е ОБРАТНОТО
// на очакваното: да не слеем два различни субекта. В реалните данни фирма и
// управителят ѝ носят един номер на лична карта, а фирма и собственикът ѝ —
// един телефон.
const { findDuplicates, planMerge, isCompany, sortedName } = require('./partyDedupe');

const P = (id, name, over = {}) => ({ id, name, egn: '', phone: '', email: '', address: '', doc_number: '', notes: '', ...over });

const one = (parties) => { const g = findDuplicates(parties); return g.length === 1 ? g[0] : g; };

describe('разпознаване на фирма', () => {
  it('по правна форма в името', () => {
    expect(isCompany(P(1, 'ВТА Секюрити Сървиз ЕООД'))).toBe(true);
    expect(isCompany(P(2, 'Джей енд ар ЕООД'))).toBe(true);
    expect(isCompany(P(3, 'Иван Петров'))).toBe(false);
  });
  it('по дължина на ЕИК срещу ЕГН', () => {
    expect(isCompany(P(1, 'Нещо', { egn: '131395596' }))).toBe(true);   // 9 = ЕИК
    expect(isCompany(P(2, 'Нещо', { egn: 'BG131395596' }))).toBe(true);
    expect(isCompany(P(3, 'Нещо', { egn: '7610014840' }))).toBe(false); // 10 = ЕГН
  });
});

describe('подредено име', () => {
  it('редът на думите не прави разлика', () => {
    expect(sortedName('JOVANOVIĆ LUKA')).toBe(sortedName('LUKA JOVANOVIC'));
  });
  it('диакритиката и регистърът не правят разлика', () => {
    expect(sortedName('Ćosić')).toBe(sortedName('cosic'));
  });
  it('различен правопис ОСТАВА различен — не гадаем', () => {
    expect(sortedName('Йълдърън')).not.toBe(sortedName('Йълдърьм'));
  });
});

describe('сигурни дубликати', () => {
  it('разменени имена с едно ЕГН', () => {
    const g = one([
      P(36, 'JOVANOVIĆ LUKA', { egn: '0602998800080', phone: '+381 60 3087037' }),
      P(37, 'LUKA JOVANOVIC', { egn: '0602998800080', phone: '+381 60 3087037' }),
    ]);
    expect(g.confidence).toBe('сигурно');
    expect(g.items).toHaveLength(2);
  });

  it('еднакво име без ЕГН, но същият телефон', () => {
    const g = one([
      P(38, 'LISOVA KRYSTYNA', { phone: '+359 88 6737884', email: 'k@gmail.com' }),
      P(39, 'LISOVA KRYSTYNA', { phone: '+359 88 6737884', email: 'k@gmail.com' }),
    ]);
    expect(g.confidence).toBe('сигурно');
  });

  it('различен правопис, но едно ЕГН — пак сигурно', () => {
    const g = one([
      P(12, 'Гьоркем Йълдърън', { egn: '8901102468' }),
      P(13, 'Гьоркем Йълдърьм', { egn: '8901102468' }),
    ]);
    expect(g.confidence).toBe('сигурно');
  });

  it('телефон с код и без код е един телефон', () => {
    const g = one([
      P(1, 'Росен Козовски', { phone: '0878555310' }),
      P(2, 'Росен Козовски', { phone: '+359878555310' }),
    ]);
    expect(g.confidence).toBe('сигурно');
  });
});

describe('капаните — НЕ се сливат', () => {
  it('фирма и управител с един номер на лична карта', () => {
    const g = one([
      P(33, 'ВТА Секюрити Сървиз ЕООД', { egn: 'BG131395596', doc_number: '646826581' }),
      P(32, 'ЛУЛЧЕВ ГЕОРГИ ТОДОРОВ', { egn: '7610014840', doc_number: '646826581' }),
    ]);
    expect(g.confidence).toBe('за преглед');
    expect(g.warnings.join(' ')).toContain('фирма и физическо лице');
  });

  it('фирма и собственик с един телефон', () => {
    const g = one([
      P(35, 'Джей енд ар ЕООД', { egn: '206320030', phone: '+359878555310' }),
      P(5, 'Росен Чавдаров Козовски', { egn: '7108256700', phone: '0878555310' }),
    ]);
    expect(g.confidence).toBe('за преглед');
  });

  it('двама души с общ телефон', () => {
    const g = one([
      P(3, 'Натали Спасова', { egn: '0648090158', phone: '0897399591' }),
      P(34, 'Пламен Петков', { egn: '0048053201', phone: '0897399591' }),
    ]);
    expect(g.confidence).toBe('за преглед');
    expect(g.warnings.join(' ')).toContain('различни ЕГН');
  });

  it('само съвпадащ имейл не е самоличност', () => {
    const g = one([
      P(1, 'Иван Петров', { email: 'office@firma.bg' }),
      P(2, 'Мария Георгиева', { email: 'office@firma.bg' }),
    ]);
    expect(g.confidence).toBe('за преглед');
  });
});

describe('групиране', () => {
  it('различните хора не попадат в група', () => {
    expect(findDuplicates([P(1, 'Иван Петров'), P(2, 'Мария Георгиева')])).toHaveLength(0);
  });

  it('преходно: A=B по ЕГН, B=C по име → една група от три', () => {
    const g = one([
      P(1, 'Иван Петров', { egn: '1111111111' }),
      P(2, 'Петров Иван', { egn: '1111111111' }),
      P(3, 'Иван Петров', {}),
    ]);
    expect(g.items.map(x => x.id).sort()).toEqual([1, 2, 3]);
  });

  it('празни полета не слепват записи', () => {
    expect(findDuplicates([
      P(1, 'Иван Петров', { phone: '', email: '', egn: '' }),
      P(2, 'Мария Георгиева', { phone: '', email: '', egn: '' }),
    ])).toHaveLength(0);
  });

  it('къс телефон не е ключ', () => {
    expect(findDuplicates([P(1, 'А', { phone: '112' }), P(2, 'Б', { phone: '112' })])).toHaveLength(0);
  });

  it('сигурните излизат преди тези за преглед', () => {
    const g = findDuplicates([
      P(1, 'Фирма ЕООД', { egn: '131395596', doc_number: '555555' }),
      P(2, 'Иван Петров', { egn: '7610014840', doc_number: '555555' }),
      P(3, 'Мария Иванова', { egn: '8901102468' }),
      P(4, 'Иванова Мария', { egn: '8901102468' }),
    ]);
    expect(g[0].confidence).toBe('сигурно');
    expect(g[1].confidence).toBe('за преглед');
  });
});

describe('планът за сливане', () => {
  const keep = P(1, 'Иван Петров', { egn: '1111111111', phone: '' , notes: 'стара бележка' });
  const other = P(2, 'Петров Иван', { egn: '1111111111', phone: '0888123456', email: 'i@p.bg' });

  it('запълва само празните полета на оцелелия', () => {
    const { fields } = planMerge(keep, [other]);
    expect(fields.phone).toBe('0888123456');
    expect(fields.email).toBe('i@p.bg');
    expect(fields.egn).toBeUndefined();   // оцелелият си има
  });

  it('своята стойност бие дарителската', () => {
    const { fields } = planMerge({ ...keep, phone: '0999' }, [other]);
    expect(fields.phone).toBeUndefined();
  });

  it('другото изписване на името влиза в бележка — да се намира по него', () => {
    const { fields } = planMerge(keep, [other]);
    expect(fields.notes).toContain('Петров Иван');
    expect(fields.notes).toContain('стара бележка');
    expect(fields.notes).toContain('Слети записи №2');
  });

  it('еднакво име не се дублира в бележката', () => {
    const { fields } = planMerge(keep, [{ ...other, name: 'Иван Петров' }]);
    expect(fields.notes).not.toContain('Други изписвания');
  });
});
