// Преобразуване на HEIC/HEIF до JPEG В БРАУЗЪРА, преди качване.
//
// ЗАЩО не на сървъра: libvips там чете HEIF контейнер, но НЕ разкодира HEVC —
// кодекът, с който снимат телефоните („heifsave: Unsupported compression“,
// проверено 17.10.2026). Регистрираният формат „heif“ в /api/health подвежда:
// означава само, че контейнерът е познат. Затова файлът трябва да стигне до
// сървъра вече като JPEG.
//
// heic2any е libheif, компилиран до WebAssembly (~2.7 MB) — зарежда се ЛЕНИВО,
// само когато наистина има HEIC файл, за да не тежи на всяко отваряне.

const HEIC_EXT = /\.(heic|heif)$/i;
const HEIC_MIME = /^image\/(heic|heif)(-sequence)?$/i;

/** Файлът HEIC ли е — по тип ИЛИ по разширение (Android „Файлове“ дава octet-stream). */
export function isHeic(file) {
  if (!file) return false;
  return HEIC_MIME.test(file.type || '') || HEIC_EXT.test(file.name || '');
}

/**
 * Преобразува един HEIC файл до JPEG. Не-HEIC файлове се връщат непокътнати.
 * При неуспех връща оригинала — сървърът ще откаже с ясно съобщение, което е
 * по-добре от мълчаливо изгубена снимка.
 */
export async function heicToJpeg(file, { quality = 0.85 } = {}) {
  if (!isHeic(file)) return file;
  try {
    const { default: heic2any } = await import('heic2any');
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality });
    const out = Array.isArray(blob) ? blob[0] : blob;   // живи снимки дават няколко кадъра
    const name = (file.name || 'photo').replace(HEIC_EXT, '') + '.jpg';
    return new File([out], name, { type: 'image/jpeg', lastModified: file.lastModified || Date.now() });
  } catch (err) {
    console.warn('[heic] неуспешно преобразуване на', file.name, '—', err?.message || err);
    return file;
  }
}

/**
 * Преобразува списък файлове (от <input type="file">). Връща масив File.
 * `onProgress(done, total)` се вика само когато има какво да се преобразува —
 * WASM-ът отнема секунда-две на снимка и потребителят трябва да вижда, че става нещо.
 */
export async function convertHeicFiles(fileList, onProgress) {
  const files = Array.from(fileList || []);
  const heicCount = files.filter(isHeic).length;
  if (!heicCount) return files;

  const out = [];
  let done = 0;
  for (const f of files) {
    out.push(await heicToJpeg(f));
    if (isHeic(f) && onProgress) onProgress(++done, heicCount);
  }
  return out;
}
