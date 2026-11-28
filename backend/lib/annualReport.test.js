// Годишен отчет — правилата, на които стоят числата. Казусите повтарят
// реални случаи от сверката извлечение ↔ платформата; имената и сумите са измислени.
const { buildAnnualReport, toEur, splitDeposit, classify } = require('./annualReport');

const ISSUER = { name: 'Скай Кепитъл ООД', mol: 'Петър Петров', vat_number: 'BG000000000', vat_rate: 20 };
const tx = (o) => ({ session_id: 1, currency: 'EUR', категория: 'разход_друг', контрагент: '', основание: '', ...o });
const run = (transactions, extra = {}) => buildAnnualReport({ year: 2026, transactions, issuer: ISSUER, ...extra });

describe('валута', () => {
  it('BGN се превръща по фиксирания курс, EUR остава', () => {
    expect(toEur({ сума: 1955.83, currency: 'BGN' })).toBeCloseTo(1000, 2);
    expect(toEur({ сума: 100, currency: 'EUR' })).toBe(100);
  });
  it('без колона currency — валутата следва датата (преди 2026 = лева)', () => {
    expect(toEur({ сума: 195.583, дата: '2025-06-01' })).toBeCloseTo(100, 2);
    expect(toEur({ сума: 100, дата: '2026-02-01' })).toBe(100);
  });
});

describe('оборот и ДДС', () => {
  it('наемът без ДДС = бруто ÷ 1,2; освободен имот остава бруто', () => {
    const r = run([
      tx({ дата: '2026-01-05', operation: 'Кт', сума: 600, категория: 'наем', property_id: 1, контрагент: 'А' }),
      tx({ дата: '2026-01-06', operation: 'Кт', сума: 300, категория: 'наем', property_id: 2, контрагент: 'Б' }),
    ], { properties: [{ id: 1, vat_exempt: 0 }, { id: 2, vat_exempt: 1 }] });
    expect(r.totals.rent_gross).toBe(900);
    expect(r.totals.rent_net).toBe(800);
  });
  it('фирма без ДДС номер → нето = бруто', () => {
    const r = buildAnnualReport({ year: 2026, issuer: { name: 'X' }, transactions: [
      tx({ дата: '2026-01-05', operation: 'Кт', сума: 600, категория: 'наем' })] });
    expect(r.totals.rent_net).toBe(600);
  });
  it('ДДС към НАП и възстановеният ДДС не са нито приход, нито разход', () => {
    const r = run([
      tx({ дата: '2026-04-03', operation: 'Кт', сума: 5000, категория: 'приход_друг', контрагент: 'НАП', основание: 'ВЪЗСТАНОВЯВАНЕ ДДС' }),
      tx({ дата: '2026-04-08', operation: 'Дт', сума: 800, категория: 'нап_ддс', контрагент: 'НАП ДДС МЛАДОСТ' }),
    ]);
    expect(r.totals.vat_refund).toBe(5000);
    expect(r.totals.vat_paid).toBe(800);
    expect(r.totals.rent_gross).toBe(0);
    expect(r.totals.profit).toBe(0);
  });
});

describe('депозити', () => {
  it('„наем + депозит" над наема по договора → излишъкът е депозит', () => {
    expect(splitDeposit({ основание: 'НАЕМ ЮЛИ + DEPOSIT', property_id: 9 }, 900, new Map([[9, 600]])))
      .toEqual({ rent: 600, deposit: 300 });
  });
  it('без дума за депозит — цялата сума е наем', () => {
    expect(splitDeposit({ основание: 'НАЕМ', property_id: 9 }, 1200, new Map([[9, 600]]))).toEqual({ rent: 1200, deposit: 0 });
  });
});

describe('класификация', () => {
  const ctx = { ownerTokens: ['петър', 'петров'], selfName: 'скай кепитъл' };
  it('заем от собственика е финансиране, не оборот', () => {
    expect(classify(tx({ operation: 'Кт', контрагент: 'ПЕТЪР ПЕТРОВ ПЕТРОВ', основание: 'ПО ДОГОВОР ЗА ЗАЕМ', категория: 'приход_друг' }), ctx).kind).toBe('financing');
  });
  it('превод към собствена сметка е вътрешен', () => {
    expect(classify(tx({ operation: 'Дт', контрагент: 'СКАЙ КЕПИТЪЛ ООД' }), ctx).kind).toBe('internal');
  });
  it('магазин за материали с разкъсано име → ремонт', () => {
    expect(classify(tx({ operation: 'Дт', контрагент: 'PR AKTIKER RITEYL EOOD' }), ctx).kind).toBe('reno');
    expect(classify(tx({ operation: 'Дт', контрагент: 'RO13171 ema g.bg' }), ctx).kind).toBe('reno');
  });
  it('нотариус → към покупките; „нот" в друга дума — не', () => {
    expect(classify(tx({ operation: 'Дт', контрагент: 'НОТ. МАРИЯ ПЕТРОВА' }), ctx).kind).toBe('purchase');
    expect(classify(tx({ operation: 'Дт', контрагент: 'NOTARIUS GEORGI DIMOV' }), ctx).kind).toBe('purchase');
    expect(classify(tx({ operation: 'Дт', контрагент: 'НОТЕБУК ЕООД' }), ctx).kind).toBe('opex');
  });
  it('собствената фирма се познава и без правната форма', () => {
    const r = run([tx({ дата: '2026-05-08', operation: 'Дт', сума: 500, контрагент: 'СКАЙ КЕПИТЪЛ' })]);
    expect(r.totals.internal).toBe(-500);
    expect(r.totals.opex).toBe(0);
  });
  it('некатегоризирано плащане над 10 000 € не е текущ разход', () => {
    expect(classify(tx({ operation: 'Дт', контрагент: 'СТРОИТЕЛ ООД', сума: 45000 }), ctx).kind).toBe('large');
  });
});

describe('научени контрагенти', () => {
  it('контрагент с покупка веднъж → некатегоризираните му редове също са покупка', () => {
    const r = run([
      tx({ дата: '2026-02-24', operation: 'Дт', сума: 20000, категория: 'инвестиция', контрагент: 'ИНВЕСТ СТРОЙ АД' }),
      tx({ дата: '2026-02-20', operation: 'Дт', сума: 5000, категория: 'разход_друг', контрагент: 'ИНВЕСТ СТРОЙ АД' }),
    ]);
    expect(r.totals.purchase).toBe(25000);
    expect(r.totals.opex).toBe(0);
  });
});

describe('двойно внесени движения', () => {
  it('същото плащане от два формата на извлечението (ден разлика) се брои веднъж', () => {
    const r = run([
      tx({ session_id: 21, дата: '2026-08-10', operation: 'Дт', сума: 120, контрагент: 'SHO ES STORE', основание: 'ПОС плащане 120.00 EUR A1234567 SHO ES STORE SOFIYA' }),
      tx({ session_id: 24, дата: '2026-08-11', operation: 'Дт', сума: 120, контрагент: 'SHO ES STORE', основание: 'Транзакции с Карти.;ПОС плащане 120.00 EUR A1234567 SHO|ES' }),
    ]);
    expect(r.totals.opex).toBe(120);
    expect(r.data_quality.duplicates_skipped).toBe(1);
  });
  it('две реални месечни такси в един месец (еднакво основание, различни дни) остават две', () => {
    const r = run([
      tx({ session_id: 18, дата: '2026-07-06', operation: 'Дт', сума: 200, категория: 'счетоводство', контрагент: 'СЧЕТОВОДНА КЪЩА ЕООД', основание: 'МЕСЕЧНА ТАКСА' }),
      tx({ session_id: 20, дата: '2026-07-09', operation: 'Дт', сума: 200, категория: 'счетоводство', контрагент: 'СЧЕТОВОДНА КЪЩА ЕООД', основание: 'МЕСЕЧНА ТАКСА' }),
    ]);
    expect(r.totals.opex).toBe(400);
    expect(r.data_quality.duplicates_skipped).toBe(0);
  });
  it('в рамките на една сесия нищо не се маха', () => {
    const r = run([
      tx({ session_id: 5, дата: '2026-03-01', operation: 'Кт', сума: 400, категория: 'наем', контрагент: 'А' }),
      tx({ session_id: 5, дата: '2026-03-01', operation: 'Кт', сума: 400, категория: 'наем', контрагент: 'А' }),
    ]);
    expect(r.totals.rent_gross).toBe(800);
  });
});

describe('месеци, печалба, сравнение', () => {
  it('печалба = наем без ДДС − оперативни; инвестициите не я пипат', () => {
    const r = run([
      tx({ дата: '2026-01-05', operation: 'Кт', сума: 1200, категория: 'наем', контрагент: 'А' }),
      tx({ дата: '2026-01-10', operation: 'Дт', сума: 100, категория: 'счетоводство', контрагент: 'Счетоводител' }),
      tx({ дата: '2026-01-19', operation: 'Дт', сума: 12000, категория: 'благородни метали', контрагент: 'METALS DEALER OU' }),
    ]);
    expect(r.totals.profit).toBe(900);
    expect(r.totals.metals).toBe(12000);
    expect(r.months[0].cum_profit).toBe(900);
    expect(r.months[1].has_data).toBe(false);
  });
  it('сравнението с миналата година е само по месеци с наеми и в двете години', () => {
    const r = run([
      tx({ дата: '2025-02-05', operation: 'Кт', сума: 600, категория: 'наем', контрагент: 'А' }),
      tx({ дата: '2026-01-05', operation: 'Кт', сума: 900, категория: 'наем', контрагент: 'А' }),
      tx({ дата: '2026-02-05', operation: 'Кт', сума: 900, категория: 'наем', контрагент: 'А' }),
    ]);
    expect(r.prev_year.comparable_months).toBe(1);
    expect(r.yoy).toBe(50);
  });
  it('наем на месец = последният пълен месец', () => {
    const r = run([
      tx({ дата: '2026-09-05', operation: 'Кт', сума: 600, категория: 'наем', контрагент: 'А' }),
      tx({ дата: '2026-10-05', operation: 'Кт', сума: 720, категория: 'наем', контрагент: 'А' }),
      tx({ дата: '2026-11-03', operation: 'Кт', сума: 60, категория: 'наем', контрагент: 'Б' }),
    ]);
    expect(r.run_rate.month).toBe('2026-10');
    expect(r.run_rate.gross).toBe(720);
  });
});

describe('наематели', () => {
  it('един имот, платен на латиница и на кирилица → един ред, един платец в месеца', () => {
    const r = run([
      tx({ дата: '2026-01-05', operation: 'Кт', сума: 500, категория: 'наем', property_id: 11, контрагент: 'PETAR IVANOV' }),
      tx({ дата: '2026-02-05', operation: 'Кт', сума: 500, категория: 'наем', property_id: 11, контрагент: 'ПЕТЪР ИВАНОВ' }),
    ]);
    expect(r.payers).toHaveLength(1);
    expect(r.payers[0].name).toBe('ПЕТЪР ИВАНОВ');
    expect(r.payers[0].months).toBe(2);
    expect(r.months[0].tenants).toBe(1);
  });
});

describe('кредити', () => {
  it('лихвата се смята само за кредитите на имоти, които носят приход на фирмата', () => {
    const r = run([
      tx({ дата: '2026-01-05', operation: 'Кт', сума: 600, категория: 'наем', контрагент: 'А', property_id: 26 }),
    ], { loans: [
      { id: 9, банка: 'Прокредит', остатък: 120000, лихва: 3, вноска: 500, имоти: '[26,27]' },
      { id: 3, банка: 'УниКредит', остатък: 35000, лихва: 2.4, вноска: 150, имоти: '[6]' },
    ] });
    expect(r.financing.loans.map(l => l.id)).toEqual([9]);
    expect(r.financing.interest_month).toBe(300);
  });
});
