// Числа с думи на английски. Поводът: двуезичният договор излизаше с
// „a security deposit of 1100,00 EUR (хиляда и сто EUR)" — и сумата с думи,
// и форматът на числото бяха български.
const { enThreeDigits, enIntToWords, amountToWordsEN, fmtAmountEN } = require('./enWords');

describe('цели числа', () => {
  it.each([
    [0, 'zero'], [7, 'seven'], [12, 'twelve'], [20, 'twenty'], [24, 'twenty-four'],
    [100, 'one hundred'], [101, 'one hundred and one'], [115, 'one hundred and fifteen'],
    [667, 'six hundred and sixty-seven'], [1000, 'one thousand'],
    [1100, 'one thousand one hundred'], [1150, 'one thousand one hundred and fifty'],
    [1234, 'one thousand two hundred and thirty-four'],
    [1000000, 'one million'],
  ])('%i → %s', (n, w) => expect(enIntToWords(n)).toBe(w));

  it('британското „and" го има — договор, не счетоводна таблица', () => {
    expect(enThreeDigits(101)).toBe('one hundred and one');
    expect(enThreeDigits(100)).toBe('one hundred');
  });
});

describe('суми с думи', () => {
  it('кръгла сума е само числото — бланката слага валутата', () => {
    expect(amountToWordsEN(1100)).toBe('one thousand one hundred');
  });

  // „one thousand one hundred and fifty cents" се чете като 1150.
  it('стотинките са дроб, за да не се бъркат с числото', () => {
    expect(amountToWordsEN(1100.5)).toBe('one thousand one hundred and 50/100');
    expect(amountToWordsEN(25.98)).toBe('twenty-five and 98/100');
  });

  it('1150,00 и 1100,50 се четат различно', () => {
    expect(amountToWordsEN(1150)).not.toBe(amountToWordsEN(1100.5));
  });

  it('едноцифрени стотинки са с водеща нула', () => {
    expect(amountToWordsEN(10.05)).toBe('ten and 05/100');
  });

  it('не закръгля стотинките', () => {
    expect(amountToWordsEN(25.98)).toContain('98/100');
    expect(amountToWordsEN(25.98)).not.toContain('twenty-six');
  });

  it('нула и отрицателно не чупят', () => {
    expect(amountToWordsEN(0)).toBe('zero');
    expect(amountToWordsEN(-5)).toBe('five');
    expect(amountToWordsEN(null)).toBe('zero');
  });
});

describe('формат на числото', () => {
  it('английската половина иска 1,100.00, не 1100,00', () => {
    expect(fmtAmountEN(1100)).toBe('1,100.00');
    expect(fmtAmountEN(667.5)).toBe('667.50');
  });
});
