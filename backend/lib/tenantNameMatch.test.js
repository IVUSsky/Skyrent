const { matchTenant, normalizeName } = require('./tenantNameMatch');

const T = [
  { property_id: 1, name: 'danaya daneva' },
  { property_id: 2, name: 'Никола Петров Вичев' },
  { property_id: 3, name: 'ȘERBAN ȘTEFAN-CĂTĂLIN' },
  { property_id: 4, name: 'Илия Илиев' },
  { property_id: 5, name: 'Вера Александрова Величкова-Гергова, Пламен Ангелов Гергов' },
];

describe('normalizeName', () => {
  it('кирилица → латиница, малки букви, без диакритика', () => {
    expect(normalizeName('Никола Вичев')).toBe('nikola vichev');
    expect(normalizeName('ȘERBAN ȘTEFAN-CĂTĂLIN')).toBe('serban stefan catalin');
    expect(normalizeName('DANAYA  DANEVA')).toBe('danaia daneva');
  });
});

describe('matchTenant — платецът от банката срещу наемателя в имота', () => {
  it('DANAYA DANEVA (банка) ↔ danaya daneva (имот)', () => {
    expect(matchTenant('DANAYA DANEVA', T)?.property_id).toBe(1);
  });
  it('латиница от банката ↔ кирилица в имота, обърнат ред, без бащино', () => {
    expect(matchTenant('VICHEV NIKOLA', T)?.property_id).toBe(2);
    expect(matchTenant('NIKOLA PETROV VICHEV', T)?.property_id).toBe(2);
  });
  it('румънски диакритики и тире', () => {
    expect(matchTenant('SERBAN STEFAN CATALIN', T)?.property_id).toBe(3);
  });
  it('само една обща дума при двусрично име → не (Илиев е често)', () => {
    expect(matchTenant('GEORGI ILIEV', T)).toBeNull();
  });
  it('двама наематели в един имот — хваща и единия, и другия', () => {
    expect(matchTenant('PLAMEN GERGOV', T)?.property_id).toBe(5);
    expect(matchTenant('VERA VELICHKOVA-GERGOVA', T)?.property_id).toBe(5);
  });
  it('фирма/непознат платец → null', () => {
    expect(matchTenant('EVN BULGARIA EAD', T)).toBeNull();
    expect(matchTenant('', T)).toBeNull();
  });
  it('еднакъв резултат за двама различни наематели → null (без гадаене)', () => {
    const two = [{ property_id: 1, name: 'Иван Петров' }, { property_id: 2, name: 'Иван Петров' }];
    expect(matchTenant('IVAN PETROV', two)).toBeNull();
  });
});

describe('толерантност към транслитерация', () => {
  const T2 = [
    { property_id: 20, name: 'Гьоркем Йълдърън' },
    { property_id: 21, name: 'ИВАНОВА ЕМИЛИЯ ВАСИЛЕВА' },
    { property_id: 22, name: 'Росен Чавдаров Козовски' },
    { property_id: 23, name: 'Иван Петров' },
    { property_id: 24, name: 'Иван Георгиев' },
  ];
  it('една буква разлика в дълга дума (Йълдърън ↔ ЙЪЛДЪРЪМ)', () => {
    expect(matchTenant('ГЬОРКЕМ ЙЪЛДЪРЪМ', T2)?.property_id).toBe(20);
  });
  it('латиница без бащино: Emilia Ivanova, Rosen Kozovski', () => {
    expect(matchTenant('Emilia Ivanova', T2)?.property_id).toBe(21);
    expect(matchTenant('Rosen Kozovski', T2)?.property_id).toBe(22);
  });
  it('рядко първо име само по себе си стига, често — не', () => {
    expect(matchTenant('GYORKEM', T2)?.property_id).toBe(20);
    expect(matchTenant('IVAN', T2)).toBeNull();
  });
});
