// Числата с думи стоят в договора до цифрите и служат за проверка при спор —
// „1000,00 EUR (1000 EUR)" не върши тази работа.
const { bgIntToWords, amountToWords, amountToWordsBG } = require('./bgWords');

describe('цели числа с думи', () => {
  it('стотиците са по правилото, не „ста" за всичко', () => {
    expect(bgIntToWords(300)).toBe('триста');
    expect(bgIntToWords(400)).toBe('четиристотин');
    expect(bgIntToWords(500)).toBe('петстотин');
    expect(bgIntToWords(600)).toBe('шестстотин');
    expect(bgIntToWords(900)).toBe('деветстотин');
  });

  it('наемът 667 вече не е „шестста"', () => {
    expect(bgIntToWords(667)).toBe('шестстотин шестдесет и седем');
  });

  it('хилядите не падат обратно на цифри', () => {
    expect(bgIntToWords(1000)).toBe('хиляда');
    expect(bgIntToWords(2000)).toBe('две хиляди');
    expect(bgIntToWords(1300)).toBe('хиляда и триста');
    expect(bgIntToWords(2500)).toBe('две хиляди и петстотин');
    expect(bgIntToWords(1250)).toBe('хиляда двеста и петдесет');
    expect(bgIntToWords(1305)).toBe('хиляда триста и пет');
    expect(bgIntToWords(1001)).toBe('хиляда и едно');
  });

  it('милионите се броят в мъжки род', () => {
    expect(bgIntToWords(1000000)).toBe('един милион');
    expect(bgIntToWords(2000000)).toBe('два милиона');
  });

  it('нулата си е нула', () => {
    expect(bgIntToWords(0)).toBe('нула');
  });
});

describe('суми в договор', () => {
  it('кръглата сума е без стотинки', () => {
    expect(amountToWords(667)).toBe('шестстотин шестдесет и седем');
    expect(amountToWords(1000)).toBe('хиляда');
  });

  it('интернет таксата не се закръгля нагоре', () => {
    expect(amountToWords(25.98)).toBe('двадесет и пет и деветдесет и осем цента');
  });

  it('празната стойност е нула', () => {
    expect(amountToWords(0)).toBe('нула');
    expect(amountToWords(null)).toBe('нула');
  });
});

describe('словом във фактура', () => {
  it('пази стария изказ със стотинки в цифри', () => {
    expect(amountToWordsBG(555.83)).toBe('петстотин петдесет и пет евро и 83 евроцента');
    expect(amountToWordsBG(1300)).toBe('хиляда и триста евро и 00 евроцента');
    expect(amountToWordsBG(0.83)).toBe('нула евро и 83 евроцента');
  });
});
