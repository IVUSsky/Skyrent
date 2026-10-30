// Освобождаване на имота при прекратен договор — обратното на активирането.
//
// Поводът: пътят НАВЪТРЕ беше автоматичен, пътят НАВЪН — не. Активирането пише
// наемателя в имота (routes/contracts.js, „Update property"), а публичният
// каталог крие всеки имот с непразен `наемател` (routes/public.js — „отдаден →
// не се показва"). ⛔ обаче не чистеше името, затова обявата оставаше скрита,
// докато името не се изтрие на ръка от 🏢 Имоти. Тук е липсващата половина.
//
// Какво НЕ се пипа и защо:
//   • `published` — това е трайното решение на собственика „този имот се
//     рекламира". Прекратяването на договор не е повод да вкараме нов имот в
//     публичния каталог (той е общ за всички организации). Обявата се връща
//     сама само за имот, който вече е бил пускан.
//   • `наем` — това е исканият наем и се показва в обявата. Нулирането му би
//     извадило обява за „0 €".
//   • `статус` — '✅' значи „имотът е в играта", не „зает". Заетостта се чете
//     като статус ✅ И непразен наемател (виж routes/properties.js). Свалянето
//     на статуса би извадило имота от метриките на портфейла.

// Имот с друг действащ договор не е свободен. Случаят е реален: интернет
// договорът записва наемателя в имота, когато няма действащ наемен договор —
// ако наемният отпадне, а интернетът тече, името трябва да си остане.
function hasOtherActiveContract(db, propertyId, contractId) {
  return !!db.prepare(
    "SELECT 1 FROM contracts WHERE property_id=? AND status='active' AND id<>?"
  ).get(propertyId, contractId);
}

// Връща { released, reason?, published, photos } — достатъчно, за да каже
// интерфейсът какво точно е станало, вместо да обещава обява, която няма да се
// появи (PATCH /publish връща ОК и когато обявата остава скрита).
function releaseProperty(db, contract) {
  if (!contract.property_id) return { released: false, reason: 'no_property' };

  const prop = db.prepare('SELECT id, published, наемател FROM properties WHERE id=?')
    .get(contract.property_id);
  if (!prop) return { released: false, reason: 'no_property' };

  if (hasOtherActiveContract(db, contract.property_id, contract.id)) {
    return { released: false, reason: 'other_active_contract' };
  }

  // Телефонът и имейлът също са на наемателя — активирането ги записва заедно с
  // името. Оставени, те висят като контакт на свободен имот.
  db.prepare(`
    UPDATE properties
       SET наемател='', телефон=NULL, email=NULL, updated_at=CURRENT_TIMESTAMP
     WHERE id=?
  `).run(prop.id);

  let photos = 0;
  try {
    photos = db.prepare('SELECT COUNT(*) AS n FROM property_photos WHERE property_id=?')
      .get(prop.id).n;
  } catch (_) { photos = 0; }

  return { released: true, published: !!prop.published, photos };
}

module.exports = { releaseProperty, hasOtherActiveContract };
