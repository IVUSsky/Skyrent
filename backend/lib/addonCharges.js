// Helpers за интеграция на addon услугите във фактурите за наем

// Връща активните addon начисления за тенанта на даден имот (за избрания месец).
// Включва: monthly_price за всички активни абонаменти + deposit_amount за тези,
// които още нямат удържан депозит.
function getAddonChargesForProperty(db, propertyId, invoiceMonth) {
  // Намери активния наемател през активен договор за този имот
  const contract = db.prepare(`
    SELECT tenant_user_id FROM contracts
    WHERE property_id=? AND status='active' AND tenant_user_id IS NOT NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(propertyId);

  if (!contract) return { items: [], total: 0 };

  // Включваме само addons, които са прикачени към ТОЗИ имот, плюс legacy subs
  // без property_id (преди мulti-property scope-овете).
  const subs = db.prepare(`
    SELECT ta.*,
      s.name AS service_name, s.icon AS service_icon,
      s.monthly_price AS service_monthly_price,
      s.deposit_amount AS service_deposit_amount,
      s.currency
    FROM tenant_addons ta
    LEFT JOIN addon_services s ON s.id = ta.service_id
    WHERE ta.user_id = ?
      AND ta.status = 'active'
      AND (ta.property_id = ? OR ta.property_id IS NULL)
  `).all(contract.tenant_user_id, propertyId);

  const items = [];
  for (const sub of subs) {
    // Месечна такса
    if (sub.service_monthly_price > 0) {
      items.push({
        subscription_id: sub.id,
        service_id: sub.service_id,
        name: `${sub.service_icon || ''} ${sub.service_name}`.trim(),
        kind: 'monthly',
        amount: Number(sub.service_monthly_price),
      });
    }
    // Депозит (еднократно при първа фактура след активация)
    if (sub.service_deposit_amount > 0 && !sub.deposit_charged) {
      items.push({
        subscription_id: sub.id,
        service_id: sub.service_id,
        name: `${sub.service_icon || ''} ${sub.service_name} — депозит`.trim(),
        kind: 'deposit',
        amount: Number(sub.service_deposit_amount),
      });
    }
  }
  const total = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  return { items, total };
}

// Маркирай депозитите като удържани (при успешна вставка на фактура)
function markDepositsCharged(db, invoiceId, items) {
  const upd = db.prepare(`
    UPDATE tenant_addons SET deposit_charged=1, deposit_charged_invoice_id=? WHERE id=?
  `);
  for (const it of items) {
    if (it.kind === 'deposit' && it.subscription_id) {
      upd.run(invoiceId, it.subscription_id);
    }
  }
}

module.exports = { getAddonChargesForProperty, markDepositsCharged };
