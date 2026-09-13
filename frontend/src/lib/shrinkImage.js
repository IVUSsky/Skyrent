// Смаляване на снимки В БРАУЗЪРА преди качване.
//
// Поводът: качването работи от лаптоп, но не и от телефон. Сървърът приема до
// 10 MB, а кадър от съвременен телефон (Galaxy S24 Ultra в 50/200 MP) спокойно
// го надхвърля. Иронията е, че сървърът и без това смалява всяка снимка до
// 1600px / качество 80 (backend/lib/imageOptimize.js) — тоест голямата снимка
// се отхвърляше, за да бъде после... смалена.
//
// Смаляваме до същите параметри, така че не се губи нищо, което иначе би
// останало, а качването по мобилни данни е в пъти по-бързо.
//
// Проверено в реален браузър: 38.6 MB / 8160×6144 → 0.74 MB / 1600×1205.

export const MAX_DIM   = 1600
export const QUALITY   = 0.82
export const MAX_BYTES = 10 * 1024 * 1024
export const OK_EXT    = /\.(jpe?g|png|webp)$/i

/**
 * Смалява един файл, ако е JPEG и браузърът може да го декодира.
 * Всичко останало се връща непроменено — PNG/WEBP от телефон са редки и малки,
 * а HEIC браузърът не може да декодира: пращаме оригинала и оставяме сървъра
 * да отговори с ясното си съобщение.
 */
export async function shrinkImage(file, { maxDim = MAX_DIM, quality = QUALITY } = {}) {
  if (!file || !/^image\/jpe?g$/i.test(file.type)) return file
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
  try {
    // imageOrientation: без него EXIF ориентацията се губи при пренасянето през
    // canvas и снимките от телефон излизат легнали настрани.
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size <= MAX_BYTES) { bmp.close?.(); return file }

    const cv = document.createElement('canvas')
    cv.width  = Math.round(bmp.width * scale)
    cv.height = Math.round(bmp.height * scale)
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height)
    bmp.close?.()

    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

/** Смалява списък файлове. */
export const shrinkAll = (files) => Promise.all(Array.from(files || []).map(f => shrinkImage(f)))

/**
 * Проверява какво НЕ би минало през сървъра (същите правила като
 * backend/lib/uploadFilter.js) и връща готово съобщение на български.
 * Викай СЛЕД смаляването — иначе голяма снимка отпада, въпреки че после би
 * минала спокойно.
 */
export function describeRejected(files) {
  const list = Array.from(files || [])
  const wrongType = list.filter(f => !OK_EXT.test(f.name))
  const tooBig    = list.filter(f => OK_EXT.test(f.name) && f.size > MAX_BYTES)
  const ok        = list.filter(f => OK_EXT.test(f.name) && f.size <= MAX_BYTES)

  const problems = []
  if (wrongType.length) {
    const heic = wrongType.some(f => /\.(heic|heif)$/i.test(f.name))
    problems.push(
      `${wrongType.map(f => f.name).join(', ')} — приемат се само JPG, PNG и WEBP.` +
      (heic
        ? ' HEIC/HEIF е „високоефективният" формат на телефона. Изключи го от камерата — на Samsung: Настройки на камерата → Разширени опции за снимане → HEIF снимки; на iPhone: Настройки → Камера → Формати → „Най-съвместим".'
        : '')
    )
  }
  if (tooBig.length) {
    problems.push(`${tooBig.map(f => `${f.name} (${(f.size / 1048576).toFixed(1)} MB)`).join(', ')} — над 10 MB.`)
  }
  return { ok, message: problems.join(' ') }
}
