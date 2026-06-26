// Годишна справка за доходи от наем — за ГДД по чл. 50 ЗДДФЛ, Приложение № 4
// (код 20). За ФИЗИЧЕСКИ ЛИЦА наемодатели. Изчисление (чл. 31 ЗДДФЛ):
//   облагаем доход = брутен наем − 10% нормативно признати разходи
//   данък = облагаем доход × 10% (чл. 48)
// ОРИЕНТИРОВЪЧНО — не е данъчен съвет. Точните редове на формуляра се менят
// годишно; числата (10%/10%) са стабилни. Сверявайте със счетоводител.

const PDFDocument = require('pdfkit');
const path = require('path');

const FONT_R = path.join(__dirname, '../fonts/arial.ttf');
const FONT_B = path.join(__dirname, '../fonts/arialbd.ttf');
const CTRL = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');
const clean = (s, max = 200) => String(s == null ? '' : s).replace(CTRL, ' ').trim().slice(0, max);
const fmt = (n) => Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// rows: [{ address, income, estimate }]; year; declarant (име на физ. лице)
function buildChl50Report({ year, declarant, rows }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      doc.registerFont('R', FONT_R);
      doc.registerFont('B', FONT_B);
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width - 100;
      const gross = rows.reduce((s, r) => s + (Number(r.income) || 0), 0);
      const deductible = gross * 0.10;
      const base = gross - deductible;
      const tax = base * 0.10;

      // Заглавие
      doc.font('B').fontSize(14).fillColor('#111').text('СПРАВКА ЗА ДОХОДИ ОТ НАЕМ', { align: 'center' });
      doc.font('R').fontSize(10).fillColor('#444')
        .text(`за ГДД по чл. 50 ЗДДФЛ · Приложение № 4 (код 20) · ${year} г.`, { align: 'center' }).moveDown(1);

      if (declarant) doc.font('R').fontSize(10).fillColor('#333').text(`Декларатор: ${clean(declarant, 120)}`).moveDown(0.6);

      // Таблица имоти
      const x0 = 50, colAddr = W - 150, colInc = 150;
      doc.font('B').fontSize(9).fillColor('#111');
      let y = doc.y + 4;
      doc.text('Имот', x0, y, { width: colAddr });
      doc.text('Годишен наем (€)', x0 + colAddr, y, { width: colInc, align: 'right' });
      y += 16;
      doc.moveTo(x0, y - 3).lineTo(x0 + W, y - 3).strokeColor('#ccc').stroke();
      doc.font('R').fontSize(9.5).fillColor('#222');
      for (const r of rows) {
        const label = clean(r.address, 90) + (r.estimate ? '  (оценка: наем × 12)' : '');
        const h = doc.heightOfString(label, { width: colAddr });
        doc.text(label, x0, y, { width: colAddr });
        doc.text(fmt(r.income), x0 + colAddr, y, { width: colInc, align: 'right' });
        y += Math.max(h, 13) + 4;
        if (y > doc.page.height - 160) { doc.addPage(); y = 60; }
      }
      doc.moveTo(x0, y).lineTo(x0 + W, y).strokeColor('#ccc').stroke();
      doc.y = y + 10;

      // Изчисление за Приложение 4
      doc.font('B').fontSize(11).fillColor('#111').text('Изчисление за Приложение № 4').moveDown(0.4);
      const kv = (k, v, strong) => {
        const yy = doc.y;
        doc.font(strong ? 'B' : 'R').fontSize(strong ? 11 : 10).fillColor(strong ? '#111' : '#333');
        doc.text(k, 50, yy, { width: W - 130 });
        doc.text(v, 50 + W - 130, yy, { width: 130, align: 'right' });
        doc.moveDown(strong ? 0.5 : 0.35);
      };
      kv('Брутен доход от наем', fmt(gross) + ' €');
      kv('Нормативно признати разходи (10%)', '− ' + fmt(deductible) + ' €');
      kv('Облагаем доход (основа)', fmt(base) + ' €');
      doc.moveDown(0.2);
      kv('Дължим данък върху наема (10%)', fmt(tax) + ' €', true);

      doc.moveDown(1.2);
      doc.font('R').fontSize(8).fillColor('#888').text(
        'Ориентировъчна справка, генерирана от Skyrent. Не представлява данъчен съвет. ' +
        'Облагаемият доход е след 10% нормативно признати разходи (чл. 31 ЗДДФЛ); данъкът е 10% (чл. 48). ' +
        'Авансово внесеният/удържан данък през годината се приспада. Проверете данните и точните редове на формуляра със счетоводител преди подаване.',
        50, doc.y, { width: W, align: 'left' });

      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { buildChl50Report };
