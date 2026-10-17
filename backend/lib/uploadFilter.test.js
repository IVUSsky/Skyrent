// Качването на снимки от телефон чупеше правилата многократно (виж коментара в
// uploadFilter.js). Тестът заковава поведението: кое минава, кое не и с какво
// разширение се записва — за да не се върне някой от старите откази.

const { imagesOnly, safeExt } = require('./uploadFilter');

function check(file) {
  let err = null;
  imagesOnly({}, file, (e) => { err = e || null; });
  return err;
}

describe('imagesOnly', () => {
  it('приема HEIC от Android „Файлове" (octet-stream + .heic)', () => {
    const file = { mimetype: 'application/octet-stream', originalname: 'IMG_2026.heic' };
    expect(check(file)).toBe(null);
    expect(safeExt(file)).toBe('.jpg');   // конвертира се при оптимизацията
  });

  it('приема HEIC с коректен mimetype', () => {
    expect(check({ mimetype: 'image/heic', originalname: 'IMG.heic' })).toBe(null);
  });

  it('приема HEIC-sequence (псевдоним)', () => {
    expect(check({ mimetype: 'image/heic-sequence', originalname: 'IMG.heic' })).toBe(null);
  });

  it('приема име без разширение (Android picker)', () => {
    const file = { mimetype: 'image/jpeg', originalname: 'image' };
    expect(check(file)).toBe(null);
    expect(safeExt(file)).toBe('.jpg');
  });

  it('приема image/jpg (нестандартен, но реален)', () => {
    expect(check({ mimetype: 'image/jpg', originalname: 'a.jpg' })).toBe(null);
  });

  it('пази разширението при неизвестен тип, вместо да прави всичко .jpg', () => {
    expect(safeExt({ mimetype: 'application/octet-stream', originalname: 'x.png' })).toBe('.png');
    expect(safeExt({ mimetype: 'application/octet-stream', originalname: 'x.webp' })).toBe('.webp');
    expect(safeExt({ mimetype: 'application/octet-stream', originalname: 'x.jpeg' })).toBe('.jpg');
  });

  // Същината на защитата: inline сервиран SVG изпълнява скрипт и краде JWT.
  it('отказва SVG, дори маскиран като octet-stream', () => {
    expect(check({ mimetype: 'application/octet-stream', originalname: 'evil.svg' })).toBeTruthy();
    expect(check({ mimetype: 'image/svg+xml', originalname: 'evil.svg' })).toBeTruthy();
  });

  it('отказва HTML и PDF', () => {
    expect(check({ mimetype: 'application/octet-stream', originalname: 'x.html' })).toBeTruthy();
    expect(check({ mimetype: 'application/pdf', originalname: 'doc.pdf' })).toBeTruthy();
  });

  it('отказва неизвестен тип БЕЗ разширение — няма на какво да стъпи', () => {
    expect(check({ mimetype: 'application/octet-stream', originalname: 'noext' })).toBeTruthy();
  });

  it('отказът носи код за разпознаване от маршрута', () => {
    const err = check({ mimetype: 'application/pdf', originalname: 'doc.pdf' });
    expect(err.code).toBe('BAD_FILE_TYPE');
    expect(err.status).toBe(400);
  });
});
