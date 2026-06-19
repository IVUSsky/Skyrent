// Компресия/resize на качени снимки на място (overwrite). Цел: безплатният tier
// (и платените) да не трупат некомпресирани телефонни снимки (~2.5 MB → ~0.3 MB).
// Безопасно: пропуска неподдържани/повредени файлове без да чупи качването,
// и заменя файла само ако новият е реално по-малък. Запазва формата (ext остава
// валиден); jpeg по подразбиране (с mozjpeg).

const fs = require('fs');
const path = require('path');

const RASTER = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Лениво зареждане на sharp — НЕ при require (за да не може повредена native
// зависимост да събори целия сървър при старт). Кешира резултата.
let _sharp;
let _sharpTried = false;
function getSharp() {
  if (_sharpTried) return _sharp;
  _sharpTried = true;
  try { _sharp = require('sharp'); }
  catch (e) { console.warn('[imageOptimize] sharp недостъпен — компресията е изключена:', e.message); _sharp = null; }
  return _sharp;
}

async function optimizeImage(filepath, { maxDim = 1600, quality = 80 } = {}) {
  try {
    const sharp = getSharp();
    if (!sharp) return null;
    if (!fs.existsSync(filepath)) return null;
    const ext = path.extname(filepath).toLowerCase();
    if (!RASTER.has(ext)) return null;

    const meta = await sharp(filepath).metadata();
    if (!meta.width || !meta.height) return null;

    let pipe = sharp(filepath, { failOn: 'none' }).rotate(); // спазва EXIF ориентация
    if (meta.width > maxDim || meta.height > maxDim) {
      pipe = pipe.resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true });
    }
    if (meta.format === 'png') pipe = pipe.png({ compressionLevel: 9, palette: true });
    else if (meta.format === 'webp') pipe = pipe.webp({ quality });
    else pipe = pipe.jpeg({ quality, mozjpeg: true });

    const tmp = filepath + '.opt';
    await pipe.toFile(tmp);
    const oldSize = fs.statSync(filepath).size;
    const newSize = fs.statSync(tmp).size;
    if (newSize < oldSize) fs.renameSync(tmp, filepath);
    else fs.unlinkSync(tmp);
    return { oldSize, newSize: Math.min(oldSize, newSize), saved: Math.max(0, oldSize - newSize) };
  } catch (e) {
    console.warn('[imageOptimize] пропуснат', path.basename(filepath), '—', e.message);
    return null;
  }
}

// Оптимизира няколко файла (тихо, best-effort).
async function optimizeMany(filepaths, opts) {
  for (const fp of filepaths) { try { await optimizeImage(fp, opts); } catch (_) {} }
}

// Дали sharp е достъпен (за health диагностика).
function sharpAvailable() { return !!getSharp(); }

module.exports = { optimizeImage, optimizeMany, sharpAvailable };
