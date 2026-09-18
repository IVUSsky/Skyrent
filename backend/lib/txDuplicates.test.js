const { sameCounterparty, findDuplicatePairs } = require('./txDuplicates');

describe('един и същ платец', () => {
  it('различен регистър на кирилица (двата експорта на ProBanking)', () => {
    expect(sameCounterparty('ПЕТЯ ИЛИЕВА СТОЙКОВА', 'Петя Илиева Стойкова')).toBe(true);
  });
  it('празен контрагент (стар парсер) минава за същия', () => {
    expect(sameCounterparty('', 'Danaya Daneva')).toBe(true);
    expect(sameCounterparty(null, 'Emilia Ivanova')).toBe(true);
  });
  it('латиница/кирилица на същото име', () => {
    expect(sameCounterparty('DANAYA DANEVA', 'Даная Данева')).toBe(true);
  });
  it('различни хора не са същият', () => {
    expect(sameCounterparty('Danaya Daneva', 'Emilia Ivanova')).toBe(false);
  });
});

describe('двойки от двоен импорт', () => {
  const eur = (o) => ({ operation: 'Кт', currency: 'EUR', ...o });

  it('Даная: празен + с име, същата дата и сума → маха се празният', () => {
    const rows = [
      eur({ id: 10, дата: '2026-09-05', контрагент: '', сума: 153, property_id: 19, категория: 'наем' }),
      eur({ id: 40, дата: '2026-09-05', контрагент: 'Danaya Daneva', сума: 153, property_id: 19, категория: 'наем' }),
    ];
    const p = findDuplicatePairs(rows);
    expect(p).toHaveLength(1);
    expect(p[0].keep.id).toBe(40);
    expect(p[0].drop.id).toBe(10);
  });

  it('Петя: главни / малки букви → остава по-новият', () => {
    const rows = [
      eur({ id: 11, дата: '2026-09-09', контрагент: 'ПЕТЯ ИЛИЕВА СТОЙКОВА', сума: 37, property_id: 5, категория: 'наем' }),
      eur({ id: 41, дата: '2026-09-09', контрагент: 'Петя Илиева Стойкова', сума: 37, property_id: 5, категория: 'наем' }),
    ];
    const p = findDuplicatePairs(rows);
    expect(p).toHaveLength(1);
    expect(p[0].keep.id).toBe(41);
    expect(p[0].drop.id).toBe(11);
  });

  it('еднакво записани = реални отделни преводи (наем + депозит) → не се пипат', () => {
    const rows = [
      eur({ id: 1, дата: '2026-09-01', контрагент: 'ILIYA GEORGIEV', сума: 170, property_id: 7, категория: 'наем' }),
      eur({ id: 2, дата: '2026-09-01', контрагент: 'ILIYA GEORGIEV', сума: 170, property_id: 7, категория: 'депозит_получен' }),
    ];
    expect(findDuplicatePairs(rows)).toHaveLength(0);
  });

  it('различна сума или дата → не е дубликат', () => {
    const rows = [
      eur({ id: 1, дата: '2026-09-05', контрагент: '', сума: 153 }),
      eur({ id: 2, дата: '2026-09-05', контрагент: 'Danaya Daneva', сума: 150 }),
      eur({ id: 3, дата: '2026-09-06', контрагент: 'Danaya Daneva', сума: 153 }),
    ];
    expect(findDuplicatePairs(rows)).toHaveLength(0);
  });

  it('BGN и EUR запис на същия превод (курс 1.95583)', () => {
    const rows = [
      { id: 1, дата: '2025-11-03', operation: 'Кт', контрагент: '', сума: 195.58, currency: 'BGN' },
      { id: 2, дата: '2025-11-03', operation: 'Кт', контрагент: 'Rosen Kozovski', сума: 100, currency: 'EUR' },
    ];
    const p = findDuplicatePairs(rows);
    expect(p).toHaveLength(1);
    expect(p[0].drop.id).toBe(1);
  });

  it('троен запис: празен + главни + малки → две двойки, остава един', () => {
    const rows = [
      eur({ id: 1, дата: '2026-09-04', контрагент: '', сума: 30 }),
      eur({ id: 2, дата: '2026-09-04', контрагент: 'ИВАНОВА ЕМИЛИЯ', сума: 30 }),
      eur({ id: 3, дата: '2026-09-04', контрагент: 'Иванова Емилия', сума: 30, property_id: 3 }),
    ];
    const p = findDuplicatePairs(rows);
    expect(p.map(x => x.drop.id).sort()).toEqual([1, 2]);
    expect(p.every(x => x.keep.id === 3)).toBe(true);
  });

  it('Дт (разходи) също се хващат', () => {
    const rows = [
      { id: 1, дата: '2026-09-02', operation: 'Дт', контрагент: '', сума: 48.2, currency: 'EUR' },
      { id: 2, дата: '2026-09-02', operation: 'Дт', контрагент: 'ЕЛЕКТРОХОЛД ПРОДАЖБИ', сума: 48.2, currency: 'EUR' },
    ];
    expect(findDuplicatePairs(rows)).toHaveLength(1);
  });
});
