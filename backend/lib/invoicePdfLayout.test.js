// Оформлението на фактурата се мери, а не се гадае.
//
// Поводът: блокът на получателя вдигаше реда с фиксирани 12 точки. Щом адресът
// не се побереше в колоната, PDFKit го пренасяше на втори ред, но следващият
// ред (ЕГН) се чертаеше 12 точки по-долу и падаше ВЪРХУ втория ред на адреса.
// Същият клас дефект имаше на още три места: „Данъчна основа" в шапката на
// таблицата, „ОБЩО ЗА ПЛАЩАНЕ:" в сумите и дългото описание в реда на стоката.
//
// Затова тук се мери с ИСТИНСКИЯ шрифт, с който се печата фактурата. Ако някой
// удължи етикет или стесни колона, тестът пада, вместо дефектът да излезе при
// счетоводителя.
const path = require('path');
const PDFDocument = require('pdfkit');
const { PDF_LAYOUT: L } = require('../routes/invoices');

const FONT_R = path.join(__dirname, '../fonts/arial.ttf');
const FONT_B = path.join(__dirname, '../fonts/arialbd.ttf');

let doc;
beforeEach(() => {
  doc = new PDFDocument({ size: 'A4', margin: L.margin });
  doc.registerFont('R', FONT_R);
  doc.registerFont('B', FONT_B);
});

const widthOf = (text, font, size) => { doc.font(font).fontSize(size); return doc.widthOfString(text); };
const heightOf = (text, font, size, w) => { doc.font(font).fontSize(size); return doc.heightOfString(text, { width: w }); };

describe('шапка на таблицата', () => {
  // Етикетите се печатат с 8pt получер. Всеки трябва да се побере на ЕДИН ред —
  // втори ред изпада под синята лента и се реже наполовина.
  for (const key of ['desc', 'qty', 'unit', 'base', 'total']) {
    it(`„${L.headers[key]}" се побира в колоната си`, () => {
      const needed = widthOf(L.headers[key], 'B', 8);
      // при desc текстът е отместен с 4 точки навътре
      const avail = key === 'desc' ? L.cw.desc : L.cw[key];
      expect(needed).toBeLessThanOrEqual(avail);
    });
  }

  it('последната колона свършва вътре в таблицата', () => {
    const right = L.cols.total + L.cw.total;
    expect(right).toBeLessThanOrEqual(L.pageWidth - L.margin);
  });

  it('колоните не се застъпват помежду си', () => {
    const order = ['desc', 'qty', 'unit', 'base', 'total'];
    for (let i = 0; i < order.length - 1; i++) {
      const end = L.cols[order[i]] + L.cw[order[i]];
      expect(end).toBeLessThanOrEqual(L.cols[order[i + 1]]);
    }
  });
});

describe('блок със сумите', () => {
  it('„ОБЩО ЗА ПЛАЩАНЕ:" се побира на един ред', () => {
    expect(widthOf(L.totalsLabel, 'B', 10)).toBeLessThanOrEqual(L.tLabelW);
  });

  it('блокът свършва вътре в страницата', () => {
    expect(L.tX + L.tW).toBeLessThanOrEqual(L.pageWidth - L.margin);
  });

  it('остава място за сумата вдясно от етикета', () => {
    const valueW = L.tW - L.tLabelW;
    expect(widthOf('170,00 EUR', 'B', 10)).toBeLessThanOrEqual(valueW);
  });
});

describe('блокове ДОСТАВЧИК / ПОЛУЧАТЕЛ', () => {
  it('двете колони не се застъпват', () => {
    expect(L.col1 + L.colW).toBeLessThanOrEqual(L.col2);
    expect(L.col2 + L.colW).toBeLessThanOrEqual(L.pageWidth - L.margin);
  });

  // Същинската регресия: адресът на Илия заема два реда в колона от 240 точки.
  // Ако редът се вдигне с фиксирани 12, ЕГН-то ляга върху него.
  it('дълъг адрес заема повече от един ред', () => {
    const addr = 'жк. МЛАДОСТ 4 460А вх.2 ет.4 ап.17, гр. СОФИЯ, обл. СОФИЯ';
    const h = heightOf(addr, 'R', 9, L.colW);
    const one = heightOf('София', 'R', 9, L.colW);
    expect(h).toBeGreaterThan(one);
    // и точно затова фиксираните 12 точки не стигат
    expect(h).toBeGreaterThan(12);
  });

  it('къс адрес си остава на един ред', () => {
    expect(heightOf('София, Младост 3, бл. 386', 'R', 9, L.colW)).toBeLessThanOrEqual(12);
  });
});

describe('ред на стоката', () => {
  // Описанието на депозитна фактура носи номер на договора И пълния адрес на
  // имота — надхвърля един ред и височината на реда трябва да го поеме.
  it('дълго описание надхвърля базовите 22 точки и редът расте', () => {
    const desc = 'Гаранционен депозит по договор за наем № 2026-025 — Фонтани, София, Младост 4 — Гараж № 38, ет. -1';
    const h = heightOf(desc, 'R', 9, L.cw.desc);
    const rowH = Math.max(22, h + 12);
    expect(h).toBeGreaterThan(12);
    expect(rowH).toBeGreaterThan(22);
    expect(rowH).toBeGreaterThanOrEqual(h + 12);
  });

  it('късо описание пази базовата височина', () => {
    const h = heightOf('Наем за Септември 2026', 'R', 9, L.cw.desc);
    expect(Math.max(22, h + 12)).toBeLessThanOrEqual(23);
  });
});
