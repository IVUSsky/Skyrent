import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { landlordIsCompany, buildFields } = require('./contracts.js');

// Издателят в тази организация е дружеството — единственият IBAN е негов.
const issuer = {
  name: 'Скай Кепитъл ООД', eik: '207291184', mol: 'Иво Лазаров',
  address: 'София, Младост 3, бл. 386', iban: 'BG75PRCB92301053911901',
};

const base = {
  monthly_rent: 680, deposit: 1360, currency: 'EUR', payment_day: 5,
  start_date: '2026-10-02', tenant_name: 'Наемател',
};

describe('кой е наемодателят', () => {
  it('изрично дружество → дружество', () => {
    expect(landlordIsCompany({ landlord_type: 'дружество' }, issuer)).toBe(true);
  });

  it('физическо лице със свое име → физическо лице', () => {
    expect(landlordIsCompany({ landlord_type: 'физическо', landlord_name: 'Иво Лазаров Лазаров' }, issuer)).toBe(false);
  });

  // Регресията: колоната е с DEFAULT 'физическо', затова заварените и
  // архивираните договори се водят физически, без да са. Данните им идват от
  // издателя, тоест от фирмата — не бива да минават за физическо лице.
  it('„физическо“ по подразбиране, без свое име → пак дружество', () => {
    expect(landlordIsCompany({ landlord_type: 'физическо', landlord_name: '' }, issuer)).toBe(true);
  });

  it('без издател с ЕИК няма на какво да се опре → физическо лице', () => {
    expect(landlordIsCompany({ landlord_type: 'физическо', landlord_name: '' }, { eik: '' })).toBe(false);
  });
});

describe('начин на плащане', () => {
  it('наемодател-физлице се плаща в брой, не по банков път', () => {
    const f = buildFields({ ...base, landlord_type: 'физическо', landlord_name: 'Иво Лазаров Лазаров', payment_method: 'банков превод' }, issuer);
    expect(f['НАЧИН_ПЛАЩАНЕ']).toBe('в брой');
    expect(f['НАЧИН_ПЛАЩАНЕ']).not.toContain('IBAN');
  });

  it('дружеството си остава по банков път с IBAN-а на фирмата', () => {
    const f = buildFields({ ...base, landlord_type: 'дружество', payment_method: 'банков превод' }, issuer);
    expect(f['НАЧИН_ПЛАЩАНЕ']).toContain('IBAN');
    expect(f['НАЧИН_ПЛАЩАНЕ']).toContain(issuer.iban);
  });

  it('заварен договор без име на наемодател не се прехвърля на „в брой“', () => {
    const f = buildFields({ ...base, landlord_type: 'физическо', landlord_name: '', payment_method: 'банков превод' }, issuer);
    expect(f['НАЧИН_ПЛАЩАНЕ']).toContain('IBAN');
  });
});

describe('данни на наемодателя в договора', () => {
  it('физическо лице излиза с ЕГН и лична карта, не с ЕИК на фирмата', () => {
    const f = buildFields({
      ...base, landlord_type: 'физическо', landlord_name: 'Иво Лазаров Лазаров',
      landlord_egn: '8112187262', landlord_address: 'София, Младост 3, бл. 386, ап. 41',
      landlord_lk: 'АА5027757', landlord_lk_date: '25.02.2025',
    }, issuer);
    const d = f['НАЕМОДАТЕЛ_ДАННИ_BG'];
    expect(d).toContain('Иво Лазаров Лазаров');
    expect(d).toContain('ЕГН 8112187262');
    expect(d).toContain('АА5027757');
    expect(d).not.toContain('207291184');   // ЕИК на фирмата
    expect(d).not.toContain('Скай Кепитъл'); // името на фирмата
  });
});
