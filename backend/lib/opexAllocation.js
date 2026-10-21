/**
 * Разпределение на общите разходи между имотите.
 *
 * Общите разходи (счетоводство, банкови такси, правни — всичко без property_id)
 * се разпределяха по дял от наема върху ВСИЧКИ имоти. Така всеки обект излизаше
 * с един и същ процент разходи спрямо наема си: и двустайният, и мазето.
 *
 * Това не е вярно. Гаражът, паркомястото, мазето и складът нямат наемател, с
 * когото да се води кореспонденция, нямат сметки за прехвърляне, нямат ремонти
 * и поддръжка. Иво: „гаражите имат само разходи за придобиване". Счетоводителят
 * и чистачката не са заради гаража.
 *
 * Затова общите разходи се разпределят само между жилищата, пак по дял от
 * наема. Сумата не се губи — това, което гаражите не носят, пада върху
 * апартаментите. Портфейлният опекс остава същият.
 */

// Типовете, които не носят общи разходи. Сравнява се по нормализиран низ,
// защото в базата стои и „Паркомясто", и „паркомясто", и „ПМ 19".
const ANCILLARY_PATTERNS = [
  'гараж', 'паркомясто', 'паркомяст', 'пм', 'мазе', 'склад', 'таван', 'сутерен',
];

/** Маха разредката и регистъра, за да се сравнява стабилно. */
const normalize = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Жилище ли е, или прилежащ обект? Неизвестен тип се брои за жилище — по-вероятно
 * е да е апартамент, а и жилищата са тези, които раждат общите разходи.
 */
function isAncillary(тип) {
  const t = normalize(тип);
  if (!t) return false;
  return ANCILLARY_PATTERNS.some(k => t === k || t.startsWith(k + ' ') || t.startsWith(k + '№')
    || t.startsWith(k + '.') || t === k + 'о' || t.includes(' ' + k));
}

/**
 * Тежестта на имота при разпределението на общите разходи.
 * properties.opex_share бие извода по тип: 0 = не носи нищо, 1 = носи пълен дял,
 * междинна стойност е възможна (например гараж, който все пак се чисти).
 */
function opexWeight(p) {
  if (p && p.opex_share != null && p.opex_share !== '') {
    const n = Number(p.opex_share);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return isAncillary(p && p['тип']) ? 0 : 1;
}

/**
 * Разпределя общите разходи по редовете. Връща Map(id → сума).
 *
 * Базата е наем × тежест. Ако никой ред няма тежест (например в портфейл само
 * от гаражи), пада обратно на чист дял от наема, за да не изчезнат пари.
 * Ако и наем няма — разделя поравно. Сборът винаги е равен на opexCommon.
 *
 * @param {Array<{id:number, rent_annual:number, тип?:string, opex_share?:number}>} rows
 * @param {number} opexCommon
 * @returns {Map<number, number>}
 */
function allocateCommonOpex(rows, opexCommon) {
  const out = new Map();
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length || !(opexCommon > 0)) {
    list.forEach(p => out.set(p.id, 0));
    return out;
  }

  let base = list.map(p => ({ id: p.id, w: (p.rent_annual || 0) * opexWeight(p) }));
  let total = base.reduce((s, x) => s + x.w, 0);

  if (total <= 0) {
    // Никой не носи тежест → по дял от наема, както беше.
    base = list.map(p => ({ id: p.id, w: p.rent_annual || 0 }));
    total = base.reduce((s, x) => s + x.w, 0);
  }
  if (total <= 0) {
    // Няма и наем → поравно, за да не се губи сумата.
    base = list.map(p => ({ id: p.id, w: 1 }));
    total = base.length;
  }

  for (const x of base) {
    out.set(x.id, Math.round((opexCommon * (x.w / total)) * 100) / 100);
  }
  return out;
}

module.exports = { allocateCommonOpex, opexWeight, isAncillary };
