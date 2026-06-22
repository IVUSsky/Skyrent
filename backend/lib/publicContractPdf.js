// Публичен генератор на „Договор за наем на недвижим имот" (БЕЗ login) — SEO
// инструмент. Изгражда стандартен български наемен договор (образец) от полета
// на форма и връща PDF буфер. PDFKit + bundled Cyrillic шрифтове.
//
// ВАЖНО: това е ОБРАЗЕЦ, не правен съвет. Текстът е неутрален boilerplate.

const PDFDocument = require('pdfkit');
const path = require('path');

const FONT_R = path.join(__dirname, '../fonts/arial.ttf');
const FONT_B = path.join(__dirname, '../fonts/arialbd.ttf');

// Премахва контролни символи и ограничава дължината (анти-инжекция в PDF текста).
const CTRL = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');
const clean = (s, max = 200) => String(s == null ? '' : s).replace(CTRL, ' ').trim().slice(0, max);
const fmtMoney = (n) => Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
  if (!d) return '__________';
  const dt = new Date(d);
  if (isNaN(dt)) return clean(d, 20);
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()} г.`;
};

// Изгражда договора → Promise<Buffer>
function buildRentalContract(f) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56 });
      doc.registerFont('R', FONT_R);
      doc.registerFont('B', FONT_B);
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width - 112;
      const llName = clean(f.landlord_name) || '__________';
      const tnName = clean(f.tenant_name) || '__________';
      const rent = Number(f.rent) || 0;
      const deposit = Number(f.deposit) || 0;
      const day = clean(f.payment_day, 4) || '5';
      const city = clean(f.city, 60) || '__________';

      const H = (t) => doc.font('B').fontSize(11).fillColor('#111').text(t, { align: 'left' }).moveDown(0.3);
      const P = (t) => doc.font('R').fontSize(10.5).fillColor('#222').text(t, { align: 'justify', lineGap: 2 }).moveDown(0.5);

      // Заглавие
      doc.font('B').fontSize(15).fillColor('#111').text('ДОГОВОР ЗА НАЕМ', { align: 'center' });
      doc.font('R').fontSize(11).fillColor('#444').text('на недвижим имот', { align: 'center' }).moveDown(1);

      doc.font('R').fontSize(10).fillColor('#555')
        .text(`Днес, ${fmtDate(f.sign_date)}, в гр. ${city}, между:`, { align: 'left' }).moveDown(0.6);

      // Страни
      P(`1. ${llName}${f.landlord_egn ? ', ЕГН/ЕИК ' + clean(f.landlord_egn, 40) : ''}${f.landlord_address ? ', с адрес ' + clean(f.landlord_address) : ''}, наричан по-долу НАЕМОДАТЕЛ, от една страна, и`);
      P(`2. ${tnName}${f.tenant_egn ? ', ЕГН ' + clean(f.tenant_egn, 40) : ''}${f.tenant_address ? ', с адрес ' + clean(f.tenant_address) : ''}, наричан по-долу НАЕМАТЕЛ, от друга страна,`);
      doc.font('R').fontSize(10.5).fillColor('#222').text('се сключи настоящият договор за следното:', { lineGap: 2 }).moveDown(0.8);

      H('Чл. 1. ПРЕДМЕТ');
      P(`НАЕМОДАТЕЛЯТ предоставя на НАЕМАТЕЛЯ за временно възмездно ползване следния недвижим имот: ${clean(f.property_address, 300) || '__________'}${f.property_desc ? ' — ' + clean(f.property_desc, 300) : ''}.`);

      H('Чл. 2. СРОК');
      P(`Договорът се сключва за срок от ${fmtDate(f.date_from)} до ${fmtDate(f.date_to)}. След изтичане на срока договорът може да бъде продължен по взаимно съгласие на страните.`);

      H('Чл. 3. НАЕМНА ЦЕНА И ПЛАЩАНЕ');
      P(`Месечната наемна цена е ${fmtMoney(rent)} евро, платима до ${day}-то число на текущия месец по банков път или в брой срещу разписка.`);

      H('Чл. 4. ДЕПОЗИТ');
      P(`При сключване на договора НАЕМАТЕЛЯТ заплаща депозит в размер на ${fmtMoney(deposit)} евро, който служи като гаранция за изпълнение на задълженията и се връща при прекратяване на договора след приспадане на евентуални дължими суми и щети.`);

      H('Чл. 5. ПРАВА И ЗАДЪЛЖЕНИЯ');
      P('5.1. НАЕМАТЕЛЯТ се задължава да ползва имота с грижата на добър стопанин, да заплаща консумативните разходи (ток, вода, отопление, такси) и да не преотдава имота без писмено съгласие на НАЕМОДАТЕЛЯ.');
      P('5.2. НАЕМОДАТЕЛЯТ се задължава да предаде имота в годно за ползване състояние и да осигури спокойното му ползване за срока на договора.');

      H('Чл. 6. ПРЕКРАТЯВАНЕ');
      P('Договорът се прекратява с изтичане на срока, по взаимно съгласие, или с едномесечно писмено предизвестие от всяка от страните. При съществено неизпълнение изправната страна може да прекрати договора без предизвестие.');

      H('Чл. 7. ДОПЪЛНИТЕЛНИ РАЗПОРЕДБИ');
      P('За неуредените въпроси се прилага действащото българско законодателство (ЗЗД). Договорът се състави и подписа в два еднакви екземпляра — по един за всяка страна.');

      doc.moveDown(1.5);
      const y = doc.y;
      doc.font('R').fontSize(10).fillColor('#222');
      doc.text('НАЕМОДАТЕЛ:', 56, y);
      doc.text('НАЕМАТЕЛ:', 56 + W / 2, y);
      doc.text('_____________________', 56, y + 34);
      doc.text('_____________________', 56 + W / 2, y + 34);
      doc.fontSize(9).fillColor('#666');
      doc.text(llName, 56, y + 48, { width: W / 2 - 20 });
      doc.text(tnName, 56 + W / 2, y + 48, { width: W / 2 - 20 });

      doc.fontSize(8).fillColor('#999')
        .text('Образец, генериран със Skyrent. Не представлява правен съвет — препоръчваме преглед от юрист.',
          56, doc.page.height - 70, { width: W, align: 'center' });

      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { buildRentalContract };
