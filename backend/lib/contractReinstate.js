// Възстановяване на прекратен договор — обратното на ⛔.
//
// Поводът: договорът на един наемател се оказа „Прекратен", защото при правенето
// на нов договор за същия имот старият е бил спрян, за да мине пазачът „един имот
// — един действащ договор". Обратен път нямаше: бутонът ✅ се показва само за
// чернова, а ✏️ редакцията не пуска `status`. Един грешен клик на ⛔ беше
// еднопосочен.
//
// Защо не просто `status='active'`:
//   1. ⛔ ПРЕЗАПИСВА `end_date` с датата на прекратяване — истинският край на
//      договора се губи, затова възстановяването приема дата;
//   2. ⛔ затваря отворения ред в историята на наемателите. Ако възстановяването
//      мине през обичайното активиране, се вмъква ВТОРИ ред за същия наемател и
//      имотът показва две различни наемания, залепени едно за друго.
//
// Историята се сравнява по име в JS, не в SQL — сравненията на кирилица в
// `WHERE` са ненадеждни в някои среди (виж CLAUDE.md).

const KIND_RENT = 'наем';

const isOpen = (row) => row.end_date === null || row.end_date === undefined || row.end_date === '';
const sameTenant = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// Връща историята на наемателите за имота в обратен ред (най-новото първо).
function historyFor(db, propertyId) {
  return db.prepare('SELECT * FROM tenant_history WHERE property_id=? ORDER BY id DESC').all(propertyId);
}

// Отменя затварянето, което ⛔ е направило: последният ред на този наемател се
// отваря отново вместо да се вмъква нов. Чужд отворен ред се затваря — имотът не
// може да е зает от двама едновременно.
function restoreTenantHistory(db, contract, endDate, today) {
  const rows = historyFor(db, contract.property_id);
  const mine = rows.filter(r => sameTenant(r.tenant_name, contract.tenant_name));

  let closed = 0;
  for (const r of rows) {
    if (isOpen(r) && !sameTenant(r.tenant_name, contract.tenant_name)) {
      db.prepare('UPDATE tenant_history SET end_date=? WHERE id=?').run(today, r.id);
      closed++;
    }
  }

  if (mine.some(isOpen)) return { history: 'kept', closed };

  if (mine.length) {
    db.prepare('UPDATE tenant_history SET end_date=? WHERE id=?').run(endDate, mine[0].id);
    return { history: 'reopened', closed };
  }

  db.prepare(`
    INSERT INTO tenant_history (property_id, tenant_name, start_date, end_date, monthly_rent, deposit, conditions, notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    contract.property_id, contract.tenant_name,
    contract.start_date || null, endDate,
    contract.monthly_rent, contract.deposit,
    contract.conditions || null, contract.notes || null,
  );
  return { history: 'inserted', closed };
}

// contract — редът ПРЕДИ възстановяването (status='terminated').
// opts.endDate — истинският край на договора; `undefined` пази текущия,
// празен низ/null го изчиства (безсрочен).
function reinstateContract(db, contract, opts = {}) {
  const kind = contract.kind || KIND_RENT;
  const today = new Date().toISOString().slice(0, 10);
  const endDate = opts.endDate === undefined ? (contract.end_date || null) : (opts.endDate || null);

  db.prepare(`
    UPDATE contracts
       SET status='active', terminated_at=NULL, end_date=?,
           activated_at=COALESCE(activated_at, datetime('now'))
     WHERE id=?
  `).run(endDate, contract.id);

  // Интернет договорът не пипа наема, заетостта и историята — както при
  // активирането (същият наемател плаща и наем на същия имот).
  if (!contract.property_id || kind !== KIND_RENT) return { history: 'skipped', closed: 0, endDate };

  db.prepare(`
    UPDATE properties
       SET наемател=?, наем=?, статус='✅', updated_at=CURRENT_TIMESTAMP
     WHERE id=?
  `).run(contract.tenant_name, contract.monthly_rent, contract.property_id);

  return { ...restoreTenantHistory(db, contract, endDate, today), endDate };
}

module.exports = { reinstateContract, restoreTenantHistory };
