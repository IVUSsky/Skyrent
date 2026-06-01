// Простичка класификация: жилищен имот vs складов (гараж/мазе)
// Ползва се за филтриране на addon услугите към tenant портала.

function getPropertyScope(тип) {
  const t = (тип || '').toLowerCase().trim();
  if (!t) return 'residential';
  // BG + EN варианти; стопански единици са 'storage'
  const storageWords = ['гараж', 'мазе', 'склад', 'паркомясто', 'парко', 'garage', 'basement', 'storage', 'cellar', 'parking'];
  if (storageWords.some(w => t.includes(w))) return 'storage';
  return 'residential';
}

module.exports = { getPropertyScope };
