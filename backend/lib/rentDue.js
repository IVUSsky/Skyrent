// Закъснял ли е наемът, или просто още не е дошъл падежът.
//
// Списъкът „Не са платили" слагаше ❌ на всички неплатени, включително на
// наематели, чийто ден на плащане още не е настъпил (Стефан плаща към 15-о,
// Атанас към 18-о, Атанасов със Stripe към 17-о). На 7 октомври всички те
// излизаха като длъжници и Иво ги гонеше без причина.

// dueDay: ден от договора (по подразбиране 5)
// month: 'ГГГГ-ММ' за който гледаме; today: дата
function isOverdue(month, dueDay = 5, today = new Date()) {
  const d = Math.min(28, Math.max(1, Number(dueDay) || 5));
  const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  if (month < cur) return true;            // минал месец — винаги закъснение
  if (month > cur) return false;           // бъдещ месец — няма как да е закъснял
  return today.getDate() > d;              // текущият месец: след падежа
}

// Денят на плащане по активния наемен договор на имота
function dueDayMap(db) {
  const map = {};
  try {
    const rows = db.prepare(`
      SELECT property_id, payment_day
        FROM contracts
       WHERE status='active' AND property_id IS NOT NULL AND COALESCE(kind,'наем')='наем'
       ORDER BY created_at DESC
    `).all();
    for (const r of rows) if (map[r.property_id] == null && r.payment_day) map[r.property_id] = r.payment_day;
  } catch { /* няма таблица */ }
  return map;
}

module.exports = { isOverdue, dueDayMap };
