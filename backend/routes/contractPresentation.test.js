import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { buildFields } = require('./contracts.js');

const issuer = {
  name: 'Скай Кепитъл ООД', eik: '207291184', mol: 'Иво Лазаров',
  address: 'София, Младост 3, бл. 386', iban: 'BG75PRCB92301053911901',
};

const base = { monthly_rent: 680, deposit: 1360, currency: 'EUR', payment_day: 5 };

describe('описание на имота', () => {
  // Бланката редеше описание/адрес/площ с твърди запетаи: празното описание
  // оставяше члена да започва със запетая, а „кв.м.“ + точката на изречението
  // даваше „65 кв.м..“.
  it('празно описание не оставя водеща запетая', () => {
    const f = buildFields({ ...base, property_description: '', property_address: 'Мл.1 бл.64 ап.142', property_area: 65 }, issuer);
    expect(f['ИМОТ_ПЪЛНО_ОПИСАНИЕ']).toBe('Мл.1 бл.64 ап.142, с обща площ 65 кв.м');
    expect(f['ИМОТ_ПЪЛНО_ОПИСАНИЕ']).not.toMatch(/^,/);
  });

  it('площта не носи точка, за да не стане „кв.м..“', () => {
    const f = buildFields({ ...base, property_area: 65, property_address: 'адрес' }, issuer);
    expect(f['ИМОТ_ПЪЛНО_ОПИСАНИЕ'] + '.').not.toContain('..');
  });

  it('с описание излиза пълният ред', () => {
    const f = buildFields({ ...base, property_description: 'Двустаен апартамент', property_address: 'Мл.1 бл.64 ап.142', property_area: 65 }, issuer);
    expect(f['ИМОТ_ПЪЛНО_ОПИСАНИЕ']).toBe('Двустаен апартамент, Мл.1 бл.64 ап.142, с обща площ 65 кв.м');
  });

  it('без площ не увисва „с обща площ“', () => {
    const f = buildFields({ ...base, property_description: 'Гараж', property_address: 'Мл.1 бл.64', property_area: null }, issuer);
    expect(f['ИМОТ_ПЪЛНО_ОПИСАНИЕ']).toBe('Гараж, Мл.1 бл.64');
  });
});
