// Снимките в PDF-а се вграждат в размера, в който се ПОКАЗВАТ.
//
// Поводът: `doc.image(path, …, { fit: [255, 170] })` на pdfkit смалява картината
// визуално, но вгражда ФАЙЛА както си е. Снимка от телефон е 1600–2500 px, а
// мястото в решетката е ~255 pt (3.5 см). За ап. 5 това значеше протокол с 48
// снимки от десетки мегабайти — документ, който не може да се прати по пощата.
//
// Тук всяка снимка се прекодира веднъж до ширината, която ѝ трябва, и в PDF-а
// влиза буфер. Нищо не се изхвърля — всички снимки остават в протокола.
//
// 200 DPI при 255 pt ≈ 700 px. Над това разликата не се вижда на хартия.
const path = require('path');
const fs = require('fs');

let sharp = null;
try { sharp = require('sharp'); } catch (_) { /* без sharp падаме на оригинала */ }

const PHOTO_WIDTH = 700;   // решетката „снимков материал" — 2 на ред
const THUMB_WIDTH = 160;   // миниатюрата до артикул от описа

// Връща Map: абсолютен път → Buffer. Път, който не може да се прекодира
// (липсващ файл, счупен формат, липсващ sharp), НЕ влиза в картата и
// извикващият остава на оригиналния файл — по-тежко, но се показва.
async function preparePdfImages(absPaths, width = PHOTO_WIDTH) {
  const out = new Map();
  if (!sharp) return out;
  for (const p of [...new Set(absPaths)]) {
    try {
      if (!fs.existsSync(p)) continue;
      const buf = await sharp(p, { unlimited: true })
        .rotate()                                  // спазва EXIF — иначе лежи настрани
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();
      out.set(p, buf);
    } catch (_) { /* остава оригиналът */ }
  }
  return out;
}

// Какво да подадем на doc.image(): буфера, ако го има, иначе пътя.
const pickImage = (map, absPath) => (map && map.get(absPath)) || absPath;

// Събира пътищата, които протоколът ще вгради: снимките на имота + по една
// миниатюра на артикул от описа.
function protocolImagePaths({ photos = [], inventory = [], photosDir, inventoryDir }) {
  const grid = photos.map(p => path.join(photosDir, p.filename));
  const thumbs = inventory
    .map(it => (it.photos || []).find(f => f.type === 'photo'))
    .filter(Boolean)
    .map(f => path.join(inventoryDir, f.filename));
  return { grid, thumbs };
}

module.exports = { preparePdfImages, pickImage, protocolImagePaths, PHOTO_WIDTH, THUMB_WIDTH };
