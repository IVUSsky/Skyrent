// Срокът като готово изречение. Съществува, защото двуезичната бланка иска
// {{СРОК_BG}} / {{СРОК_EN}}, а в договора стоеше буквално плейсхолдърът.
const { termMonths, termBG, termEN, enWords } = require('./contractTerm');

const year = { start_date: '2026-11-04', end_date: '2027-11-04' };

describe('брой месеци', () => {
  it('една година е 12 месеца', () => expect(termMonths('2026-11-04', '2027-11-04')).toBe(12));
  it('половин година е 6', () => expect(termMonths('2026-01-01', '2026-07-01')).toBe(6));
  it('по-малко от месец пак е 1 — нула месеца няма смисъл', () => {
    expect(termMonths('2026-01-01', '2026-01-10')).toBe(1);
  });
  it('липсваща крайна дата значи безсрочен', () => {
    expect(termMonths('2026-11-04', null)).toBeNull();
    expect(termMonths('2026-11-04', '')).toBeNull();
  });
  it('боклук за дата не хвърля', () => expect(termMonths('кога', 'тогава')).toBeNull());
});

describe('изречението на български', () => {
  it('срочен договор дава месеци с думи и крайна дата', () => {
    expect(termBG(year)).toBe('Срокът на договора е 12 (дванадесет) месеца, до 04.11.2027 г.');
  });
  it('без крайна дата — неопределен срок', () => {
    expect(termBG({ start_date: '2026-11-04' })).toBe('Договорът се сключва за неопределен срок');
  });
  it('не завършва с точка — бланката слага своята', () => {
    expect(termBG(year).endsWith('.')).toBe(true);        // „г." завършва с точка
    expect(termBG({ start_date: '2026-11-04' }).endsWith('.')).toBe(false);
  });
});

describe('изречението на английски', () => {
  it('срочен договор', () => {
    expect(termEN(year)).toBe('The term of this Agreement is 12 (twelve) months, until 04.11.2027');
  });
  it('без „г." — то е българско и няма работа в английски текст', () => {
    expect(termEN(year)).not.toContain('г.');
  });
  it('единствено число при един месец', () => {
    expect(termEN({ start_date: '2026-01-01', end_date: '2026-02-01' })).toContain('1 (one) month,');
  });
  it('без крайна дата', () => {
    expect(termEN({ start_date: '2026-11-04' })).toBe('This Agreement is concluded for an indefinite term');
  });
  it('не завършва с точка', () => expect(termEN(year).endsWith('.')).toBe(false));
});

describe('английски числа с думи', () => {
  it.each([[1, 'one'], [12, 'twelve'], [18, 'eighteen'], [24, 'twenty-four'], [30, 'thirty'], [36, 'thirty-six']])
    ('%i → %s', (n, w) => expect(enWords(n)).toBe(w));
});
