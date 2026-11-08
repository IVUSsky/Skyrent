// Преместване на договор от един имот на друг.
//
// Досега беше невъзможно: `property_id` не е сред редактируемите полета, а
// при внасяне от архив договорът можеше да се закачи за грешен апартамент.
// Намерено на 08.11.2026: два договора на един имот, докато съседният —
// отделно жилище на същия адрес — стоеше без нито един.
//
// Преместването не е безобидно: по имота се водят наемът, фактурите и
// напомнянията. Затова тук е и преградата — договор не влиза при друг
// действащ договор със застъпващ се период, иначе поправката на една
// грешка ражда същата грешка отсреща.

const overlaps = (a, b) => {
  const as = a.start_date || '', ae = a.end_date || '9999-12-31';
  const bs = b.start_date || '', be = b.end_date || '9999-12-31';
  return as <= be && bs <= ae;
};

/**
 * @param {object} contract  договорът, който местим
 * @param {object|null} target  целевият имот (null = няма такъв)
 * @param {object[]} activeThere  действащите договори на целевия имот
 * @returns {{ok:true}|{ok:false,error:string}}
 */
function canMove(contract, target, activeThere = []) {
  if (!contract) return { ok: false, error: 'Договорът не е намерен' };
  if (!target) return { ok: false, error: 'Имотът не е намерен' };
  if (String(contract.property_id) === String(target.id)) {
    return { ok: false, error: 'Договорът вече е на този имот' };
  }
  if (String(contract.status || '').toLowerCase() === 'active') {
    const clash = activeThere.find(c => String(c.id) !== String(contract.id) && overlaps(contract, c));
    if (clash) {
      return {
        ok: false,
        error: `В „${target['адрес'] || 'имота'}" вече има действащ договор за същия период`
             + ` (${String(clash.tenant_name || '').trim() || 'без име'},`
             + ` ${clash.start_date || '?'}–${clash.end_date || 'безсрочен'}).`
             + ' Прекрати или премести него първо.',
      };
    }
  }
  return { ok: true };
}

// Какво да пише в бележките, за да личи, че договорът е местен и защо.
function moveNote(contract, from, target, when = new Date()) {
  const d = when.toISOString().slice(0, 10);
  const fromName = (from && from['адрес']) || (contract.property_id ? 'имот ' + contract.property_id : 'без имот');
  const toName = target['адрес'] || ('имот ' + target.id);
  return `${(contract.notes || '').trim()}${contract.notes ? '\n' : ''}· ${d}: преместен от „${fromName}" в „${toName}"`.trim();
}

module.exports = { canMove, moveNote, overlaps };
