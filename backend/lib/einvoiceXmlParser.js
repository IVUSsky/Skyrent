/**
 * Parser за e-invoice.bg XML формат.
 *
 * Input: buffer (PDF/XML файл) или ZIP с XML вътре
 * Output: { ok: true, data: { supplier_name, supplier_iban, ... } } ИЛИ { ok: false, reason }
 *
 * XML структурата идва от e-Invoice.bg Invoicing Module — съдържа Biller, InvoiceRecipient,
 * InvoicePreamble, Details, Tax, TotalGrossAmount, PaymentMethod, PaymentConditions, Other.
 */
const { XMLParser } = require('fast-xml-parser');
const AdmZip = require('adm-zip');
const fs = require('fs');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

/**
 * Извлечи XML съдържание от buffer.
 * @param {Buffer|string} input — buffer или filepath
 * @returns {string|null} XML съдържание или null ако няма XML
 */
function extractXml(input) {
  let buf = input;
  if (typeof input === 'string') {
    if (!fs.existsSync(input)) return null;
    buf = fs.readFileSync(input);
  }

  // Direct XML
  const headBytes = buf.slice(0, 100).toString('utf8').trimStart();
  if (headBytes.startsWith('<?xml') || headBytes.startsWith('<Invoice')) {
    return buf.toString('utf8');
  }

  // ZIP signature: PK\x03\x04
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    try {
      const zip = new AdmZip(buf);
      const entries = zip.getEntries();
      for (const e of entries) {
        if (e.entryName.toLowerCase().endsWith('.xml')) {
          return e.getData().toString('utf8');
        }
      }
    } catch (err) {
      return null;
    }
  }
  return null;
}

/**
 * Парсва e-invoice.bg XML съдържание.
 * @param {string} xmlText
 * @returns {{ok: boolean, data?: object, reason?: string}}
 */
function parseInvoiceXml(xmlText) {
  let xml;
  try {
    xml = parser.parse(xmlText);
  } catch (err) {
    return { ok: false, reason: 'invalid XML: ' + err.message };
  }

  const invoice = xml.Invoice;
  if (!invoice) return { ok: false, reason: 'no <Invoice> root element' };

  const get = (obj, path, def = '') => {
    try {
      return path.split('.').reduce((o, k) => (o == null ? null : o[k]), obj) || def;
    } catch { return def; }
  };
  const num = (v) => {
    if (v == null || v === '') return null;
    const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  };

  // Currency from root attribute
  const currency = get(invoice, '@_InvoiceCurrency', 'BGN').toUpperCase();

  // Preamble
  const invoiceNumber = get(invoice, 'InvoicePreamble.InvoiceNumber');
  const invoiceDate = get(invoice, 'InvoicePreamble.InvoiceDate'); // YYYY-MM-DD

  // Biller
  const supplierName = get(invoice, 'Biller.Address.Name')
    || get(invoice, 'Biller.FurtherIdentification', '');
  const supplierEik = (() => {
    const fi = get(invoice, 'Biller.FurtherIdentification');
    if (typeof fi === 'string') return fi;
    if (Array.isArray(fi)) {
      const eik = fi.find(f => f['@_IdentificationType'] === 'EIK');
      return eik ? (eik['#text'] || '') : '';
    }
    if (fi && typeof fi === 'object') {
      return fi['@_IdentificationType'] === 'EIK' ? (fi['#text'] || '') : '';
    }
    return '';
  })();
  const supplierVat = get(invoice, 'Biller.VATIdentificationNumber');

  // Payment method
  const pm = invoice.PaymentMethod || {};
  let iban = '';
  let bic = '';
  if (pm.BeneficiaryAccount) {
    iban = (pm.BeneficiaryAccount.IBAN || '').replace(/\s/g, '').toUpperCase();
    bic = pm.BeneficiaryAccount.BIC || '';
  }
  const bankName = get(pm, 'BeneficiaryAccount.BankName');

  // Tax & total
  const totalGross = num(get(invoice, 'TotalGrossAmount')); // amount with VAT
  let totalNet = null;
  let vatAmount = null;
  if (invoice.Tax && invoice.Tax.VAT && invoice.Tax.VAT.Item) {
    const item = Array.isArray(invoice.Tax.VAT.Item) ? invoice.Tax.VAT.Item[0] : invoice.Tax.VAT.Item;
    totalNet = num(item.TaxedAmount);
    vatAmount = num(item.Amount);
  }

  // Items (description аggregate)
  let description = '';
  const items = get(invoice, 'Details.ItemList.ListLineItem');
  if (items) {
    const arr = Array.isArray(items) ? items : [items];
    description = arr.map(i => i.Description).filter(Boolean).slice(0, 3).join('; ').slice(0, 100);
  }

  // Due date
  const dueDate = get(invoice, 'PaymentConditions.DueDate');

  // Custom — try to detect месец (period start)
  let detectedMonth = null;
  const other = invoice.Other && invoice.Other.Information;
  if (other) {
    const arr = Array.isArray(other) ? other : [other];
    const startPeriod = arr.find(i => i.Key === 'StartPeriod');
    if (startPeriod && startPeriod.Value) {
      // Format "01.04.2026 г." -> "2026-04"
      const m = String(startPeriod.Value).match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (m) detectedMonth = `${m[3]}-${m[2]}`;
    }
  }
  // Fallback: derive месец from invoice_date
  if (!detectedMonth && invoiceDate && /^\d{4}-\d{2}/.test(invoiceDate)) {
    detectedMonth = invoiceDate.slice(0, 7);
  }

  // Reason composition
  const reason = [description, invoiceNumber].filter(Boolean).join(' | ').slice(0, 90) || 'PAYMENT';

  // ── Utility identification & address — for property matching ──
  // BillersInvoiceRecipientID is the unique account number per property (партиден номер)
  const utilityAccountId = String(get(invoice, 'InvoiceRecipient.BillersInvoiceRecipientID') || '').trim();
  // BP (InstallationNumber) is alternative ID
  let utilityBP = '';
  const recipientFI = invoice.InvoiceRecipient && invoice.InvoiceRecipient.FurtherIdentification;
  if (recipientFI) {
    const arr = Array.isArray(recipientFI) ? recipientFI : [recipientFI];
    const bp = arr.find(f => f['@_IdentificationType'] === 'BP');
    if (bp) utilityBP = String(bp['#text'] || bp || '').trim();
  }

  const deliveryAddress = get(invoice, 'InvoiceRecipient.Address.Street', '').replace(/\s+/g, ' ').trim();
  const recipientName = get(invoice, 'InvoiceRecipient.Address.Name');

  // Custom: registration address (different from delivery)
  let registrationAddress = '';
  if (other) {
    const arr = Array.isArray(other) ? other : [other];
    const ra = arr.find(i => i.Key === 'customer_registration_address');
    if (ra) registrationAddress = String(ra.Value || '').replace(/\s+/g, ' ').trim();
  }

  // Derive utility type from supplier name (Cyrillic match)
  const supLower = (supplierName || '').toLowerCase();
  let utilityType = 'друго';
  if (supLower.includes('топлофикац')) utilityType = 'топлофикация';
  else if (supLower.includes('софийска вода') || supLower.includes('вик ')) utilityType = 'вода';
  else if (supLower.includes('евн') || supLower.includes('електрораз') || supLower.includes('чез') || supLower.includes('electrohold')) utilityType = 'ток';
  else if (supLower.includes('булгаргаз') || supLower.includes('овергаз')) utilityType = 'газ';

  // ── Consumption data — only for heating utility (Toplofikacia structure) ──
  let consumption = null;
  const customs = invoice.Custom ? (Array.isArray(invoice.Custom) ? invoice.Custom : [invoice.Custom]) : [];
  for (const c of customs) {
    const res = c['xsv:ResidentialDataType0'];
    if (res) {
      const total = res.TotalProvidedHeatingEnergy || {};
      const water = res.ProvidedHotWaterEnergy || {};
      const heating = res.ProvidedHeatingEnergy || {};
      const personal = res.PersonalMonthlyEnergy || {};
      consumption = {
        building_heating_total: num(total.Total),
        building_amount_for_distribution: num(total.AmountForDistribution),
        working_heating_days: num(total.WorkingHeatingDays),
        working_hot_water_days: num(total.WorkingHotWaterDays),
        degree_days: num(total.DegreeDays),
        avg_outside_temp: num(total.AverageOutsideTemperature),
        personal_building_installation: num(personal.BuildingInstallation),
        personal_common_areas: num(personal.CommonAreas),
        personal_property_heating: num(personal.PropertyHeating),
        personal_property_hot_water: num(personal.PropertyHotWater),
        property_hot_water_quantity_m3: num(water.HotWaterQuantity),
        property_volume_m3: num(heating.TotalHeatedPropertyVolume),
      };
      break;
    }
  }

  return {
    ok: true,
    data: {
      supplier_name: supplierName,
      supplier_iban: iban,
      supplier_bic: bic,
      supplier_eik: supplierEik,
      supplier_vat: supplierVat,
      bank_name: bankName,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate,
      amount: totalGross,            // gross / total to pay
      amount_no_vat: totalNet,        // net / taxable
      vat_amount: vatAmount,
      currency: currency,
      description,
      reason,
      detected_month: detectedMonth,
      source_format: 'xml',
      // Property matching fields
      utility_type: utilityType,
      utility_account_id: utilityAccountId,
      utility_bp: utilityBP,
      delivery_address: deliveryAddress,
      registration_address: registrationAddress,
      recipient_name: recipientName,
      consumption,
    }
  };
}

/**
 * Главна функция: вземи file path → опитай да парснеш като XML.
 * Връща null ако не е XML/ZIP-с-XML.
 */
function tryParseFile(filepath) {
  const xml = extractXml(filepath);
  if (!xml) return null;
  return parseInvoiceXml(xml);
}

module.exports = { tryParseFile, parseInvoiceXml, extractXml };
