// Тестове на филтъра за качване (lib/uploadFilter.js).
//
// Поводът: качването на снимки работеше от компютър, но не и от телефон.
// Съобщението беше „Разрешени са само снимки (JPG, PNG, WEBP)". Проверено
// срещу production — три различни неща, които телефонът праща, падаха:
//   · име БЕЗ разширение (Android picker / Google Photos)
//   · mime `image/jpg` вместо `image/jpeg`
//   · .heic от камерата
const { imagesOnly, safeExt, normalizeMime } = require('./uploadFilter');

const check = (originalname, mimetype) => {
  let result;
  imagesOnly({}, { originalname, mimetype }, (err, ok) => {
    result = err ? { ok: false, code: err.code } : { ok: !!ok };
  });
  return result;
};

describe('какво се приема за качване', () => {
  it('обикновен JPEG', () => expect(check('lk.jpg', 'image/jpeg').ok).toBe(true));
  it('PNG и WEBP', () => {
    expect(check('a.png', 'image/png').ok).toBe(true);
    expect(check('a.webp', 'image/webp').ok).toBe(true);
  });

  it('име БЕЗ разширение — Android picker', () => {
    expect(check('1000012345', 'image/jpeg').ok).toBe(true);
    expect(check('image', 'image/jpeg').ok).toBe(true);
  });

  it('нестандартният mime image/jpg', () => {
    expect(check('a.jpg', 'image/jpg').ok).toBe(true);
    expect(check('a.jpg', 'image/pjpeg').ok).toBe(true);
  });

  it('HEIC от камерата на телефона', () => {
    expect(check('IMG_0001.heic', 'image/heic').ok).toBe(true);
    expect(check('IMG_0001.HEIF', 'image/heif').ok).toBe(true);
  });

  it('главни букви и кирилица в името', () => {
    expect(check('IMG_20260913.JPG', 'image/jpeg').ok).toBe(true);
    expect(check('снимка.jpg', 'image/jpeg').ok).toBe(true);
  });
});

describe('какво продължава да се отказва', () => {
  it('SVG — векторът носи скрипт (stored XSS)', () => {
    expect(check('a.svg', 'image/svg+xml')).toEqual({ ok: false, code: 'BAD_FILE_TYPE' });
  });

  it('HTML и PDF', () => {
    expect(check('a.html', 'text/html').ok).toBe(false);
    expect(check('a.pdf', 'application/pdf').ok).toBe(false);
  });

  it('подправен mime + опасно разширение — двойната защита държи', () => {
    expect(check('evil.svg', 'image/jpeg').ok).toBe(false);
    expect(check('evil.html', 'image/png').ok).toBe(false);
  });

  it('липсващ mime', () => expect(check('a.jpg', '').ok).toBe(false));
});

describe('разширението за запис се извежда от mimetype', () => {
  it('клиентът не избира разширението', () => {
    // Дори името да е .svg, записът пак е .jpg — затова липсващото разширение
    // може да се приема, без да отслабва защитата.
    expect(safeExt({ mimetype: 'image/jpeg' })).toBe('.jpg');
    expect(safeExt({ mimetype: 'image/png' })).toBe('.png');
    expect(safeExt({ mimetype: 'image/webp' })).toBe('.webp');
  });

  it('HEIC се записва като .jpg — съдържанието се конвертира', () => {
    expect(safeExt({ mimetype: 'image/heic' })).toBe('.jpg');
    expect(safeExt({ mimetype: 'image/heif' })).toBe('.jpg');
  });

  it('непознат mime → .jpg по подразбиране', () => {
    expect(safeExt({ mimetype: 'нещо/друго' })).toBe('.jpg');
    expect(safeExt({})).toBe('.jpg');
  });

  it('нормализира нестандартните mime-ове', () => {
    expect(normalizeMime('IMAGE/JPG')).toBe('image/jpeg');
    expect(normalizeMime(' image/x-png ')).toBe('image/png');
  });
});
