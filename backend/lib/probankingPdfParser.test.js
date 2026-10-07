// Редът със сумата в извлечението на ProCredit.
//
// До 25.09.2026 банката печаташе двете суми слепени — в евро и левовата
// равностойност: „102.00199.49КТ". От 26.09.2026 остава само еврото, с
// интервали преди операцията: „37.00    КТ". Докато парсерът чакаше две суми,
// всички нови редове се изхвърляха мълчаливо и импортът показваше само стари
// записи → „всичко е дубликат".
const { AMOUNT_END_RE, matchAmountAnywhere } = require('./probankingPdfParser');

const end = (line) => {
  const m = String(line).match(AMOUNT_END_RE);
  return m ? { eur: m[1], bgn: m[2] || null, op: m[3] } : null;
};

describe('ред със сума в края', () => {
  it('стар формат — две суми, слепени', () => {
    expect(end('102.00199.49КТ')).toEqual({ eur: '102.00', bgn: '199.49', op: 'КТ' });
    expect(end('80.03156.53ДТ')).toEqual({ eur: '80.03', bgn: '156.53', op: 'ДТ' });
  });

  it('нов формат — само евро, с интервали преди операцията', () => {
    expect(end('37.00    КТ')).toEqual({ eur: '37.00', bgn: null, op: 'КТ' });
    expect(end('13.00    ДТ')).toEqual({ eur: '13.00', bgn: null, op: 'ДТ' });
    expect(end('576.00    КТ')).toEqual({ eur: '576.00', bgn: null, op: 'КТ' });
  });

  it('нов формат без интервали също минава', () => {
    expect(end('150.00КТ')).toEqual({ eur: '150.00', bgn: null, op: 'КТ' });
  });

  it('хиляди с интервал', () => {
    expect(end('1 250.00    КТ')).toEqual({ eur: '1 250.00', bgn: null, op: 'КТ' });
    expect(end('1 250.002 445.12КТ')).toEqual({ eur: '1 250.00', bgn: '2 445.12', op: 'КТ' });
  });

  it('ред без операция не е сума', () => {
    expect(end('102.00199.49')).toBeNull();
    expect(end('НАЕМ ГАРАЖ ОКТОМВРИ')).toBeNull();
  });
});

describe('сума вътре в ред', () => {
  it('намира новия формат в компактен едноредов запис', () => {
    const r = matchAmountAnywhere('9148755762026-10-01МЕСЕЧНА ТАКСА РС13.00    ДТ');
    expect(r).toMatchObject({ eur: 13, bgn: null, op: 'ДТ', endsAtLineEnd: true });
  });

  it('намира стария формат', () => {
    const r = matchAmountAnywhere('7180754112026-01-05МЕСЕЧНА ТАКСА РС5.119.99ДТ');
    expect(r).toMatchObject({ op: 'ДТ' });
    expect(r.bgn).not.toBeNull();
  });

  it('дата в текста не се слива със сумата (стария капан)', () => {
    const r = matchAmountAnywhere('ПОС 22.03.24587.31    ДТ');
    expect(r.eur).toBe(587.31);
  });

  it('ред без сума връща null', () => {
    expect(matchAmountAnywhere('СМЕТКА: BG41UNCR70001524109407')).toBeNull();
    expect(matchAmountAnywhere('')).toBeNull();
  });
});
