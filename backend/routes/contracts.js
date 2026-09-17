const express = require('express');
const { orgContext } = require('../db/db');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { ensureTenantUser, sendWelcomeEmail } = require('../lib/tenantOnboarding');
const { generateRentInvoice, generateDepositInvoice, autoInvoiceOnActivateOn } = require('./invoices');
const { parseRecipients } = require('../lib/email');
const { optimizeMany, isDisplayable } = require('../lib/imageOptimize');
const { imagesOnly, safeExt } = require('../lib/uploadFilter');
const { getIssuer, issuerComplete } = require('../lib/branding');
const { kontrolisiContractsOn, sendContractToKontrolisi } = require('../lib/kontrolisiContract');

const FONT_REGULAR = path.join(__dirname, '../fonts/arial.ttf');
const FONT_BOLD    = path.join(__dirname, '../fonts/arialbd.ttf');
// Playfair Display (OFL, с кирилица) — заглавия и номер на документа.
// Визуалната система: Playfair само за заглавия и ключови числа, никога за текст.
const FONT_DISPLAY = path.join(__dirname, '../fonts/PlayfairDisplay.ttf');

// Палитра на визуалната система — ink + брас върху хартия.
const INK    = '#15151E';   // заглавия, основен текст
const BRASS  = '#C9A24B';   // единственият акцент — линии и номер
const MUTED  = '#6E6A60';   // второстепенен текст, английската колона
const HAIR   = '#DCD4C2';   // тънки разделители
const DATA_DIR     = process.env.DATA_DIR || path.join(__dirname, '../data');
const PDF_DIR      = path.join(DATA_DIR, 'contracts');
const LOGO_DIR     = path.join(DATA_DIR, 'logos');
const ID_DIR       = path.join(DATA_DIR, 'id_cards'); // снимки на лични карти (чувствителни!)
const USER_DEFAULT_LOGO = path.join(LOGO_DIR, 'sky_capital_logo.png'); // uploaded via Settings
const BUNDLED_LOGO      = path.join(__dirname, '../lib/sky_capital_logo.png'); // shipped with code
[PDF_DIR, LOGO_DIR, ID_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, file.fieldname === 'logo' ? LOGO_DIR : PDF_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'));
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Отделен multer за снимки на лична карта (по-голям лимит за телефонни снимки)
const idStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ID_DIR),
  filename: (req, file, cb) => {
    // Разширението идва от mimetype (safeExt), не от името на клиента: HEIC се
    // записва още от начало като .jpg и optimizeImage конвертира съдържанието.
    const raw = file.originalname || 'id';
    const base = path.basename(raw, path.extname(raw)).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'id';
    cb(null, `${Date.now()}_${file.fieldname}_${base}${safeExt(file)}`);
  },
});
const idUpload = multer({ storage: idStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imagesOnly });

function fmtDate(d) {
  if (!d) return '..................';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()} г.`;
}

// Вид договор. 'наем' е класическият; 'интернет' е Sky като доставчик на
// интернет за наемател в чужд имот — стои отделно от наемните (собствен списък,
// не пише наем в имота, не пуска наемна фактура, не блокира наемния договор).
const CONTRACT_KINDS = ['наем', 'интернет'];
const contractKind = (v) => CONTRACT_KINDS.includes(v) ? v : 'наем';

function nextContractNumber(db) {
  const year = new Date().getFullYear();
  const key  = `contract_counter_${year}`;
  const row  = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  const next = row ? parseInt(row.value) + 1 : 1;
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key, String(next));
  return `${year}-${String(next).padStart(3,'0')}`;
}

function getSmtp(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='smtp'").get();
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

// Substitute {{PLACEHOLDER}} in template text
function fillTemplate(template, fields) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    return fields[key.trim()] !== undefined ? fields[key.trim()] : `{{${key}}}`;
  });
}

// Официална БГ транслитерация (Закон за транслитерацията) — за EN частта
// на двуезичните договори. Настройките issuer.name_en/address_en/mol_en
// имат превес; това е fallback за всичко без изрична латинска версия.
const TRANSLIT = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
  н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',
  щ:'sht',ъ:'a',ь:'y',ю:'yu',я:'ya',
};
function translit(s) {
  if (!s) return s;
  return String(s).replace(/[а-яА-Я]/g, (ch) => {
    const low = ch.toLowerCase();
    const lat = TRANSLIT[low] || ch;
    if (ch === low) return lat;
    return lat.charAt(0).toUpperCase() + lat.slice(1);
  });
}

// Build field map from contract data
function buildFields(contract, issuer) {
  const isCompany = contract.landlord_type === 'дружество';

  // Landlord composite blocks — BG and EN depending on type.
  // ВАЖНО (multi-tenant): всичко идва от org issuer (Настройки → Данни на
  // издателя) / контракта — НИКАКВИ hardcoded имена (PII leak в чужди org-и).
  const coName = contract.landlord_name || issuer.name || '...';
  const coMol  = issuer.mol || '...';
  const landlordDataBG = isCompany
    ? `${coName}, ЕИК ${contract.landlord_egn || issuer.eik || '...'}, МОЛ: ${coMol}, с адрес ${contract.landlord_address || issuer.address || ''}`
    : `${contract.landlord_name || issuer.name || ''}, ЕГН ${contract.landlord_egn || issuer.eik || ''}, ЛК № ${contract.landlord_lk || '...'}, издадена на ${contract.landlord_lk_date || '...'} год. с адрес ${contract.landlord_address || issuer.address || ''}`;

  // EN версии: изрично зададените issuer.*_en имат превес, иначе транслитерация
  const coNameEN = issuer.name_en    || translit(coName);
  const coMolEN  = issuer.mol_en     || translit(coMol);
  const coAddrEN = issuer.address_en || translit(contract.landlord_address || issuer.address || '');
  const landlordDataEN = isCompany
    ? `${coNameEN}, Company Registration No. ${contract.landlord_egn || issuer.eik || '...'}, Manager: ${coMolEN}, address ${coAddrEN}`
    : `${translit(contract.landlord_name || issuer.name || '')}, Personal Identification No. ${contract.landlord_egn || issuer.eik || ''} Identity Card No. ${contract.landlord_lk || '...'}, issued on ${contract.landlord_lk_date || '...'}, address ${coAddrEN}`;

  const landlordSignBG = isCompany ? `${coName}\nМОЛ: ${coMol}` : (contract.landlord_name || issuer.name || '');
  const landlordSignEN = isCompany ? `${coNameEN}\nManager: ${coMolEN}` : translit(contract.landlord_name || issuer.name || '');

  return {
    'ДОГОВОР_НОМЕР':          contract.contract_number || '',
    'ДАТА_ДНЕС':              fmtDate(contract.created_at || new Date()),
    'ДАТА_НАЧАЛО':            fmtDate(contract.start_date),
    'ДАТА_КРАЙ':              contract.end_date ? fmtDate(contract.end_date) : 'безсрочен / indefinite',
    'ДАТА_ПРЕДАВАНЕ':         fmtDate(contract.delivery_date || contract.start_date),
    'НАЕМОДАТЕЛ_ДАННИ_BG':    landlordDataBG,
    'НАЕМОДАТЕЛ_ДАННИ_EN':    landlordDataEN,
    'НАЕМОДАТЕЛ_ПОДПИС_BG':   landlordSignBG,
    'НАЕМОДАТЕЛ_ПОДПИС_EN':   landlordSignEN,
    'НАЕМОДАТЕЛ_ИМЕ':         contract.landlord_name    || issuer.name    || '',
    'НАЕМОДАТЕЛ_АДРЕС':       contract.landlord_address || issuer.address || '',
    'НАЕМОДАТЕЛ_ЕГН':         contract.landlord_egn     || issuer.eik    || '',
    'НАЕМОДАТЕЛ_ЛК':          contract.landlord_lk      || '',
    'НАЕМОДАТЕЛ_ЛК_ДАТА':     contract.landlord_lk_date || '',
    'НАЕМОДАТЕЛ_ТЕЛЕФОН':     contract.landlord_phone   || '',
    'НАЕМОДАТЕЛ_ИМЕЙЛ':       issuer.email              || '',
    'НАЕМОДАТЕЛ_МОЛ':         issuer.mol                || '',
    'НАЕМОДАТЕЛ_IBAN':        issuer.iban               || '',
    'НАЕМАТЕЛ_ИМЕ':           contract.tenant_name      || '',
    'НАЕМАТЕЛ_АДРЕС':         contract.tenant_address   || '',
    'НАЕМАТЕЛ_ЕГН':           contract.tenant_egn       || '',
    'НАЕМАТЕЛ_МОЛ':           contract.tenant_mol       || '',
    'НАЕМАТЕЛ_ДОКУМЕНТ':      contract.tenant_doc       || '',
    'НАЕМАТЕЛ_ДОКУМЕНТ_ДАТА': contract.tenant_doc_date  || '',
    'НАЕМАТЕЛ_ДОКУМЕНТ_СТРАНА': contract.tenant_doc_country || '',
    'НАЕМАТЕЛ_РОДЕН':         contract.tenant_dob       || '',
    'НАЕМАТЕЛ_ТЕЛЕФОН':       contract.tenant_phone     || '',
    'НАЕМАТЕЛ_ИМЕЙЛ':         contract.tenant_email     || '',
    'АБОНАТ_ТОК':             contract.абонат_ток  || '..................',
    'АБОНАТ_ВОДА':            contract.абонат_вода || '..................',
    'АБОНАТ_ТЕЦ':             contract.абонат_тец  || '..................',
    'АБОНАТ_ВХОД':            contract.абонат_вход || '..................',
    'ИМОТ_АДРЕС':             contract.property_address     || '',
    'ИМОТ_ОПИСАНИЕ':          contract.property_description || '',
    'ИМОТ_ПЛОЩ':              contract.property_area ? `${contract.property_area} кв.м.` : '',
    'НАЕМ':                   Number(contract.monthly_rent || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    'ВАЛУТА':                 contract.currency || 'EUR',
    'ВАЛУТА_EN':              contract.currency || 'EUR',
    'НАЕМ_ДУМИ':              amountToWords(contract.monthly_rent),
    'ДЕПОЗИТ':                Number(contract.deposit || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    'ДЕПОЗИТ_ДУМИ':           amountToWords(contract.deposit),
    'ПАДЕЖ_ДЕН':              String(contract.payment_day || 5),
    'УСЛОВИЯ':                contract.conditions || '',
    'БЕЛЕЖКИ':                contract.notes || '',
    // ─── Payment method (cash vs bank transfer) ────────────────────
    'НАЧИН_ПЛАЩАНЕ':          contract.payment_method === 'в брой'
                                ? 'в брой'
                                : (contract.payment_method === 'карта (Stripe)' ? 'с картово плащане през онлайн портала' : `по банков път на IBAN: ${issuer.iban || ''}`),
    // ─── Срок в месеци ─────────────────────────────────────────────
    'СРОК_МЕСЕЦИ':            (() => {
      if (!contract.start_date || !contract.end_date) return '12';
      const s = new Date(contract.start_date), e = new Date(contract.end_date);
      const m = Math.max(1, Math.round((e - s) / (1000*60*60*24*30.44)));
      return String(m);
    })(),
    'СРОК_МЕСЕЦИ_ДУМИ':       (() => {
      if (!contract.start_date || !contract.end_date) return 'дванадесет';
      const s = new Date(contract.start_date), e = new Date(contract.end_date);
      const m = Math.max(1, Math.round((e - s) / (1000*60*60*24*30.44)));
      return amountToWords(m);
    })(),
    // ─── Pro-rata за частичен първи месец ──────────────────────────
    'ПРОПОРЦИОНАЛЕН_НАЕМ':    contract.pro_rata_amount
                                ? Number(contract.pro_rata_amount).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : '',
    'ПРОПОРЦИОНАЛЕН_НАЕМ_ДУМИ': contract.pro_rata_amount ? amountToWords(contract.pro_rata_amount) : '',
    'ПРОПОРЦИОНАЛЕН_ДО':      contract.pro_rata_end_date ? fmtDate(contract.pro_rata_end_date) : '',
    // ─── Протокол fields ───────────────────────────────────────────
    'БРОЙ_КЛЮЧОВЕ_ВРАТА':     String(contract.keys_door || 1),
    'БРОЙ_КЛЮЧОВЕ_ЧИП':       String(contract.keys_chip || 1),
    'СЪСТОЯНИЕ_ИМОТА':        contract.property_state || 'След направен ремонт с напълно изправни и функциониращи уреди',
    'ИНВЕНТАР':               contract.inventory || '',
  };
}

// Simple number-to-words for BGN/EUR amounts (basic)
function amountToWords(n) {
  if (!n) return 'нула';
  const num = Math.round(Number(n));
  const ones = ['','един','два','три','четири','пет','шест','седем','осем','девет',
                 'десет','единадесет','дванадесет','тринадесет','четиринадесет','петнадесет',
                 'шестнадесет','седемнадесет','осемнадесет','деветнадесет'];
  const tens = ['','','двадесет','тридесет','четиридесет','петдесет','шестдесет','седемдесет','осемдесет','деветдесет'];
  if (num < 20) return ones[num];
  if (num < 100) return tens[Math.floor(num/10)] + (num%10 ? ' и ' + ones[num%10] : '');
  if (num < 1000) {
    const h = Math.floor(num/100);
    const rest = num % 100;
    return (h === 1 ? 'сто' : h === 2 ? 'двеста' : ones[h] + 'ста') + (rest ? ' ' + amountToWords(rest) : '');
  }
  return String(num);
}

// Generate PDF from template text
// opts.appendProtocol — append the bundled handover protocol after signatures (default true for contracts)
// opts.includeSignatures — render the two-column signature block at the bottom (default true)
// opts.filenamePrefix — file prefix (default "contract"; use "protocol" for standalone)
// opts.appendInventory — append the property inventory list (grouped by category) (default false; true for protocols)
// opts.inventory — pre-fetched property_inventory items (with photos array per item)
function generateContractPDF(contract, template, issuer, photos = [], opts = {}) {
  const appendProtocol     = opts.appendProtocol     !== false;
  const includeSignatures  = opts.includeSignatures  !== false;
  const filenamePrefix     = opts.filenamePrefix     || 'contract';
  const appendInventory    = opts.appendInventory    === true;
  const inventoryItems     = opts.inventory          || [];
  return new Promise((resolve, reject) => {
    const filename = `${filenamePrefix}_${contract.contract_number.replace(/[^a-zA-Z0-9]/g,'-')}.pdf`;
    const filepath = path.join(PDF_DIR, filename);

    const fields  = buildFields(contract, issuer);
    const filled  = fillTemplate(template.content, fields);
    const lines   = filled.split('\n');

    const ML = 50;
    const MR = 50;
    const HEADER_H = 100; // height reserved for letterhead
    const FOOTER_H = 45;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: HEADER_H, bottom: FOOTER_H + 10, left: ML, right: MR },
      autoFirstPage: true,
      bufferPages: false
    });
    const ws  = fs.createWriteStream(filepath);
    doc.pipe(ws);
    doc.registerFont('R', FONT_REGULAR);
    doc.registerFont('B', FONT_BOLD);
    try { doc.registerFont('D', FONT_DISPLAY); } catch (_) { /* липсва → пада на B */ }

    const PW = doc.page.width - ML - MR;       // printable width
    const PH = doc.page.height;

    // Resolve logo: template-specific upload → admin-uploaded default → bundled
    const resolvedLogo = (() => {
      if (template.logo_path) {
        const p = path.join(LOGO_DIR, template.logo_path);
        if (fs.existsSync(p)) return p;
      }
      if (fs.existsSync(USER_DEFAULT_LOGO)) return USER_DEFAULT_LOGO;
      if (fs.existsSync(BUNDLED_LOGO))      return BUNDLED_LOGO;
      return null;
    })();

    let pageNum = 0;
    let inHeader = false;

    // Draw letterhead header on every page (pure absolute positioning, no flow)
    function drawPageHeader() {
      if (inHeader) return;
      inHeader = true;
      pageNum++;
      const W = doc.page.width;

      // Logo — left
      if (resolvedLogo) {
        try { doc.image(resolvedLogo, ML, 8, { height: 68, fit: [175, 68] }); } catch(_) {}
      }

      // Company info — right (each line at fixed y, no flow)
      const infoX = W - MR - 210;
      const infoW = 210;
      const infoRows = [
        { text: issuer.name || '', bold: true,  y: 12 },
        issuer.eik     ? { text: `ЕИК: ${issuer.eik}`,    bold: false, y: 24 } : null,
        issuer.address ? { text: issuer.address,           bold: false, y: 35 } : null,
        issuer.email   ? { text: issuer.email,             bold: false, y: 46 } : null,
        issuer.iban    ? { text: `IBAN: ${issuer.iban}`,   bold: false, y: 57 } : null,
      ].filter(Boolean);

      infoRows.forEach(({ text, bold, y }) => {
        doc.save();
        doc.font(bold ? 'B' : 'R').fontSize(bold ? 8 : 7).fillColor(bold ? INK : MUTED);
        // Clip to prevent overflow into logo area
        doc.rect(infoX, y, infoW, 12).clip();
        doc.text(text, infoX, y, { width: infoW, align: 'right', lineBreak: false });
        doc.restore();
      });

      // Разделител: тънка линия на цялата ширина + къс брас акцент отляво.
      // Визуалната система: брасът е за акцент, никога за големи площи.
      doc.moveTo(ML, 82).lineTo(W - MR, 82).lineWidth(0.6).strokeColor(HAIR).stroke();
      doc.moveTo(ML, 82).lineTo(ML + 46, 82).lineWidth(1.6).strokeColor(BRASS).stroke();

      // Footer — draw in bottom margin area, temporarily disable bottom margin check
      const fy = PH - 32;
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.moveTo(ML, fy).lineTo(W - MR, fy).lineWidth(0.4).strokeColor(HAIR).stroke();
      doc.font('R').fontSize(7).fillColor(MUTED);
      doc.text(issuer.name || '', ML, fy + 6, { width: PW / 2, lineBreak: false });
      doc.text(`с. ${pageNum}`, ML, fy + 6, { width: PW, align: 'right', lineBreak: false });
      doc.page.margins.bottom = savedBottom;

      // Force cursor to content start — both x AND y
      doc.y = HEADER_H;
      doc.x = ML;
      inHeader = false;
    }

    // Call drawPageHeader on every page (including PDFKit auto-created pages)
    doc.on('pageAdded', () => { drawPageHeader(); });

    // First page header (autoFirstPage created it before we registered the event)
    drawPageHeader();

    // Render one template line — always passes explicit x so cursor never drifts
    function renderLine(line) {
      const cy = doc.y; // capture y before rendering

      if (line.startsWith('###')) {
        doc.font('B').fontSize(9).fillColor(MUTED)
           .text(line.replace(/^#+\s*/, ''), ML, cy, { width: PW });
        doc.moveDown(0.3);

      } else if (line.startsWith('##')) {
        // Раздел: късо брас правило над заглавието, без цветна линия отдолу.
        doc.moveDown(0.55);
        const y0 = doc.y;
        doc.moveTo(ML, y0).lineTo(ML + 22, y0).lineWidth(1.4).strokeColor(BRASS).stroke();
        doc.font('D').fontSize(12).fillColor(INK)
           .text(line.replace(/^#+\s*/, ''), ML, y0 + 6, { width: PW });
        doc.moveDown(0.45);

      } else if (line.startsWith('#')) {
        // Заглавие на документа — Playfair, центрирано, с тънки правила
        doc.moveDown(0.5);
        doc.font('D').fontSize(19).fillColor(INK)
           .text(line.replace(/^#+\s*/, ''), ML, doc.y, { width: PW, align: 'center' });
        const y1 = doc.y + 7;
        doc.moveTo(ML + PW / 2 - 26, y1).lineTo(ML + PW / 2 + 26, y1)
           .lineWidth(1.2).strokeColor(BRASS).stroke();
        doc.moveDown(0.8);

      } else if (line === '' || line === '---') {
        doc.moveDown(0.25);

      } else if (line.includes(' ||| ')) {
        // Двуколонен ред „BG ||| EN" — успоредни колони като в оригиналните
        // двуезични договори. Bold при **...** или ред, започващ с Чл./Art.
        const [bgRaw, enRaw] = line.split(' ||| ');
        const bg = bgRaw.replace(/\*\*/g, '');
        const en = (enRaw || '').replace(/\*\*/g, '');
        const gap = 14;
        const colWd = (PW - gap) / 2;
        // `**ред**` = целият ред е удебелен (заглавия на страни, подписи).
        // Ред „Чл. N. ..." = удебелен е САМО номерът — иначе цялата клауза е bold.
        const isStarBold = bgRaw.startsWith('**');
        const isBold = isStarBold;
        // Българската колона носи документа, английската е превод — затова е в
        // по-тих цвят. Досега и двете бяха еднакво удебелени и страницата
        // изглеждаше като плътен блок без йерархия.
        // Удебелен е само номерът на члена, както в едноколонния режим — цяла
        // клауза в bold прави страницата плътен блок без йерархия.
        const ART = /^((?:Чл\.|Art\.)\s*[\d.]+[.)]?)\s*(.*)$/s;
        const drawCol = (txt, x, y, colour) => {
          const m = !isBold && ART.exec(txt);
          if (m) {
            doc.font('B').fontSize(9).fillColor(colour).text(m[1] + ' ', x, y, { width: colWd, continued: !!m[2] });
            if (m[2]) doc.font('R').fillColor(colour).text(m[2], { width: colWd });
          } else {
            doc.font(isBold ? 'B' : 'R').fontSize(9).fillColor(colour).text(txt, x, y, { width: colWd });
          }
        };
        doc.font(isBold ? 'B' : 'R').fontSize(9);
        const h = Math.max(doc.heightOfString(bg, { width: colWd }), doc.heightOfString(en, { width: colWd }));
        let y0 = cy;
        if (y0 + h > PH - FOOTER_H - 20) { doc.addPage(); y0 = doc.y; }
        drawCol(bg, ML, y0, INK);
        drawCol(en, ML + colWd + gap, y0, MUTED);
        // Тънка вертикална нишка между езиците — държи колоните разделени
        doc.moveTo(ML + colWd + gap / 2, y0).lineTo(ML + colWd + gap / 2, y0 + h)
           .lineWidth(0.4).strokeColor(HAIR).stroke();
        doc.y = y0 + h;
        doc.moveDown(0.3);

      } else if (line.startsWith('**') && line.endsWith('**')) {
        doc.font('B').fontSize(10).fillColor(INK)
           .text(line.replace(/\*\*/g, ''), ML, cy, { width: PW });
        doc.moveDown(0.25);

      } else {
        // Ред с удебелен НАЧАЛЕН етикет: `**НАЕМОДАТЕЛ / LANDLORD:** Скай ...`
        // Старият код чистеше ** само в началото и края на реда, затова
        // затварящите маркери в средата излизаха на хартия като „LANDLORD:**".
        const m = line.match(/^\*\*(.+?)\*\*\s*(.*)$/);
        if (m) {
          const [, label, rest] = m;
          doc.font('B').fontSize(9.5).fillColor(INK)
             .text(label + ' ', ML, cy, { width: PW, continued: !!rest });
          if (rest) doc.font('R').fillColor(INK).text(rest.replace(/\*\*/g, ''), { width: PW });
          doc.moveDown(0.2);
        } else {
          // Всички останали редове. Чистим ВСИЧКИ ** — маркер, останал в текста,
          // е дефект, който клиентът вижда на подписания документ.
          const clean = line.replace(/\*\*/g, '');

          // Само НОМЕРЪТ на члена е удебелен, не целият текст. Досега цялата
          // клауза беше bold и страницата излизаше като плътен черен блок без
          // йерархия — точно затова договорът се четеше тежко.
          const art = clean.match(/^((?:Чл\.|Art\.)\s*\d+[.)]?)\s*(.*)$/s);
          // Английският превод е второстепенен спрямо българския оригинал.
          const isEn = /^Art\./.test(clean) || (!/[Ѐ-ӿ]/.test(clean) && /[A-Za-z]{4}/.test(clean));
          const body = isEn ? MUTED : '#2B2B33';

          doc.fontSize(9.5);
          if (art) {
            doc.font('B').fillColor(isEn ? MUTED : INK)
               .text(art[1] + ' ', ML, cy, { width: PW, continued: !!art[2] });
            if (art[2]) doc.font('R').fillColor(body).text(art[2], { width: PW });
          } else {
            doc.font('R').fillColor(body).text(clean, ML, cy, { width: PW, align: 'left' });
          }
          doc.moveDown(0.22);
        }
      }
    }

    // Render all lines (collapse consecutive empty lines)
    let prevEmpty = false;
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const isEmpty = line === '' || line === '---';
      if (isEmpty && prevEmpty) continue; // skip consecutive empty lines
      prevEmpty = isEmpty;
      // Page break check before rendering (widow prevention)
      // drawPageHeader is called automatically via pageAdded event
      if (doc.y > PH - FOOTER_H - 50) {
        doc.addPage();
      }
      renderLine(line);
    }

    // Signature block (optional)
    if (includeSignatures) {
      doc.moveDown(2);
      if (doc.y > PH - FOOTER_H - 80) { doc.addPage(); }
      const sigY = doc.y;
      const col  = PW / 2 - 15;

      doc.font('B').fontSize(9).fillColor('#111827')
         .text('НАЕМОДАТЕЛ:', ML, sigY, { width: col, lineBreak: false });
      doc.font('B').fontSize(9).fillColor('#111827')
         .text('НАЕМАТЕЛ:', ML + PW / 2, sigY, { width: col, lineBreak: false });

      const lineY = sigY + 45;
      doc.moveTo(ML,           lineY).lineTo(ML + col,       lineY).lineWidth(0.7).strokeColor('#374151').stroke();
      doc.moveTo(ML + PW / 2, lineY).lineTo(ML + PW,         lineY).lineWidth(0.7).strokeColor('#374151').stroke();

      doc.font('R').fontSize(8).fillColor('#6b7280')
         .text(contract.landlord_name || issuer.name || '', ML, lineY + 5, { width: col, align: 'center', lineBreak: false });
      doc.font('R').fontSize(8).fillColor('#6b7280')
         .text(contract.tenant_name || '', ML + PW / 2, lineY + 5, { width: col, align: 'center', lineBreak: false });
    }

    // ── Inventory + photos (auto-appended for protocol PDFs) ──────
    if (appendInventory) {
      appendInventoryAndPhotos(doc, inventoryItems, photos, ML, PW, HEADER_H, PH, FOOTER_H);
    }

    // ── Appendix: Приемо-предавателен протокол (опционално) ─────
    if (appendProtocol) {
      appendHandoverProtocol(doc, contract, issuer, photos, ML, MR, PW, HEADER_H);
    }

    doc.end();
    ws.on('finish', () => resolve({ filepath, filename }));
    ws.on('error', reject);
  });
}

const PHOTOS_DIR    = path.join(DATA_DIR, 'property_photos');
const INVENTORY_DIR = path.join(DATA_DIR, 'inventory_files');

const CAT_LABELS = {
  'мебели':       '🛋️ Мебели',
  'бяла техника': '🧊 Бяла техника',
  'малки уреди':  '☕ Малки уреди',
  'вик':          '🚿 ВиК',
  'електро':      '⚡ Електро',
  'друго':        '📦 Друго',
};

function fmtItemDate(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  } catch { return s; }
}

// Append the property inventory list (grouped by category, with thumbnails)
// and the property photos grid to the current PDF document. Used by the
// standalone protocol generator. Sky logo header is drawn automatically via
// the pageAdded listener registered by generateContractPDF.
function appendInventoryAndPhotos(doc, inventory, photos, ML, PW, HEADER_H, PH, FOOTER_H) {
  // Always start the inventory section on a fresh page so layout is predictable
  if (inventory && inventory.length > 0) {
    doc.addPage();
    let y = HEADER_H + 10;

    doc.font('B').fontSize(13).fillColor('#0e3d52')
       .text('ОПИС НА ОБЗАВЕЖДАНЕТО', ML, y, { width: PW, align: 'center' });
    y += 20;
    doc.moveTo(ML, y).lineTo(ML + PW, y).lineWidth(0.5).strokeColor('#4AABCC').stroke();
    y += 12;

    // Group items by category preserving the canonical order
    const order = Object.keys(CAT_LABELS);
    const seen = new Set();
    const groups = [];
    for (const cat of order) {
      const items = inventory.filter(i => i.category === cat);
      if (items.length > 0) {
        groups.push({ category: cat, items });
        seen.add(cat);
      }
    }
    // Fallback: any items with categories not in our list go under "Друго"
    const orphan = inventory.filter(i => !seen.has(i.category));
    if (orphan.length > 0) groups.push({ category: 'друго', items: orphan });

    for (const group of groups) {
      // Section header
      if (y > PH - FOOTER_H - 60) { doc.addPage(); y = HEADER_H + 10; }
      doc.font('B').fontSize(10.5).fillColor('#374151')
         .text(CAT_LABELS[group.category] || group.category, ML, y, { width: PW });
      y = doc.y + 4;
      doc.moveTo(ML, y).lineTo(ML + PW, y).lineWidth(0.3).strokeColor('#d1d5db').stroke();
      y += 6;

      for (const item of group.items) {
        const rowH = 56;
        if (y > PH - FOOTER_H - rowH - 10) { doc.addPage(); y = HEADER_H + 10; }

        // Thumbnail (first photo if any)
        const firstPhoto = (item.photos || []).find(f => f.type === 'photo');
        const thumbX = ML;
        const thumbW = 56;
        const thumbH = 48;
        if (firstPhoto) {
          const fp = path.join(INVENTORY_DIR, firstPhoto.filename);
          if (fs.existsSync(fp)) {
            try { doc.image(fp, thumbX, y, { fit: [thumbW, thumbH] }); } catch(_) {}
          }
        } else {
          doc.rect(thumbX, y, thumbW, thumbH).lineWidth(0.3).strokeColor('#e5e7eb').stroke();
          doc.font('R').fontSize(7).fillColor('#9ca3af')
             .text('без снимка', thumbX, y + thumbH/2 - 4, { width: thumbW, align: 'center', lineBreak: false });
        }

        // Item details to the right
        const textX = thumbX + thumbW + 10;
        const textW = PW - thumbW - 10;
        doc.font('B').fontSize(10).fillColor('#111827')
           .text(item.name, textX, y, { width: textW, lineBreak: false });

        const subParts = [];
        if (item.brand)         subParts.push(item.brand);
        if (item.model)         subParts.push(item.model);
        if (item.serial_number) subParts.push(`S/N: ${item.serial_number}`);
        doc.font('R').fontSize(8.5).fillColor('#6b7280')
           .text(subParts.join(' · ') || '—', textX, y + 13, { width: textW, lineBreak: false });

        const dateParts = [];
        if (item.purchase_date) dateParts.push(`Купено: ${fmtItemDate(item.purchase_date)}`);
        if (item.warranty_end)  dateParts.push(`🛡️ Гаранция до: ${fmtItemDate(item.warranty_end)}`);
        if (item.purchase_price) dateParts.push(`${Number(item.purchase_price).toFixed(2)} EUR`);
        if (dateParts.length) {
          doc.font('R').fontSize(8).fillColor('#9ca3af')
             .text(dateParts.join(' · '), textX, y + 26, { width: textW, lineBreak: false });
        }
        if (item.notes) {
          doc.font('R').fontSize(8).fillColor('#4b5563')
             .text(item.notes, textX, y + 38, { width: textW, lineBreak: false, ellipsis: true });
        }

        y += rowH;
        doc.moveTo(ML, y - 2).lineTo(ML + PW, y - 2).lineWidth(0.2).strokeColor('#f3f4f6').stroke();
      }
      y += 8;
    }

    // Inventory summary
    if (y > PH - FOOTER_H - 30) { doc.addPage(); y = HEADER_H + 10; }
    doc.font('R').fontSize(8).fillColor('#374151')
       .text(`Общо артикули: ${inventory.length}`, ML, y, { width: PW });
    y += 14;
    doc.font('R').fontSize(7.5).fillColor('#6b7280')
       .text(
         'С полагането на подписите страните декларират, че всички артикули са в добро състояние и без видими забележки, освен описаните по-горе.',
         ML, y, { width: PW, align: 'justify' }
       );
  }

  // Property photos grid
  if (photos && photos.length > 0) {
    doc.addPage();
    let y = HEADER_H + 10;

    doc.font('B').fontSize(13).fillColor('#0e3d52')
       .text('СНИМКОВ МАТЕРИАЛ НА ИМОТА', ML, y, { width: PW, align: 'center' });
    y += 20;
    doc.moveTo(ML, y).lineTo(ML + PW, y).lineWidth(0.5).strokeColor('#4AABCC').stroke();
    y += 12;

    const IMG_W = (PW - 10) / 2;
    const IMG_H = IMG_W * 0.67;
    let col = 0;

    for (const photo of photos) {
      const fp = path.join(PHOTOS_DIR, photo.filename);
      if (!fs.existsSync(fp)) continue;
      if (col === 0 && y + IMG_H > PH - FOOTER_H - 10) { doc.addPage(); y = HEADER_H + 10; }
      const x = ML + col * (IMG_W + 10);
      try { doc.image(fp, x, y, { fit: [IMG_W, IMG_H] }); } catch(_) {}
      col++;
      if (col === 2) { col = 0; y += IMG_H + 10; }
    }
  }
}

function appendHandoverProtocol(doc, contract, issuer, photos, ML, MR, PW, HEADER_H) {
  doc.addPage();
  // drawPageHeader is called automatically via doc.on('pageAdded') event

  let y = HEADER_H + 10;

  // Title
  doc.font('B').fontSize(13).fillColor('#111827')
     .text('ПРИЕМО-ПРЕДАВАТЕЛЕН ПРОТОКОЛ', ML, y, { width: PW, align: 'center' });
  y += 18;
  doc.font('R').fontSize(9).fillColor('#4b5563')
     .text('HANDOVER PROTOCOL', ML, y, { width: PW, align: 'center' });
  y += 20;

  // Divider
  doc.moveTo(ML, y).lineTo(ML + PW, y).lineWidth(0.5).strokeColor('#d1d5db').stroke();
  y += 12;

  // Contract reference
  doc.font('B').fontSize(9).fillColor('#111827')
     .text(`Неразделна част от Договор за наем № ${contract.contract_number}`, ML, y, { width: PW });
  y += 14;
  doc.font('R').fontSize(8.5).fillColor('#374151')
     .text(`Integral part of Lease Agreement No. ${contract.contract_number}`, ML, y, { width: PW });
  y += 18;

  // Details table
  const details = [
    ['Имот / Property:', contract.property_address || ''],
    ['Дата на предаване / Handover date:', contract.delivery_date ? fmtDate(contract.delivery_date) : fmtDate(contract.start_date)],
    ['Наемодател / Landlord:', contract.landlord_name || issuer.name || ''],
    ['Наемател / Tenant:', contract.tenant_name || ''],
  ];

  if (contract.абонат_ток || contract.абонат_вода || contract.абонат_тец || contract.абонат_вход) {
    details.push(['─── Абонатни номера / Subscriber numbers ───', '']);
    if (contract.абонат_ток)  details.push(['  ⚡ Ток / Electricity:', contract.абонат_ток]);
    if (contract.абонат_вода) details.push(['  💧 Вода / Water:', contract.абонат_вода]);
    if (contract.абонат_тец)  details.push(['  🔥 ТЕЦ / District heating:', contract.абонат_тец]);
    if (contract.абонат_вход) details.push(['  🏢 Входна такса / Building fee:', contract.абонат_вход]);
  }

  details.forEach(([label, value]) => {
    if (y > doc.page.height - 120) { doc.addPage(); y = HEADER_H + 10; }
    if (!value) {
      doc.font('B').fontSize(8).fillColor('#6b7280').text(label, ML, y, { width: PW });
      y += 13;
      return;
    }
    doc.font('B').fontSize(8.5).fillColor('#374151').text(label, ML, y, { width: 180, lineBreak: false });
    doc.font('R').fontSize(8.5).fillColor('#111827').text(value, ML + 185, y, { width: PW - 185 });
    y = doc.y + 3;
  });

  y += 8;
  doc.moveTo(ML, y).lineTo(ML + PW, y).lineWidth(0.3).strokeColor('#e5e7eb').stroke();
  y += 14;

  // Photos section
  if (photos && photos.length > 0) {
    doc.font('B').fontSize(10).fillColor('#111827').text('Снимки на имота / Property photos', ML, y, { width: PW });
    y += 16;

    const IMG_W = (PW - 10) / 2;
    const IMG_H = IMG_W * 0.67;
    let col = 0;

    for (const photo of photos) {
      const fp = path.join(PHOTOS_DIR, photo.filename);
      if (!fs.existsSync(fp)) continue;

      if (y + IMG_H + 30 > doc.page.height - 60) {
        doc.addPage();
        y = HEADER_H + 10;
        col = 0;
      }

      const x = col === 0 ? ML : ML + IMG_W + 10;
      try {
        doc.image(fp, x, y, { width: IMG_W, height: IMG_H, fit: [IMG_W, IMG_H] });
        doc.rect(x, y, IMG_W, IMG_H).lineWidth(0.3).strokeColor('#d1d5db').stroke();
        if (photo.caption) {
          doc.font('R').fontSize(7).fillColor('#6b7280')
             .text(photo.caption, x, y + IMG_H + 2, { width: IMG_W, align: 'center' });
        }
      } catch(_) {}

      col++;
      if (col === 2) { col = 0; y += IMG_H + (photo.caption ? 18 : 10); }
    }
    if (col === 1) y += IMG_H + 10;
    y += 20;
  } else {
    doc.font('R').fontSize(8.5).fillColor('#9ca3af')
       .text('(Снимките се прилагат като отделно приложение / Photos attached separately)', ML, y, { width: PW, align: 'center' });
    y += 30;
  }

  // Signature block
  if (y + 80 > doc.page.height - 60) { doc.addPage(); y = HEADER_H + 10; }
  y += 10;
  doc.moveTo(ML, y).lineTo(ML + PW, y).lineWidth(0.3).strokeColor('#e5e7eb').stroke();
  y += 15;

  doc.font('R').fontSize(8.5).fillColor('#374151')
     .text('Имотът е предаден в описаното по-горе състояние. Страните нямат взаимни претенции.', ML, y, { width: PW });
  y += 10;
  doc.font('R').fontSize(8).fillColor('#6b7280')
     .text('The property has been handed over in the condition described above. The parties have no mutual claims.', ML, y, { width: PW });
  y += 22;

  const sigY = y;
  const col2 = PW / 2 - 15;
  doc.font('B').fontSize(8.5).fillColor('#111827')
     .text('НАЕМОДАТЕЛ / LANDLORD:', ML, sigY, { width: col2, lineBreak: false });
  doc.font('B').fontSize(8.5).fillColor('#111827')
     .text('НАЕМАТЕЛ / TENANT:', ML + PW / 2, sigY, { width: col2, lineBreak: false });
  const lineY2 = sigY + 40;
  doc.moveTo(ML,           lineY2).lineTo(ML + col2,       lineY2).lineWidth(0.7).strokeColor('#374151').stroke();
  doc.moveTo(ML + PW / 2, lineY2).lineTo(ML + PW,          lineY2).lineWidth(0.7).strokeColor('#374151').stroke();
  doc.font('R').fontSize(7.5).fillColor('#6b7280')
     .text(contract.landlord_name || issuer.name || '', ML, lineY2 + 4, { width: col2, align: 'center', lineBreak: false });
  doc.font('R').fontSize(7.5).fillColor('#6b7280')
     .text(contract.tenant_name || '', ML + PW / 2, lineY2 + 4, { width: col2, align: 'center', lineBreak: false });
}

// Generate Annex PDF
function generateAnnexPDF(annex, contract, issuer) {
  return new Promise((resolve, reject) => {
    const filename = `annex_${annex.annex_number.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
    const filepath = path.join(PDF_DIR, filename);
    // Архивираните договори нямат номер → Д<id> (иначе в PDF-а излиза "null")
    const cno = contract.contract_number || ('Д' + (contract.id || ''));

    const ML = 50, MR = 50;
    const HEADER_H = 100, FOOTER_H = 45;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: HEADER_H, bottom: FOOTER_H + 10, left: ML, right: MR },
      autoFirstPage: true,
    });
    const ws = fs.createWriteStream(filepath);
    doc.pipe(ws);
    doc.registerFont('R', FONT_REGULAR);
    doc.registerFont('B', FONT_BOLD);
    try { doc.registerFont('D', FONT_DISPLAY); } catch (_) { /* липсва → пада на B */ }

    const PW = doc.page.width - ML - MR;
    const PH = doc.page.height;

    // Resolve logo — както при договора: качено от Settings, иначе вграденото
    const resolvedLogo = (() => {
      if (fs.existsSync(USER_DEFAULT_LOGO)) return USER_DEFAULT_LOGO;
      if (fs.existsSync(BUNDLED_LOGO))      return BUNDLED_LOGO;
      return null;
    })();

    let pageNum = 0;
    let inHeader = false;
    function drawHeader() {
      if (inHeader) return;
      inHeader = true;
      pageNum++;
      const W = doc.page.width;
      if (resolvedLogo) { try { doc.image(resolvedLogo, ML, 8, { height: 68, fit: [175, 68] }); } catch(_) {} }
      const infoX = W - MR - 210;
      [
        { text: issuer.name || '', bold: true,  y: 12 },
        issuer.eik     ? { text: `ЕИК: ${issuer.eik}`,  bold: false, y: 24 } : null,
        issuer.address ? { text: issuer.address,         bold: false, y: 35 } : null,
        issuer.iban    ? { text: `IBAN: ${issuer.iban}`, bold: false, y: 57 } : null,
      ].filter(Boolean).forEach(({ text, bold, y }) => {
        doc.save();
        doc.font(bold ? 'B' : 'R').fontSize(bold ? 8 : 7).fillColor(bold ? '#111827' : '#4b5563');
        doc.rect(infoX, y, 210, 12).clip();
        doc.text(text, infoX, y, { width: 210, align: 'right', lineBreak: false });
        doc.restore();
      });
      doc.moveTo(ML, 82).lineTo(W - MR, 82).lineWidth(2).strokeColor('#4AABCC').stroke();
      const fy = PH - 32;
      const saved = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.moveTo(ML, fy).lineTo(W - MR, fy).lineWidth(0.4).strokeColor(HAIR).stroke();
      doc.font('R').fontSize(7).fillColor(MUTED);
      doc.text(issuer.name || '', ML, fy + 6, { width: PW / 2, lineBreak: false });
      doc.text(`с. ${pageNum}`, ML, fy + 6, { width: PW, align: 'right', lineBreak: false });
      doc.page.margins.bottom = saved;
      doc.y = HEADER_H; doc.x = ML;
      inHeader = false;
    }
    doc.on('pageAdded', () => drawHeader());
    drawHeader();

    let y = HEADER_H + 10;

    // Title
    doc.font('B').fontSize(14).fillColor('#0e3d52')
       .text('АНЕКС КЪМ ДОГОВОР ЗА НАЕМ', ML, y, { width: PW, align: 'center' });
    y += 20;
    doc.font('B').fontSize(11).fillColor('#374151')
       .text(`№ ${annex.annex_number}`, ML, y, { width: PW, align: 'center' });
    y += 8;
    doc.font('R').fontSize(9).fillColor('#6b7280')
       .text(`ANNEX TO LEASE AGREEMENT No. ${cno}`, ML, y, { width: PW, align: 'center' });
    y += 18;
    doc.moveTo(ML, y).lineTo(ML + PW, y).lineWidth(0.5).strokeColor('#d1d5db').stroke();
    y += 14;

    // Preamble
    doc.font('R').fontSize(9.5).fillColor('#111827')
       .text(`Днес, ${fmtDate(annex.annex_date)}, в гр. София, между долуподписаните страни:`, ML, y, { width: PW });
    y = doc.y + 12;

    // Parties block. Архивираните (качени) договори получават DEFAULT
    // landlord_type='физическо' и нямат landlord_name → ако няма изрично
    // въведен наемодател-физлице и issuer-ът е фирма (има ЕИК) → дружество.
    const isCompany = contract.landlord_type === 'дружество'
      || (!contract.landlord_name && !!issuer.eik);
    const landlordLabel = isCompany
      ? `${contract.landlord_name || issuer.name || '...'}, ЕИК ${contract.landlord_egn || issuer.eik || ''}${issuer.mol ? `, представлявано от ${issuer.mol} – Управител` : ''}`
      : `${contract.landlord_name || issuer.name || ''}${contract.landlord_egn ? ', ЕГН ' + contract.landlord_egn : ''}`;
    // Наемател-фирма (има МОЛ) → идентификаторът е ЕИК, не ЕГН
    const tenantIdLabel = contract.tenant_mol ? 'ЕИК' : 'ЕГН';

    [
      ['НАЕМОДАТЕЛ / LANDLORD:', landlordLabel],
      ['НАЕМАТЕЛ / TENANT:', `${contract.tenant_name}${contract.tenant_egn ? `, ${tenantIdLabel} ` + contract.tenant_egn : ''}${contract.tenant_mol ? `, представлявано от ${contract.tenant_mol}` : ''}`],
    ].forEach(([lbl, val]) => {
      doc.font('B').fontSize(9).fillColor('#374151').text(lbl + '  ', ML, y, { continued: true });
      doc.font('R').fontSize(9).fillColor('#111827').text(val, { width: PW - 140 });
      y = doc.y + 6;
    });

    y += 10;
    doc.font('R').fontSize(9.5).fillColor('#111827')
       .text('се споразумяха за следното / agreed as follows:', ML, y, { width: PW });
    y = doc.y + 14;
    doc.moveTo(ML, y).lineTo(ML + PW, y).lineWidth(0.3).strokeColor('#e5e7eb').stroke();
    y += 14;

    // Articles
    const oldRent = Number(contract.monthly_rent || 0);
    const newRent = Number(annex.new_monthly_rent);
    const rentDiff = newRent - oldRent;
    const rentWords = amountToWords(Math.round(newRent));

    const articles = [
      {
        bg: `Чл. 1. Срокът на Договор за наем № ${cno} се удължава и страните се съгласяват имотът да бъде наеман до ${fmtDate(annex.new_end_date)}.`,
        en: `Art. 1. The term of Lease Agreement No. ${cno} is hereby extended and the parties agree that the property shall be leased until ${fmtDate(annex.new_end_date)}.`,
      },
      {
        bg: `Чл. 2. Считано от ${fmtDate(annex.annex_date)}, месечната наемна цена се определя на ${newRent.toLocaleString('bg-BG')} ${annex.new_currency} (${rentWords} ${annex.new_currency === 'EUR' ? 'евро' : 'лева'})${rentDiff !== 0 ? `, което представлява ${rentDiff > 0 ? 'увеличение' : 'намаление'} от ${Math.abs(rentDiff).toLocaleString('bg-BG')} ${annex.new_currency} спрямо предходния наем` : ''}.`,
        en: `Art. 2. As of ${fmtDate(annex.annex_date)}, the monthly rent is set at ${newRent.toLocaleString('bg-BG')} ${annex.new_currency} (${rentWords} ${annex.new_currency === 'EUR' ? 'euros' : 'leva'})${rentDiff !== 0 ? `, representing a ${rentDiff > 0 ? 'increase' : 'decrease'} of ${Math.abs(rentDiff).toLocaleString('bg-BG')} ${annex.new_currency} compared to the previous rent` : ''}.`,
      },
      {
        bg: 'Чл. 3. Всички останали условия по Договора за наем остават в сила и непроменени.',
        en: 'Art. 3. All other terms and conditions of the Lease Agreement remain in force and unchanged.',
      },
    ];

    if (annex.notes) {
      articles.push({
        bg: `Чл. 4. Допълнително уговорено: ${annex.notes}`,
        en: `Art. 4. Additionally agreed: ${annex.notes}`,
      });
    }

    articles.forEach(({ bg, en }) => {
      doc.font('R').fontSize(9.5).fillColor('#111827').text(bg, ML, y, { width: PW });
      y = doc.y + 4;
      doc.font('R').fontSize(8.5).fillColor('#6b7280').text(en, ML, y, { width: PW });
      y = doc.y + 14;
    });

    y += 10;
    doc.moveTo(ML, y).lineTo(ML + PW, y).lineWidth(0.3).strokeColor('#e5e7eb').stroke();
    y += 16;

    doc.font('R').fontSize(9).fillColor('#374151')
       .text('Анексът се подписа в два еднакви екземпляра — по един за всяка от страните.', ML, y, { width: PW });
    y = doc.y + 4;
    doc.font('R').fontSize(8).fillColor('#6b7280')
       .text('This Annex is signed in two identical copies — one for each party.', ML, y, { width: PW });
    y = doc.y + 24;

    // Signatures
    const sigY = y;
    const col  = PW / 2 - 15;
    doc.font('B').fontSize(9).fillColor('#111827')
       .text('НАЕМОДАТЕЛ / LANDLORD:', ML, sigY, { width: col, lineBreak: false });
    doc.font('B').fontSize(9).fillColor('#111827')
       .text('НАЕМАТЕЛ / TENANT:', ML + PW / 2, sigY, { width: col, lineBreak: false });
    const lineY = sigY + 45;
    doc.moveTo(ML,           lineY).lineTo(ML + col,  lineY).lineWidth(0.7).strokeColor('#374151').stroke();
    doc.moveTo(ML + PW / 2, lineY).lineTo(ML + PW,   lineY).lineWidth(0.7).strokeColor('#374151').stroke();
    const landlordSign = (contract.landlord_name || issuer.name || '')
      + (isCompany && issuer.mol ? `\n${issuer.mol} – Управител` : '');
    doc.font('R').fontSize(8).fillColor('#6b7280')
       .text(landlordSign, ML, lineY + 5, { width: col, align: 'center' });
    doc.font('R').fontSize(8).fillColor('#6b7280')
       .text(contract.tenant_name || '', ML + PW / 2, lineY + 5, { width: col, align: 'center', lineBreak: false });

    doc.end();
    ws.on('finish', () => resolve(filename));
    ws.on('error', reject);
  });
}

// ─── Router ────────────────────────────────────────────────────────────────
module.exports = function(db) {
  const router = express.Router();

  // ── Извличане на данни от лична карта (Claude Vision) ───────────────────
  // Качват се лице (front) + по желание гръб (back); връща структурирани данни
  // за преглед и автоматично попълване на договора. Снимките се пазят в ID_DIR.
  router.post('/extract-id', idUpload.fields([{ name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 }]), orgContext, async (req, res) => {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(400).json({ error: 'ANTHROPIC_API_KEY не е конфигуриран' });
      const front = req.files?.front?.[0];
      const back  = req.files?.back?.[0];
      if (!front) return res.status(400).json({ error: 'Качи поне лицевата страна на личната карта' });
      // Компресирай преди четене за Claude + дългосрочно съхранение.
      // HEIC от телефон се записва като .jpg и тук съдържанието става jpeg.
      const paths = [front.path, back?.path].filter(Boolean);
      await optimizeMany(paths);

      // Ако libheif тук не може да разкодира HEVC, конверсията тихо се проваля
      // и на диска остава HEIF под .jpg — Claude ще го отхвърли, а снимката не
      // би се показала. По-добре чист отказ с обяснение.
      for (const p of paths) {
        const chk = await isDisplayable(p);
        if (!chk.ok) {
          paths.forEach(x => { try { fs.unlinkSync(x); } catch {} });
          console.warn('[extract-id] неразчетен формат:', chk.format || chk.error);
          return res.status(400).json({
            error: 'Снимката е в HEIC/HEIF и сървърът не може да я преобразува. '
                 + 'Изключи HEIF от камерата (Samsung: Настройки на камерата → Разширени опции за снимане → HEIF снимки; '
                 + 'iPhone: Настройки → Камера → Формати → „Най-съвместим") или прати снимката като JPEG.',
          });
        }
      }

      let Anthropic;
      try { Anthropic = require('@anthropic-ai/sdk'); }
      catch (e) { return res.status(500).json({ error: '@anthropic-ai/sdk липсва: ' + e.message }); }
      const client = new Anthropic.default({ apiKey });

      const imgBlock = (f) => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: f.originalname.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
          data: fs.readFileSync(f.path).toString('base64'),
        },
      });
      const content = [imgBlock(front)];
      if (back) content.push(imgBlock(back));
      content.push({ type: 'text', text: `Това са снимки на документ за самоличност (българска лична карта или чуждестранен паспорт/ID карта; лице и евентуално гръб). Извлечи данните на притежателя. Върни САМО JSON обект, без markdown, без обяснения:
{
  "tenant_name": "Пълно име ТОЧНО както е изписано на документа",
  "egn": "ЕГН/ЛНЧ или личен номер от документа — точно както е изписан",
  "id_number": "Номер на документа",
  "id_issued_by": "Издаден от (напр. МВР / issuing authority)",
  "id_issued_date": "Дата на издаване във формат ГГГГ-ММ-ДД",
  "id_valid_until": "Валиден до във формат ГГГГ-ММ-ДД",
  "birth_date": "Дата на раждане ГГГГ-ММ-ДД",
  "permanent_address": "Постоянен адрес — точно както е изписан на документа"
}
ПРАВИЛА:
- Имената и адресът се преписват буква по буква, ТОЧНО както са изписани на документа — БЕЗ транслитерация и БЕЗ превод. Латиница остава латиница, кирилица остава кирилица.
- При българска лична карта ползвай кирилския запис на имената (както е отпечатан на картата).
- При чуждестранен документ запази оригиналния запис (обикновено латиница) и НЕ добавяй българска версия.
- ЕГН на българска карта е ТОЧНО 10 цифри — препиши цифра по цифра, провери внимателно (чести грешки: 0/O, 1/I, 5/6, 8/3)
- Ако дадено поле липсва или е нечетимо → празен низ ""
- Не измисляй данни` });

      const response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content }],
      });
      const raw = response.content.map(c => c.text || '').join('').trim();
      const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
      let data;
      try { data = JSON.parse(raw.slice(s, e + 1)); }
      catch (_) { return res.status(422).json({ error: 'Не успях да разчета данните — опитай с по-ясна/добре осветена снимка' }); }

      // Авто-запис в указателя — данните да не се губят, ако договорът не бъде довършен.
      // Пази ВСИЧКО от документа: номер, издаден от, дата, валидност, рождена дата, адрес.
      const docBits = [
        data.id_number      ? 'документ № ' + data.id_number       : '',
        data.id_issued_by   ? 'изд. от ' + data.id_issued_by       : '',
        data.id_valid_until ? 'валиден до ' + data.id_valid_until  : '',
      ].filter(Boolean).join(', ');
      upsertParty({
        name: data.tenant_name, egn: data.egn, address: data.permanent_address,
        doc_type: docBits, doc_date: data.id_issued_date, dob: data.birth_date,
      }, 'авто от сканиран документ');

      res.json({
        ok: true,
        data,
        id_front_path: path.basename(front.path),
        id_back_path: back ? path.basename(back.path) : null,
      });
    } catch (err) {
      console.error('extract-id failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Сервиране на снимка на ЛК (само за админ — router-ът е зад auth). Guard срещу traversal.
  router.get('/id-image/:file', (req, res) => {
    const safe = path.basename(req.params.file);
    const fp = path.join(ID_DIR, safe);
    if (!fp.startsWith(ID_DIR) || !fs.existsSync(fp)) return res.status(404).json({ error: 'Не е намерена' });
    res.sendFile(fp);
  });

  // ── Templates ──────────────────────────────────────────────────────────

  router.get('/templates', (req, res) => {
    res.json(db.prepare('SELECT * FROM contract_templates ORDER BY id').all());
  });

  router.post('/templates', upload.single('logo'), orgContext, (req, res) => {
    try {
      const { name, content, is_default } = req.body;
      if (!name || !content) return res.status(400).json({ error: 'name и content са задължителни' });
      const logo_path = req.file ? req.file.filename : null;
      if (is_default) db.prepare("UPDATE contract_templates SET is_default=0").run();
      const r = db.prepare(
        'INSERT INTO contract_templates (name, content, logo_path, is_default, kind) VALUES (?,?,?,?,?)'
      ).run(name, content, logo_path, is_default ? 1 : 0, contractKind(req.body.kind));
      res.status(201).json({ id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/templates/:id', upload.single('logo'), orgContext, (req, res) => {
    try {
      const { name, content, is_default } = req.body;
      const curr = db.prepare('SELECT * FROM contract_templates WHERE id=?').get(req.params.id);
      if (!curr) return res.status(404).json({ error: 'Not found' });
      const logo_path = req.file ? req.file.filename : curr.logo_path;
      if (is_default) db.prepare("UPDATE contract_templates SET is_default=0").run();
      db.prepare('UPDATE contract_templates SET name=?, content=?, logo_path=?, is_default=?, kind=? WHERE id=?')
        .run(name || curr.name, content || curr.content, logo_path, is_default ? 1 : 0,
             req.body.kind !== undefined ? contractKind(req.body.kind) : (curr.kind || 'наем'), req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/templates/:id', (req, res) => {
    db.prepare('DELETE FROM contract_templates WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // Logo upload (standalone)
  router.post('/templates/:id/logo', upload.single('logo'), orgContext, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Няма файл' });
    db.prepare('UPDATE contract_templates SET logo_path=? WHERE id=?').run(req.file.filename, req.params.id);
    res.json({ ok: true, logo_path: req.file.filename });
  });

  // ── Указател на наематели (преизползваеми контакти за договори) ─────────
  // Чисто контактни данни (без финанси) — брокерът създава наемател веднъж,
  // после го избира при нов договор. ВАЖНО: преди /:id route-а (иначе го хваща).
  router.get('/parties', (req, res) => {
    res.json(db.prepare('SELECT * FROM tenant_directory ORDER BY name COLLATE NOCASE').all());
  });

  const PARTY_FIELDS = ['name', 'egn', 'address', 'phone', 'email', 'doc_type', 'doc_date', 'doc_country', 'dob', 'notes'];

  // Авто-запис в указателя: upsert по ЕГН (ако има), иначе по име. Попълва
  // само празните полета на съществуващ запис — не изтрива въведени данни.
  function upsertParty(t, sourceNote) {
    if (!t.name || !String(t.name).trim()) return;
    try {
      const name = String(t.name).trim();
      const ex = (t.egn && db.prepare('SELECT id FROM tenant_directory WHERE egn=?').get(t.egn))
              || db.prepare('SELECT id FROM tenant_directory WHERE name=?').get(name);
      if (ex) {
        db.prepare(`UPDATE tenant_directory SET
            egn=COALESCE(NULLIF(egn,''),NULLIF(?,'')), address=COALESCE(NULLIF(address,''),NULLIF(?,'')),
            phone=COALESCE(NULLIF(phone,''),NULLIF(?,'')), email=COALESCE(NULLIF(email,''),NULLIF(?,'')),
            doc_type=COALESCE(NULLIF(doc_type,''),NULLIF(?,'')), doc_date=COALESCE(NULLIF(doc_date,''),NULLIF(?,'')),
            doc_country=COALESCE(NULLIF(doc_country,''),NULLIF(?,'')), dob=COALESCE(NULLIF(dob,''),NULLIF(?,'')),
            updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .run(t.egn || '', t.address || '', t.phone || '', t.email || '',
               t.doc_type || '', t.doc_date || '', t.doc_country || '', t.dob || '', ex.id);
      } else {
        db.prepare(`INSERT INTO tenant_directory (name, egn, address, phone, email, doc_type, doc_date, doc_country, dob, notes)
            VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run(name, t.egn || null, t.address || null, t.phone || null, t.email || null,
               t.doc_type || null, t.doc_date || null, t.doc_country || null, t.dob || null, sourceNote);
      }
    } catch (e) { console.warn('party upsert failed:', e.message); }
  }
  router.post('/parties', (req, res) => {
    try {
      const b = req.body || {};
      if (!b.name) return res.status(400).json({ error: 'Името е задължително' });
      const vals = PARTY_FIELDS.map(k => b[k] != null && b[k] !== '' ? String(b[k]) : null);
      const r = db.prepare(
        `INSERT INTO tenant_directory (${PARTY_FIELDS.join(',')}) VALUES (${PARTY_FIELDS.map(() => '?').join(',')})`
      ).run(...vals);
      res.status(201).json(db.prepare('SELECT * FROM tenant_directory WHERE id=?').get(r.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/parties/:id', (req, res) => {
    try {
      const cur = db.prepare('SELECT * FROM tenant_directory WHERE id=?').get(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Не е намерен' });
      const b = req.body || {};
      const vals = PARTY_FIELDS.map(k => (b[k] !== undefined ? (b[k] === '' ? null : String(b[k])) : cur[k]));
      db.prepare(
        `UPDATE tenant_directory SET ${PARTY_FIELDS.map(k => k + '=?').join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).run(...vals, req.params.id);
      res.json(db.prepare('SELECT * FROM tenant_directory WHERE id=?').get(req.params.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/parties/:id', (req, res) => {
    try { db.prepare('DELETE FROM tenant_directory WHERE id=?').run(req.params.id); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Експорт на контактите за външни мейл инструменти (Resend/Brevo/Gmail/…).
  // Admin-only — брокерът НЕ може да сваля цялата PII директория.
  const csvCell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  router.get('/parties/export.csv', (req, res) => {
    if (req.user?.role === 'broker') return res.status(403).json({ error: 'Само за администратори' });
    const rows = db.prepare('SELECT * FROM tenant_directory ORDER BY name COLLATE NOCASE').all();
    const cols = ['name', 'email', 'phone', 'address', 'egn', 'doc_type', 'doc_date', 'doc_country', 'dob', 'notes'];
    const header = ['Име', 'Имейл', 'Телефон', 'Адрес', 'ЕГН/ЕИК', 'Документ', 'Дата док.', 'Държава', 'Дата на раждане', 'Бележки'];
    const lines = [header.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))];
    // BOM за коректна кирилица в Excel
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kontakti.csv"');
    res.send('﻿' + lines.join('\r\n'));
  });
  router.get('/parties/export.vcf', (req, res) => {
    if (req.user?.role === 'broker') return res.status(403).json({ error: 'Само за администратори' });
    const rows = db.prepare('SELECT * FROM tenant_directory ORDER BY name COLLATE NOCASE').all();
    const esc = (v) => String(v == null ? '' : v).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const cards = rows.map(r => {
      const L = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(r.name)}`];
      if (r.email)   L.push(`EMAIL:${esc(r.email)}`);
      if (r.phone)   L.push(`TEL:${esc(r.phone)}`);
      if (r.address) L.push(`ADR:;;${esc(r.address)};;;;`);
      if (r.notes)   L.push(`NOTE:${esc(r.notes)}`);
      L.push('END:VCARD');
      return L.join('\r\n');
    });
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kontakti.vcf"');
    res.send(cards.join('\r\n'));
  });

  // ── Contracts ──────────────────────────────────────────────────────────

  router.get('/', (req, res) => {
    const { status, property_id, q, kind } = req.query;
    let sql = 'SELECT * FROM contracts WHERE 1=1';
    const params = [];
    if (status)      { sql += ' AND status=?';                         params.push(status); }
    if (kind)        { sql += " AND COALESCE(kind,'наем')=?";          params.push(contractKind(kind)); }
    if (property_id) { sql += ' AND property_id=?';                    params.push(property_id); }
    if (q)           { sql += ' AND (tenant_name LIKE ? OR contract_number LIKE ? OR property_address LIKE ?)';
                       params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    sql += ' ORDER BY created_at DESC';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  // Create contract (draft)
  router.post('/', async (req, res) => {
    try {
      const { template_id, property_id, ...fields } = req.body;
      if (!template_id) return res.status(400).json({ error: 'template_id е задължителен' });

      const template = db.prepare('SELECT * FROM contract_templates WHERE id=?').get(template_id);
      if (!template) return res.status(404).json({ error: 'Шаблонът не е намерен' });

      const prop    = property_id ? db.prepare('SELECT * FROM properties WHERE id=?').get(property_id) : null;
      const issuer  = getIssuer(db);
      const contract_number = nextContractNumber(db);

      const contract = {
        template_id, property_id: property_id || null, contract_number,
        status: 'draft',
        kind: contractKind(fields.kind || template.kind),
        landlord_type:    fields.landlord_type    || 'физическо',
        landlord_name:    fields.landlord_name    || issuer.name    || '',
        landlord_address: fields.landlord_address || issuer.address || '',
        landlord_egn:     fields.landlord_egn     || issuer.eik    || '',
        landlord_phone:   fields.landlord_phone   || '',
        landlord_lk:      fields.landlord_lk      || '',
        landlord_lk_date: fields.landlord_lk_date || '',
        tenant_name:         fields.tenant_name         || prop?.['наемател'] || '',
        tenant_address:      fields.tenant_address      || '',
        tenant_egn:          fields.tenant_egn          || '',
        tenant_phone:        fields.tenant_phone        || prop?.['телефон'] || '',
        tenant_email:        fields.tenant_email        || prop?.['email']   || '',
        tenant_mol:          fields.tenant_mol          || '',
        tenant_doc:          fields.tenant_doc          || '',
        tenant_doc_date:     fields.tenant_doc_date     || '',
        tenant_doc_country:  fields.tenant_doc_country  || '',
        tenant_dob:          fields.tenant_dob          || '',
        id_front_path:       fields.id_front_path       || null,
        id_back_path:        fields.id_back_path        || null,
        property_address:     fields.property_address     || prop?.['адрес'] || '',
        property_description: fields.property_description || '',
        property_area:        fields.property_area        || prop?.['площ']  || null,
        monthly_rent:  fields.monthly_rent || prop?.['наем'] || 0,
        currency:      fields.currency     || 'EUR',
        deposit:       fields.deposit      || 0,
        payment_day:   fields.payment_day  || 5,
        start_date:    fields.start_date   || null,
        end_date:      fields.end_date     || null,
        delivery_date: fields.delivery_date || null,
        conditions:    fields.conditions   || '',
        notes:         fields.notes        || '',
        абонат_ток:   fields.абонат_ток   || prop?.['абонат_ток']  || '',
        абонат_вода:  fields.абонат_вода  || prop?.['абонат_вода'] || '',
        абонат_тец:   fields.абонат_тец   || prop?.['абонат_тец']  || '',
        абонат_вход:  fields.абонат_вход  || prop?.['абонат_вход'] || '',
      };

      const photos = property_id
        ? db.prepare('SELECT * FROM property_photos WHERE property_id=? ORDER BY created_at').all(property_id)
        : [];
      const { filepath, filename } = await generateContractPDF(contract, template, issuer, photos);
      contract.pdf_path = filename;

      // Auto-generate standalone Приемо-предавателен протокол PDF (само за наемни —
      // интернет договорът няма предаване на имот)
      let protocolFilename = null;
      const protocolTmpl = contract.kind === 'интернет' ? null
        : db.prepare("SELECT * FROM contract_templates WHERE name='Приемо-предавателен протокол'").get();
      if (protocolTmpl) {
        try {
          // Load inventory + files for the property so we can append items
          const invItems = property_id
            ? db.prepare(`SELECT * FROM property_inventory WHERE property_id=? ORDER BY category, sort_order, name`).all(property_id)
            : [];
          for (const it of invItems) {
            it.photos = db.prepare(`SELECT id, type, filename, original_name FROM inventory_files WHERE inventory_id=? AND type='photo'`).all(it.id);
          }
          const res = await generateContractPDF(contract, protocolTmpl, issuer, photos, {
            appendProtocol: false, includeSignatures: true, filenamePrefix: 'protocol',
            appendInventory: true, inventory: invItems,
          });
          protocolFilename = res.filename;
        } catch (e) {
          console.warn('Protocol auto-gen failed (continuing):', e.message);
        }
      }
      contract.protocol_pdf_path = protocolFilename;

      const r = db.prepare(`
        INSERT INTO contracts (template_id, property_id, contract_number, status,
          landlord_type, landlord_name, landlord_address, landlord_egn, landlord_phone, landlord_lk, landlord_lk_date,
          tenant_name, tenant_address, tenant_egn, tenant_phone, tenant_email, tenant_mol,
          tenant_doc, tenant_doc_date, tenant_doc_country, tenant_dob,
          property_address, property_description, property_area,
          monthly_rent, currency, deposit, payment_day,
          start_date, end_date, delivery_date, conditions, notes,
          абонат_ток, абонат_вода, абонат_тец, абонат_вход,
          pdf_path, protocol_pdf_path, id_front_path, id_back_path, kind)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        contract.template_id, contract.property_id, contract.contract_number, contract.status,
        contract.landlord_type, contract.landlord_name, contract.landlord_address, contract.landlord_egn,
        contract.landlord_phone, contract.landlord_lk, contract.landlord_lk_date,
        contract.tenant_name, contract.tenant_address, contract.tenant_egn, contract.tenant_phone, contract.tenant_email, contract.tenant_mol,
        contract.tenant_doc, contract.tenant_doc_date, contract.tenant_doc_country, contract.tenant_dob,
        contract.property_address, contract.property_description, contract.property_area,
        contract.monthly_rent, contract.currency, contract.deposit, contract.payment_day,
        contract.start_date, contract.end_date, contract.delivery_date, contract.conditions, contract.notes,
        contract.абонат_ток, contract.абонат_вода, contract.абонат_тец, contract.абонат_вход,
        filename, protocolFilename, contract.id_front_path, contract.id_back_path, contract.kind
      );

      // Авто-запис на наемателя в указателя при всяко създаване на договор
      upsertParty({
        name: contract.tenant_name, egn: contract.tenant_egn, address: contract.tenant_address,
        phone: contract.tenant_phone, email: contract.tenant_email,
        doc_type: contract.tenant_doc, doc_date: contract.tenant_doc_date,
        doc_country: contract.tenant_doc_country, dob: contract.tenant_dob,
      }, 'авто при създаване на договор');

      res.status(201).json({ ok: true, id: r.lastInsertRowid, contract_number, filename, protocol_filename: protocolFilename });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Regenerate PDF for existing contract — also regenerates the standalone protocol
  router.post('/:id/regenerate', async (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Not found' });
      const template = db.prepare('SELECT * FROM contract_templates WHERE id=?').get(contract.template_id);
      if (!template) return res.status(404).json({ error: 'Шаблонът не е намерен' });
      const issuer = getIssuer(db);
      const photos = contract.property_id
        ? db.prepare('SELECT * FROM property_photos WHERE property_id=? ORDER BY created_at').all(contract.property_id)
        : [];
      const { filename } = await generateContractPDF(contract, template, issuer, photos);

      // Regenerate standalone protocol (with inventory + photos)
      let protocolFilename = null;
      const protocolTmpl = db.prepare("SELECT * FROM contract_templates WHERE name='Приемо-предавателен протокол'").get();
      if (protocolTmpl) {
        try {
          const invItems = contract.property_id
            ? db.prepare(`SELECT * FROM property_inventory WHERE property_id=? ORDER BY category, sort_order, name`).all(contract.property_id)
            : [];
          for (const it of invItems) {
            it.photos = db.prepare(`SELECT id, type, filename, original_name FROM inventory_files WHERE inventory_id=? AND type='photo'`).all(it.id);
          }
          const r = await generateContractPDF(contract, protocolTmpl, issuer, photos, {
            appendProtocol: false, includeSignatures: true, filenamePrefix: 'protocol',
            appendInventory: true, inventory: invItems,
          });
          protocolFilename = r.filename;
        } catch (e) { console.warn('Protocol regenerate failed:', e.message); }
      }

      db.prepare('UPDATE contracts SET pdf_path=?, protocol_pdf_path=? WHERE id=?').run(filename, protocolFilename, contract.id);
      res.json({ ok: true, filename, protocol_filename: protocolFilename });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Редакция на ключови полета (напр. забравена такса) + нов PDF от шаблона.
  // Архивните договори (сканът Е pdf_path) не се регенерират — само данните.
  const EDITABLE = ['tenant_name', 'tenant_email', 'tenant_phone', 'tenant_address', 'tenant_egn',
    'monthly_rent', 'currency', 'deposit', 'payment_day', 'start_date', 'end_date', 'delivery_date',
    'conditions', 'notes'];
  router.put('/:id', async (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Not found' });
      const b = req.body || {};
      const sets = [], vals = [];
      for (const k of EDITABLE) {
        if (b[k] === undefined) continue;
        let v = b[k];
        if (['monthly_rent', 'deposit'].includes(k)) v = v === '' || v === null ? 0 : Number(v);
        if (k === 'payment_day') v = v === '' || v === null ? contract.payment_day : Number(v);
        if (['monthly_rent', 'deposit', 'payment_day'].includes(k) && Number.isNaN(v)) return res.status(400).json({ error: `Невалидна стойност за ${k}` });
        if (typeof v === 'string') v = v.trim();
        sets.push(`${k}=?`); vals.push(v === '' ? null : v);
      }
      if (!sets.length) return res.status(400).json({ error: 'Няма полета за промяна' });
      db.prepare(`UPDATE contracts SET ${sets.join(', ')} WHERE id=?`).run(...vals, contract.id);
      const fresh = db.prepare('SELECT * FROM contracts WHERE id=?').get(contract.id);

      // Активен наемен договор → наемът в имота следва договора (както при активиране)
      if (fresh.status === 'active' && fresh.property_id && contractKind(fresh.kind) === 'наем' && b.monthly_rent !== undefined) {
        db.prepare('UPDATE properties SET наем=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(fresh.monthly_rent, fresh.property_id);
      }

      // Нов PDF (и протокол) — само за генерирани договори, не за качени сканове
      let regenerated = false;
      const isScan = !fresh.template_id || (fresh.signed_pdf_path && fresh.signed_pdf_path === fresh.pdf_path);
      const template = fresh.template_id ? db.prepare('SELECT * FROM contract_templates WHERE id=?').get(fresh.template_id) : null;
      if (!isScan && template && b.regenerate !== false) {
        const issuer = getIssuer(db);
        const photos = fresh.property_id
          ? db.prepare('SELECT * FROM property_photos WHERE property_id=? ORDER BY created_at').all(fresh.property_id) : [];
        const { filename } = await generateContractPDF(fresh, template, issuer, photos);
        let protocolFilename = contractKind(fresh.kind) === 'интернет' ? null : fresh.protocol_pdf_path;
        const protocolTmpl = contractKind(fresh.kind) === 'интернет' ? null
          : db.prepare("SELECT * FROM contract_templates WHERE name='Приемо-предавателен протокол'").get();
        if (protocolTmpl) {
          try {
            const invItems = fresh.property_id
              ? db.prepare(`SELECT * FROM property_inventory WHERE property_id=? ORDER BY category, sort_order, name`).all(fresh.property_id) : [];
            for (const it of invItems) it.photos = db.prepare(`SELECT id, type, filename, original_name FROM inventory_files WHERE inventory_id=? AND type='photo'`).all(it.id);
            const r = await generateContractPDF(fresh, protocolTmpl, issuer, photos, {
              appendProtocol: false, includeSignatures: true, filenamePrefix: 'protocol', appendInventory: true, inventory: invItems,
            });
            protocolFilename = r.filename;
          } catch (e) { console.warn('Protocol regenerate failed:', e.message); }
        }
        db.prepare('UPDATE contracts SET pdf_path=?, protocol_pdf_path=? WHERE id=?').run(filename, protocolFilename, fresh.id);
        regenerated = true;
      }
      res.json({ ok: true, regenerated, contract: db.prepare('SELECT * FROM contracts WHERE id=?').get(fresh.id) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Activate contract → update property + provision tenant account
  router.post('/:id/activate', async (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Not found' });

      // Един имот — един действащ договор ОТ ДАДЕН ВИД. Активирането е моментът,
      // в който щетата става реална: два активни наемни договора върху един имот
      // означават двойно фактуриране, объркан наемател в имота и грешна заетост.
      // Интернет договорът съжителства с наемния (същият наемател купува и нет).
      // Черновите нарочно НЕ се спират — подготовка на следващия договор, докато
      // текущият още тече, е нормална работа. Подновяване минава през анекс.
      const kind = contractKind(contract.kind);
      if (contract.property_id && contract.status !== 'active') {
        const other = db.prepare(
          "SELECT id, contract_number, tenant_name, end_date FROM contracts WHERE property_id=? AND status='active' AND id<>? AND COALESCE(kind,'наем')=?"
        ).get(contract.property_id, contract.id, kind);
        if (other) {
          return res.status(409).json({
            error: `Имотът вече има действащ договор ${other.contract_number || '#' + other.id}`
                 + (other.tenant_name ? ` с ${other.tenant_name}` : '')
                 + (other.end_date ? ` (до ${other.end_date})` : '')
                 + '. Прекрати го или направи анекс към него, преди да активираш нов.',
            conflict_contract_id: other.id,
          });
        }
      }

      db.prepare("UPDATE contracts SET status='active', activated_at=datetime('now') WHERE id=?").run(contract.id);

      // Update property
      if (contract.property_id && kind === 'интернет') {
        // Интернет договор: таксата НЕ е наем — не пипа наема/статуса/историята
        // на имота (иначе влиза в „месечен наем" в Таблото и в чл.50). Само при
        // имот без действащ наемен договор (чужд имот — само интернет) записва
        // кой е наемателят, за да се вижда в Имоти.
        const rentActive = db.prepare(
          "SELECT 1 FROM contracts WHERE property_id=? AND status='active' AND COALESCE(kind,'наем')='наем' AND id<>?"
        ).get(contract.property_id, contract.id);
        if (!rentActive) {
          db.prepare(`UPDATE properties SET наемател=?, телефон=?, email=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
            .run(contract.tenant_name, contract.tenant_phone || null, contract.tenant_email || null, contract.property_id);
        }
      } else if (contract.property_id) {
        db.prepare(`UPDATE properties SET наемател=?, наем=?, телефон=?, email=?, статус='✅', updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .run(contract.tenant_name, contract.monthly_rent, contract.tenant_phone || null, contract.tenant_email || null, contract.property_id);

        // Add to tenant_history
        db.prepare(`UPDATE tenant_history SET end_date=? WHERE property_id=? AND (end_date IS NULL OR end_date='')`)
          .run(contract.start_date || new Date().toISOString().slice(0,10), contract.property_id);
        db.prepare(`
          INSERT INTO tenant_history (property_id, tenant_name, start_date, end_date, monthly_rent, deposit, conditions, notes)
          VALUES (?,?,?,?,?,?,?,?)
        `).run(
          contract.property_id, contract.tenant_name,
          contract.start_date || null, contract.end_date || null,
          contract.monthly_rent, contract.deposit,
          contract.conditions || null, contract.notes || null
        );
      }

      // Provision tenant portal account (idempotent — won't recreate if already linked)
      let tenantInfo = { user: null, isNew: false, tempPassword: null };
      let emailResult = { sent: false };
      try {
        const freshContract = db.prepare('SELECT * FROM contracts WHERE id=?').get(contract.id);
        tenantInfo = ensureTenantUser(db, freshContract);
        if (tenantInfo.user && tenantInfo.isNew) {
          emailResult = await sendWelcomeEmail(db, {
            user: tenantInfo.user,
            contract: freshContract,
            tempPassword: tenantInfo.tempPassword,
          });
        }
      } catch (e) {
        console.error('Tenant provisioning failed:', e.message);
      }

      // Авто-генериране на първа фактура при активиране.
      // issue_invoice от заявката (изборът в диалога) има превес над глобалната
      // настройка: true включва фактурирането за имота и издава, false пропуска.
      let invoice = null;
      try {
        const explicit = typeof req.body?.issue_invoice === 'boolean' ? req.body.issue_invoice : null;
        // Интернетът се фактурира от Stripe покупката (payments.js), не като наем
        const shouldInvoice = kind === 'интернет' ? false : (explicit !== null ? explicit : autoInvoiceOnActivateOn(db));
        if (contract.property_id && shouldInvoice) {
          if (explicit === true) {
            db.prepare('UPDATE properties SET invoice_enabled=1 WHERE id=?').run(contract.property_id);
          }
          const month = (contract.start_date || new Date().toISOString()).slice(0, 7);
          const r = await generateRentInvoice(db, { property_id: contract.property_id, month });
          if (r.ok) invoice = { id: r.id, invoice_number: r.invoice_number };
          else invoice = { skipped: r.reason }; // напр. not_enabled / duplicate
        }
      } catch (e) {
        console.error('Auto-invoice on activate failed:', e.message);
      }

      // Фактура за гаранционния депозит — заедно с първата наемна, по избор от
      // диалога (issue_deposit_invoice). Иначе депозитът се губеше: наемната
      // излизаше сама, а депозитната чакаше ръчен клик в лентата „Депозит без
      // фактура". with_vat по подразбиране true (решението на Иво от 14.09).
      let deposit_invoice = null;
      try {
        const wantDeposit = req.body?.issue_deposit_invoice === true;
        if (wantDeposit && kind !== 'интернет' && contract.property_id && Number(contract.deposit) > 0) {
          const withVat = req.body?.deposit_with_vat !== false;
          const month = (contract.start_date || new Date().toISOString()).slice(0, 7);
          const r = await generateDepositInvoice(db, {
            property_id: contract.property_id, contract_id: contract.id,
            amount: Number(contract.deposit), with_vat: withVat, month,
          });
          deposit_invoice = r.ok ? { id: r.id, invoice_number: r.invoice_number, total: r.total }
                                 : { skipped: r.reason, invoice_number: r.invoice_number };
        }
      } catch (e) {
        console.error('Deposit invoice on activate failed:', e.message);
        deposit_invoice = { skipped: 'error', error: e.message };
      }

      // Договорът отива и при счетоводителя, за да го види навреме, а не в края
      // на месеца. Best-effort: провален имейл не бива да отменя активирането —
      // договорът вече е в сила, а изпращането се повтаря от бутона.
      let kontrolisi = null;
      try {
        if (kontrolisiContractsOn(db)) {
          const fresh = db.prepare('SELECT * FROM contracts WHERE id=?').get(contract.id);
          const r = await sendContractToKontrolisi(db, fresh, PDF_DIR);
          kontrolisi = r.ok ? { sent: true } : { sent: false, reason: r.reason };
          if (!r.ok) console.warn('kontrolisi contract send failed:', r.reason);
        }
      } catch (e) {
        kontrolisi = { sent: false, reason: e.message };
        console.error('kontrolisi contract send threw:', e.message);
      }

      res.json({
        ok: true,
        tenant_account: tenantInfo.user
          ? { id: tenantInfo.user.id, username: tenantInfo.user.username, email: tenantInfo.user.email, created: tenantInfo.isNew, email_sent: emailResult.sent }
          : null,
        invoice,
        deposit_invoice,
        kontrolisi,
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Ръчно изпращане на договор към счетоводителя — и за заварените договори,
  // активирани преди настройката да съществува.
  router.post('/:id/send-kontrolisi', async (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Not found' });
      const r = await sendContractToKontrolisi(db, contract, PDF_DIR);
      if (!r.ok) {
        const map = {
          no_email:  'Счетоводен имейл не е зададен в Настройки',
          no_resend: 'RESEND_API_KEY не е конфигуриран',
          no_pdf:    'PDF на договора не е намерен — регенерирайте го',
        };
        return res.status(400).json({ error: map[r.reason] || r.reason || 'Грешка при изпращане' });
      }
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Admin: manually (re)send tenant invite + reset password
  router.post('/:id/invite-tenant', async (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Not found' });
      if (!contract.tenant_email) return res.status(400).json({ error: 'Договорът няма tenant_email' });

      // Force-reset password (always send fresh creds)
      const bcrypt = require('bcryptjs');
      const crypto = require('crypto');
      const tempPassword = crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10);

      let info = ensureTenantUser(db, contract);
      if (!info.user) return res.status(500).json({ error: 'Не успях да създам акаунт' });
      db.control.prepare("UPDATE users SET password_hash=?, must_change_password=1 WHERE id=? AND organization_id=?")
        .run(bcrypt.hashSync(tempPassword, 10), info.user.id, db.orgId);

      const result = await sendWelcomeEmail(db, {
        user: info.user, contract, tempPassword,
      });
      if (!result.sent) return res.status(500).json({ error: 'Email грешка: ' + (result.reason || 'неизвестна') });
      res.json({ ok: true, username: info.user.username });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Terminate contract
  router.post('/:id/terminate', (req, res) => {
    const { end_date } = req.body;
    const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    db.prepare("UPDATE contracts SET status='terminated', terminated_at=datetime('now'), end_date=? WHERE id=?")
      .run(end_date || new Date().toISOString().slice(0,10), contract.id);
    // Интернет договорът не е записвал история на наемателите → не я затваря
    if (contract.property_id && contractKind(contract.kind) !== 'интернет') {
      db.prepare("UPDATE tenant_history SET end_date=? WHERE property_id=? AND (end_date IS NULL OR end_date='')")
        .run(end_date || new Date().toISOString().slice(0,10), contract.property_id);
    }
    res.json({ ok: true });
  });

  // Send by email
  router.post('/:id/send', async (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Not found' });
      const toEmail = req.body.email || contract.tenant_email;
      if (!toEmail) return res.status(400).json({ error: 'Няма email адрес' });
      let recipients;
      try { recipients = parseRecipients(toEmail); }
      catch (e) { return res.status(400).json({ error: e.message }); }

      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) return res.status(400).json({ error: 'RESEND_API_KEY не е конфигуриран' });

      const filepath = path.join(PDF_DIR, contract.pdf_path);
      if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'PDF не е намерен — регенерирайте' });

      const issuer = getIssuer(db);
      const fromEmail = process.env.RESEND_FROM_EMAIL || `info@${(issuer.email || 'skycapital.pro').split('@').slice(-1)[0]}`;
      const fromName  = issuer.name || 'Skyrent';

      const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">
        <tr><td style="background:#1a1a2e;padding:18px 32px;font-size:18px;font-weight:bold;color:#fff;letter-spacing:2px;">${fromName}</td></tr>
        <tr><td style="padding:32px 32px 24px;color:#1a1a2e;font-size:14px;line-height:1.7;">
          <p>Уважаеми/а <strong>${contract.tenant_name}</strong>,</p>
          <p>Прилагаме <strong>Договор за наем № ${contract.contract_number}</strong> за имот <strong>${contract.property_address}</strong>.</p>
          <p>Моля прегледайте, подпишете и върнете сканиран екземпляр.</p>
          <p style="margin-top:24px;">С уважение,<br><strong>${fromName}</strong></p>
        </td></tr>
        <tr><td style="background:#e8eaf2;padding:14px 32px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #d1d5db;">
          <strong>${fromName}</strong>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      const pdfBase64 = fs.readFileSync(filepath).toString('base64');

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: recipients,
          subject: `Договор за наем № ${contract.contract_number}`,
          html: emailHtml,
          attachments: [{ filename: `Договор_${contract.contract_number}.pdf`, content: pdfBase64 }],
        }),
      });
      const result = await response.json();
      if (!response.ok) return res.status(500).json({ error: result.message || 'Resend грешка' });

      db.prepare("UPDATE contracts SET sent_at=datetime('now') WHERE id=?").run(contract.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Download PDF
  router.get('/:id/pdf', (req, res) => {
    const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    const filepath = path.join(PDF_DIR, contract.pdf_path);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'PDF не е намерен' });
    // Архивираните договори може да са Word (.docx) — сервирай с правилния mime,
    // за да се свали коректно (иначе браузърът го третира като PDF).
    if (/\.docx$/i.test(contract.pdf_path)) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="dogovor_${contract.id}.docx"`);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
    }
    fs.createReadStream(filepath).pipe(res);
  });

  // Serve standalone Приемо-предавателен протокол PDF.
  // Reads the stored file (created together with the contract). If missing
  // (e.g. contract was created before this feature shipped), regenerates on
  // demand from the template.
  router.get('/:id/protocol/pdf', async (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Not found' });

      let filename = contract.protocol_pdf_path;
      let filepath = filename ? path.join(PDF_DIR, filename) : null;

      if (!filepath || !fs.existsSync(filepath)) {
        // Lazy-regenerate for old contracts
        const template = db.prepare("SELECT * FROM contract_templates WHERE name='Приемо-предавателен протокол'").get();
        if (!template) return res.status(404).json({ error: 'Шаблон "Приемо-предавателен протокол" липсва.' });
        const issuer = getIssuer(db);
        const photos = contract.property_id
          ? db.prepare('SELECT * FROM property_photos WHERE property_id=? ORDER BY created_at').all(contract.property_id)
          : [];
        const invItems = contract.property_id
          ? db.prepare(`SELECT * FROM property_inventory WHERE property_id=? ORDER BY category, sort_order, name`).all(contract.property_id)
          : [];
        for (const it of invItems) {
          it.photos = db.prepare(`SELECT id, type, filename, original_name FROM inventory_files WHERE inventory_id=? AND type='photo'`).all(it.id);
        }
        const r = await generateContractPDF(contract, template, issuer, photos, {
          appendProtocol: false, includeSignatures: true, filenamePrefix: 'protocol',
          appendInventory: true, inventory: invItems,
        });
        filename = r.filename;
        filepath = r.filepath;
        db.prepare('UPDATE contracts SET protocol_pdf_path=? WHERE id=?').run(filename, contract.id);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="protocol_${contract.contract_number}.pdf"`);
      fs.createReadStream(filepath).pipe(res);
    } catch (err) {
      console.error('Protocol PDF error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Annexes ────────────────────────────────────────────────────────────────

  // List annexes for a contract
  router.get('/:id/annexes', (req, res) => {
    res.json(db.prepare('SELECT * FROM contract_annexes WHERE contract_id=? ORDER BY created_at').all(req.params.id));
  });

  // Download annex PDF
  router.get('/:id/annexes/:annexId/pdf', (req, res) => {
    const annex = db.prepare('SELECT * FROM contract_annexes WHERE id=? AND contract_id=?').get(req.params.annexId, req.params.id);
    if (!annex || !annex.pdf_path) return res.status(404).json({ error: 'Not found' });
    const fp = path.join(PDF_DIR, annex.pdf_path);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'PDF не е намерен' });
    if (/\.docx$/i.test(annex.pdf_path)) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="aneks_${annex.id}.docx"`);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
    }
    fs.createReadStream(fp).pipe(res);
  });

  // Изпращане на анекс по имейл до наемателя (по модела на договорния send)
  router.post('/:id/annexes/:annexId/send', async (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      const annex = db.prepare('SELECT * FROM contract_annexes WHERE id=? AND contract_id=?').get(req.params.annexId, req.params.id);
      if (!contract || !annex) return res.status(404).json({ error: 'Not found' });
      const toEmail = req.body?.email || contract.tenant_email;
      if (!toEmail) return res.status(400).json({ error: 'Няма email адрес — добави го в договора или подай друг' });
      let recipients;
      try { recipients = parseRecipients(toEmail); }
      catch (e) { return res.status(400).json({ error: e.message }); }

      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) return res.status(400).json({ error: 'RESEND_API_KEY не е конфигуриран' });
      const fp = path.join(PDF_DIR, annex.pdf_path || '');
      if (!annex.pdf_path || !fs.existsSync(fp)) return res.status(404).json({ error: 'Файлът на анекса не е намерен' });

      const issuer = getIssuer(db);
      const fromEmail = process.env.RESEND_FROM_EMAIL || `info@${(issuer.email || 'skycapital.pro').split('@').slice(-1)[0]}`;
      const fromName  = issuer.name || 'Skyrent';
      const isDocx = /\.docx$/i.test(annex.pdf_path);

      const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">
        <tr><td style="background:#1a1a2e;padding:18px 32px;font-size:18px;font-weight:bold;color:#fff;letter-spacing:2px;">${fromName}</td></tr>
        <tr><td style="padding:32px 32px 24px;color:#1a1a2e;font-size:14px;line-height:1.7;">
          <p>Уважаеми/а <strong>${contract.tenant_name}</strong>,</p>
          <p>Прилагаме <strong>Анекс № ${annex.annex_number}</strong> към Договор за наем${contract.contract_number ? ` № ${contract.contract_number}` : ''} за имот <strong>${contract.property_address || ''}</strong>.</p>
          <p>Моля прегледайте, подпишете и върнете сканиран екземпляр.</p>
          <p style="margin-top:24px;">С уважение,<br><strong>${fromName}</strong></p>
        </td></tr>
        <tr><td style="background:#e8eaf2;padding:14px 32px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #d1d5db;">
          <strong>${fromName}</strong>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: recipients,
          subject: `Анекс № ${annex.annex_number} към договор за наем`,
          html: emailHtml,
          attachments: [{ filename: `Анекс_${annex.annex_number.replace(/[^\wА-я-]/g, '-')}.${isDocx ? 'docx' : 'pdf'}`, content: fs.readFileSync(fp).toString('base64') }],
        }),
      });
      const result = await response.json();
      if (!response.ok) return res.status(500).json({ error: result.message || 'Resend грешка' });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Качване на СЪЩЕСТВУВАЩ (стар, подписан) анекс в архива — PDF/DOCX/снимки.
  // Без AI — само файл + дата/бележка; номерът се генерира последователно.
  router.post('/:id/annexes/upload', upload.array('files', 10), orgContext, async (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Not found' });
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: 'Качи PDF, Word или снимки на анекса' });

      const isPdf  = (x) => /\.pdf$/i.test(x.originalname) || x.mimetype === 'application/pdf';
      const isDocx = (x) => /\.docx$/i.test(x.originalname) || /wordprocessingml/i.test(x.mimetype);
      const isImg  = (x) => /\.(jpe?g|png)$/i.test(x.originalname) || /image\/(jpe?g|png)/i.test(x.mimetype);
      const pdfs = files.filter(isPdf), docxs = files.filter(isDocx), imgs = files.filter(isImg);

      let storedPath;
      if (pdfs.length) storedPath = pdfs[0].path;
      else if (docxs.length) storedPath = docxs[0].path;
      else if (imgs.length) {
        // снимки → един многостраничен PDF
        storedPath = path.join(PDF_DIR, `annex_scan_${Date.now()}.pdf`);
        await new Promise((resolve, reject) => {
          const doc = new PDFDocument({ autoFirstPage: false });
          const stream = fs.createWriteStream(storedPath);
          doc.pipe(stream);
          for (const im of imgs) { const img = doc.openImage(im.path); doc.addPage({ size: [img.width, img.height], margin: 0 }); doc.image(img, 0, 0); }
          doc.end();
          stream.on('finish', resolve); stream.on('error', reject);
        });
      } else return res.status(400).json({ error: 'Неподдържан формат' });
      for (const f of files) { if (f.path !== storedPath) { try { fs.unlinkSync(f.path); } catch (_) {} } }

      const count = db.prepare('SELECT COUNT(*) as c FROM contract_annexes WHERE contract_id=?').get(contract.id).c;
      const annex_number = `${contract.contract_number || 'Д' + contract.id}/А-${count + 1}`;
      const annex_date = req.body.annex_date || new Date().toISOString().slice(0, 10);

      const r = db.prepare(`
        INSERT INTO contract_annexes (contract_id, annex_number, annex_date, new_end_date, new_monthly_rent, new_currency, notes, pdf_path)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(
        contract.id, annex_number, annex_date,
        req.body.new_end_date || contract.end_date || annex_date,
        req.body.new_monthly_rent != null && req.body.new_monthly_rent !== '' ? Number(req.body.new_monthly_rent) : (contract.monthly_rent || 0),
        contract.currency || 'EUR',
        (req.body.notes ? req.body.notes + ' · ' : '') + '📎 качен архивен анекс',
        path.basename(storedPath)
      );
      res.status(201).json({ ok: true, id: r.lastInsertRowid, annex_number });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Create annex
  router.post('/:id/annexes', async (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Not found' });

      const { annex_date, new_end_date, new_monthly_rent, new_currency, notes } = req.body;
      if (!annex_date || !new_end_date || !new_monthly_rent) {
        return res.status(400).json({ error: 'annex_date, new_end_date и new_monthly_rent са задължителни' });
      }

      // Annex number within this contract. Архивираните (качени) договори нямат
      // contract_number → fallback към Д<id>, иначе номерът излиза празен.
      const count = db.prepare('SELECT COUNT(*) as c FROM contract_annexes WHERE contract_id=?').get(contract.id).c;
      const annex_number = `${contract.contract_number || 'Д' + contract.id}/А-${count + 1}`;

      const issuer = getIssuer(db);
      const annex = { contract_id: contract.id, annex_number, annex_date, new_end_date, new_monthly_rent: Number(new_monthly_rent), new_currency: new_currency || contract.currency || 'EUR', notes: notes || '' };

      const filename = await generateAnnexPDF(annex, contract, issuer);

      const r = db.prepare(`
        INSERT INTO contract_annexes (contract_id, annex_number, annex_date, new_end_date, new_monthly_rent, new_currency, notes, pdf_path)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(annex.contract_id, annex.annex_number, annex.annex_date, annex.new_end_date, annex.new_monthly_rent, annex.new_currency, annex.notes, filename);

      // Update contract end_date and rent
      db.prepare('UPDATE contracts SET end_date=?, monthly_rent=?, currency=? WHERE id=?')
        .run(new_end_date, Number(new_monthly_rent), annex.new_currency, contract.id);

      // Update property rent if active contract
      if (contract.status === 'active' && contract.property_id) {
        db.prepare('UPDATE properties SET наем=? WHERE id=?').run(Number(new_monthly_rent), contract.property_id);
      }

      res.status(201).json({ ok: true, id: r.lastInsertRowid, annex_number, filename });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Delete annex
  router.delete('/:id/annexes/:annexId', (req, res) => {
    const annex = db.prepare('SELECT * FROM contract_annexes WHERE id=? AND contract_id=?').get(req.params.annexId, req.params.id);
    if (annex?.pdf_path) {
      const fp = path.join(PDF_DIR, annex.pdf_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    db.prepare('DELETE FROM contract_annexes WHERE id=?').run(req.params.annexId);
    res.json({ ok: true });
  });

  // ── Подписан екземпляр ──────────────────────────────────────
  // Генерираният PDF (pdf_path) е неподписаният текст. След подписване на
  // хартия сканът/снимките се качват тук и стоят до договора завинаги.
  // При архивираните договори сканът вече е подписаният → signed_pdf_path
  // сочи към същия файл като pdf_path и той НЕ се трие при замяна/премахване.
  const unlinkSigned = (contract) => {
    if (!contract.signed_pdf_path || contract.signed_pdf_path === contract.pdf_path) return;
    const fp = path.join(PDF_DIR, contract.signed_pdf_path);
    if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch (_) {} }
  };

  router.post('/:id/signed', upload.array('files', 10), orgContext, async (req, res) => {
    try {
      const files = req.files || [];
      const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
      if (!contract) {
        for (const f of files) { try { fs.unlinkSync(f.path); } catch (_) {} } // multer вече ги е записал
        return res.status(404).json({ error: 'Not found' });
      }
      if (!files.length) return res.status(400).json({ error: 'Качи PDF, Word или снимки на подписания договор' });

      const isPdf  = (x) => /\.pdf$/i.test(x.originalname) || x.mimetype === 'application/pdf';
      const isDocx = (x) => /\.docx$/i.test(x.originalname) || /wordprocessingml/i.test(x.mimetype);
      const isImg  = (x) => /\.(jpe?g|png)$/i.test(x.originalname) || /image\/(jpe?g|png)/i.test(x.mimetype);
      const pdfs = files.filter(isPdf), docxs = files.filter(isDocx), imgs = files.filter(isImg);

      let storedPath;
      if (pdfs.length) storedPath = pdfs[0].path;
      else if (docxs.length) storedPath = docxs[0].path;
      else if (imgs.length) {
        // снимки → един многостраничен PDF
        storedPath = path.join(PDF_DIR, `contract_signed_${contract.id}_${Date.now()}.pdf`);
        await new Promise((resolve, reject) => {
          const doc = new PDFDocument({ autoFirstPage: false });
          const stream = fs.createWriteStream(storedPath);
          doc.pipe(stream);
          for (const im of imgs) { const img = doc.openImage(im.path); doc.addPage({ size: [img.width, img.height], margin: 0 }); doc.image(img, 0, 0); }
          doc.end();
          stream.on('finish', resolve); stream.on('error', reject);
        });
      } else {
        for (const f of files) { try { fs.unlinkSync(f.path); } catch (_) {} }
        return res.status(400).json({ error: 'Неподдържан формат' });
      }
      for (const f of files) { if (f.path !== storedPath) { try { fs.unlinkSync(f.path); } catch (_) {} } }

      unlinkSigned(contract); // старият подписан екземпляр се заменя
      const signed_at = /^\d{4}-\d{2}-\d{2}$/.test(req.body.signed_at || '') ? req.body.signed_at : new Date().toISOString().slice(0, 10);
      db.prepare('UPDATE contracts SET signed_pdf_path=?, signed_at=? WHERE id=?')
        .run(path.basename(storedPath), signed_at, contract.id);
      res.status(201).json({ ok: true, signed_pdf_path: path.basename(storedPath), signed_at });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/:id/signed/pdf', (req, res) => {
    const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!contract.signed_pdf_path) return res.status(404).json({ error: 'Няма качен подписан екземпляр' });
    const filepath = path.join(PDF_DIR, contract.signed_pdf_path);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Файлът липсва' });
    if (/\.docx$/i.test(contract.signed_pdf_path)) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="dogovor_${contract.id}_podpisan.docx"`);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
    }
    fs.createReadStream(filepath).pipe(res);
  });

  router.delete('/:id/signed', (req, res) => {
    const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    unlinkSigned(contract);
    db.prepare('UPDATE contracts SET signed_pdf_path=NULL, signed_at=NULL WHERE id=?').run(contract.id);
    res.json({ ok: true });
  });

  // Delete contract
  router.delete('/:id', (req, res) => {
    const contract = db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (contract.pdf_path) {
      const fp = path.join(PDF_DIR, contract.pdf_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    unlinkSigned(contract);
    db.prepare('DELETE FROM contracts WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};

// Изнесена за тестове и локален преглед на оформлението (както при фактурите).
module.exports.generateContractPDF = generateContractPDF;
