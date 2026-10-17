// multer fileFilter — допуска само снимки. Спира качване на .svg/.html/.xml и
// др., които при inline сервиране водят до stored XSS (скрипт в SVG краде JWT
// от localStorage на app.skycapital.pro).
//
// Телефоните чупеха и трите правила на старата проверка:
//   · Android picker подава име БЕЗ разширение (Google Photos) → отказ;
//   · някои браузъри пишат mime `image/jpg` вместо `image/jpeg` → отказ;
//   · камерата снима в HEIC по подразбиране → отказ.
// Затова от компютър работеше, а от телефон не.
//
// Сега разширението за ЗАПИС се извежда от mimetype (safeExt), не от името,
// подадено от клиента. Така клиентът вече не може да избере опасно разширение —
// което беше истинската причина да се проверява и ext — и можем спокойно да
// приемем липсващо разширение.

const path = require('path');

// Нестандартни mime-ове, които реално идват от браузъри/телефони.
const MIME_ALIAS = {
  'image/jpg':   'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/heic-sequence': 'image/heic',
  'image/heif-sequence': 'image/heif',
};

// HEIC/HEIF се приемат и се конвертират до JPEG при оптимизацията
// (sharp 0.35 + libvips 8.18 четат HEIF). Файлът се записва още от начало с
// разширение .jpg — виж safeExt.
const EXT_FOR_MIME = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
  'image/heic': '.jpg',
  'image/heif': '.jpg',
};

const OK_MIME = new Set(Object.keys(EXT_FOR_MIME));
const OK_EXT  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);

function normalizeMime(m) {
  const x = String(m || '').toLowerCase().trim();
  return MIME_ALIAS[x] || x;
}

/** Разширение за запис — от mimetype, НЕ от името на клиента.
 *  Когато типът е неизвестен (Android „Файлове" дава octet-stream), падаме обратно
 *  към разширението от името — иначе PNG/WEBP биха се записали като .jpg и после
 *  на диска щеше да стои PNG под грешно име. Стойността пак минава през белия
 *  списък, тоест клиентът не може да избере произволно разширение. */
function safeExt(file) {
  const byMime = EXT_FOR_MIME[normalizeMime(file?.mimetype)];
  if (byMime) return byMime;
  const ext = path.extname(file?.originalname || '').toLowerCase();
  if (ext === '.heic' || ext === '.heif') return '.jpg';   // конвертира се при оптимизацията
  if (ext === '.jpeg') return '.jpg';
  return OK_EXT.has(ext) ? ext : '.jpg';
}

function reject() {
  return Object.assign(
    new Error('Разрешени са само снимки (JPG, PNG, WEBP, HEIC)'),
    { status: 400, code: 'BAD_FILE_TYPE' }
  );
}

// Типове, които файловият мениджър на Android дава, когато НЕ разпознава файла.
// HEIC е точно такъв случай: избран през „Файлове", той идва като octet-stream и
// старата проверка го отказваше, въпреки че .heic е позволено разширение.
const UNKNOWN_MIME = new Set(['application/octet-stream', 'binary/octet-stream', '']);

function imagesOnly(req, file, cb) {
  const mime = normalizeMime(file.mimetype);
  const ext = path.extname(file.originalname || '').toLowerCase();

  // Разширението може да липсва (Android picker) — приемаме, защото името за
  // запис се извежда от mimetype. Но ако ИМА разширение и то не е позволено →
  // отказ: подправен mimetype не трябва да прекара .svg покрай нас.
  if (ext && !OK_EXT.has(ext)) return cb(reject());

  // Неизвестен тип + позволено разширение → приемаме и оставяме съдържанието
  // да реши. Безопасно е: разширението вече е проверено срещу белия списък, а
  // optimizeImage/isDisplayable отказват файла, ако не е истинска снимка.
  if (UNKNOWN_MIME.has(mime)) {
    if (!ext) return cb(reject());        // нито тип, нито разширение — няма на какво да стъпим
    return cb(null, true);
  }

  if (!OK_MIME.has(mime)) return cb(reject());
  return cb(null, true);
}

module.exports = { imagesOnly, safeExt, normalizeMime, OK_MIME, OK_EXT, EXT_FOR_MIME };
