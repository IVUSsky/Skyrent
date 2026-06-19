// multer fileFilter — допуска само снимки (jpg/png/webp). Спира качване на
// .svg/.html/.xml и др., които при inline сервиране водят до stored XSS
// (скрипт в SVG краде JWT от localStorage на app.skycapital.pro).
// Проверява И mimetype, И разширение (двойна защита; клиентът контролира
// mimetype, затова и ext). Сервирането ползва nosniff за всеки случай.

const path = require('path');

const OK_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const OK_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function imagesOnly(req, file, cb) {
  const mime = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (OK_MIME.has(mime) && OK_EXT.has(ext)) return cb(null, true);
  cb(Object.assign(new Error('Разрешени са само снимки (JPG, PNG, WEBP)'), { status: 400, code: 'BAD_FILE_TYPE' }));
}

module.exports = { imagesOnly, OK_MIME, OK_EXT };
