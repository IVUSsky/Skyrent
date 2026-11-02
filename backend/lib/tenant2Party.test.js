const { ensureTenant2, templateHasTenant2, looksBilingual, tenant2Details } = require('./tenant2Party');

// Шапката на истинската бланка „Стандартен договор за наем".
const TPL = [
  '# ДОГОВОР ЗА НАЕМ НА НЕДВИЖИМ ИМОТ',
  '',
  'Днес, {{ДАТА_ДНЕС}} г., в град София, на основание чл. 228-239 от ЗЗД се сключи настоящият договор между страните:',
  '',
  '**1. {{НАЕМОДАТЕЛ_ДАННИ_BG}}**, наричан за краткост **Наемодател**',
  '',
  'и',
  '',
  '**2. {{НАЕМАТЕЛ_ИМЕ}}** с ЕГН: {{НАЕМАТЕЛ_ЕГН}}, адрес: {{НАЕМАТЕЛ_АДРЕС}}, наричан за краткост **Наемател**.',
  '',
  '## I. ПРЕДМЕТ НА ДОГОВОРА',
  '',
  'Чл.1. Наемодателя предоставя на Наемателя следния имот: {{ИМОТ_ПЪЛНО_ОПИСАНИЕ}}.',
].join('\n');

const two = {
  tenant_name: 'Първи Наемател',
  tenant2_name: 'Втора Наемателка', tenant2_egn: '9001011234',
  tenant2_doc: 'лична карта', tenant2_doc_number: 'АА1234567',
  tenant2_doc_date: '10.03.2021', tenant2_address: 'гр. София, ул. Втора 2',
  tenant2_dob: '01.01.1990',
};

describe('вторият наемател в шапката на договора', () => {
  it('без втори наемател бланката остава дума по дума същата', () => {
    expect(ensureTenant2(TPL, { tenant_name: 'Сам Наемател' })).toBe(TPL);
    expect(ensureTenant2(TPL, { tenant2_name: '   ' })).toBe(TPL);
  });

  it('вторият се изписва веднага след първия, не накрая на договора', () => {
    const out = ensureTenant2(TPL, two).split('\n');
    const first = out.findIndex(l => l.includes('{{НАЕМАТЕЛ_ИМЕ}}'));
    const second = out.findIndex(l => l.includes('Втора Наемателка'));
    const section = out.findIndex(l => l.startsWith('## I.'));
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThan(section);
  });

  it('номерацията продължава тази на бланката', () => {
    expect(ensureTenant2(TPL, two)).toContain('**3. Втора Наемателка**');
  });

  it('изписва ЕГН, документ, адрес и дата на раждане', () => {
    const out = ensureTenant2(TPL, two);
    expect(out).toContain('с ЕГН: 9001011234');
    expect(out).toContain('л.к. № АА1234567');
    expect(out).toContain('изд. на: 10.03.2021 год.');
    expect(out).toContain('адрес: гр. София, ул. Втора 2');
    expect(out).toContain('роден на 01.01.1990');
  });

  it('само име, без други данни — пак влиза като страна', () => {
    const out = ensureTenant2(TPL, { tenant2_name: 'Само Име' });
    expect(out).toContain('**3. Само Име**');
    expect(out).not.toMatch(/undefined|null|,\s*,/);
  });

  it('клаузата ги прави СОЛИДАРНО отговорни, включително за опазването', () => {
    const out = ensureTenant2(TPL, two);
    expect(out).toContain('Лицата по т. 2 и т. 3 се наричат заедно **Наемател**');
    expect(out).toMatch(/отговарят солидарно/);
    expect(out).toMatch(/опазването на имота/);
    expect(out).toMatch(/приемо-предавателния протокол/);
    expect(out).toMatch(/действията и бездействията на всички ползватели/);
  });

  it('бланка, която сама ползва плейсхолдъра, не се пипа', () => {
    const own = TPL.replace('{{НАЕМАТЕЛ_АДРЕС}}', '{{НАЕМАТЕЛ_АДРЕС}} {{НАЕМАТЕЛ2_ДАННИ}}');
    expect(ensureTenant2(own, two)).toBe(own);
    const kratka = TPL.replace('{{НАЕМАТЕЛ_ИМЕ}}', '{{НАЕМАТЕЛИ}}');
    expect(ensureTenant2(kratka, two)).toBe(kratka);
  });

  it('бланка без номерация минава без номер', () => {
    const abonat = TPL.replace('**2. {{НАЕМАТЕЛ_ИМЕ}}**', '**АБОНАТ:** {{НАЕМАТЕЛ_ИМЕ}}');
    const out = ensureTenant2(abonat, two);
    expect(out).toContain('**Втора Наемателка**');
    expect(out).not.toContain('**3.');
    expect(out).toContain('Двете лица по-горе се наричат заедно');
  });

  it('бланка без ред за наемателя слага абзаца преди първия раздел', () => {
    const noLine = TPL.split('\n').filter(l => !l.includes('{{НАЕМАТЕЛ_ИМЕ}}')).join('\n');
    const out = ensureTenant2(noLine, two).split('\n');
    expect(out.findIndex(l => l.includes('Втора Наемателка')))
      .toBeLessThan(out.findIndex(l => l.startsWith('## I.')));
  });

  it('съвсем непозната бланка все пак го изписва, вместо да го изгуби', () => {
    const out = ensureTenant2('Свободен текст без нищо познато.', two);
    expect(out).toContain('Втора Наемателка');
    expect(out).toMatch(/солидарно/);
  });
});

describe('двуезични бланки', () => {
  const BI = [
    '# ДОГОВОР ЗА НАЕМ / RESIDENTIAL LEASE AGREEMENT',
    '',
    '**1. {{НАЕМОДАТЕЛ_ИМЕ}}** / Landlord, наричан **Наемодател** / the "Landlord"',
    '',
    '**2. {{НАЕМАТЕЛ_ИМЕ}}** с ЕГН / ID {{НАЕМАТЕЛ_ЕГН}}, наричан **Наемател** / the "Tenant"',
    '',
    '## I. ПРЕДМЕТ / SUBJECT',
  ].join('\n');

  it('разпознава двуезична бланка', () => {
    expect(looksBilingual(BI)).toBe(true);
    expect(looksBilingual(TPL)).toBe(false);
  });

  it('пише данните и клаузата на двата езика', () => {
    const out = ensureTenant2(BI, two);
    expect(out).toContain('ID No: 9001011234');
    expect(out).toMatch(/jointly and severally liable/);
    expect(out).toMatch(/safekeeping of the property/);
  });

  it('едноезичната бланка не получава английски текст', () => {
    expect(ensureTenant2(TPL, two)).not.toMatch(/jointly and severally/);
  });
});

describe('дребни неща', () => {
  it('разпознава всички плейсхолдъри за втори наемател', () => {
    expect(templateHasTenant2('… {{НАЕМАТЕЛ2_ИМЕ}} …')).toBe(true);
    expect(templateHasTenant2('… {{ НАЕМАТЕЛИ }} …')).toBe(true);
    expect(templateHasTenant2('… {{НАЕМАТЕЛ_ИМЕ}} …')).toBe(false);
  });

  it('непознат вид документ се изписва както е въведен', () => {
    expect(tenant2Details({ tenant2_doc: 'паспорт', tenant2_doc_number: 'X1' })).toContain('паспорт № X1');
  });
});

describe('кой е „Наемател" остава еднозначно', () => {
  it('определението на първия отпада и минава в общата клауза', () => {
    const out = ensureTenant2(TPL, two);
    const party = out.split('\n').find(l => l.includes('{{НАЕМАТЕЛ_ИМЕ}}'));
    expect(party).not.toMatch(/наричан за краткост/);
    expect(party.trim().endsWith(',')).toBe(false);
    expect(out).toContain('се наричат заедно **Наемател**');
  });

  it('при един наемател определението си остава', () => {
    const party = ensureTenant2(TPL, {}).split('\n').find(l => l.includes('{{НАЕМАТЕЛ_ИМЕ}}'));
    expect(party).toMatch(/наричан за краткост \*\*Наемател\*\*\./);
  });

  it('определението на НАЕМОДАТЕЛЯ не се пипа', () => {
    expect(ensureTenant2(TPL, two)).toContain('наричан за краткост **Наемодател**');
  });
});
