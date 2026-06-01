// Бизнес логика за интернет акаунтите, общо ползвана от tenant routes и webhook-а.

const crypto = require('crypto');

function genUsername(userId) {
  // user-<id>-<short> — стабилно и сравнително четимо
  return `user-${userId}-${crypto.randomBytes(2).toString('hex')}`;
}
function genPassword() {
  // 12 знака, лесни за писане (без 0/O/l/1)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return out;
}

// Намира съществуващия акаунт или създава нов. Връща пълния запис.
function getOrCreateAccount(db, userId, propertyId) {
  let acc = db.prepare('SELECT * FROM internet_accounts WHERE user_id=?').get(userId);
  if (acc) return acc;
  const username = genUsername(userId);
  const password = genPassword();
  const r = db.prepare(`
    INSERT INTO internet_accounts (user_id, property_id, username, password, status)
    VALUES (?, ?, ?, ?, 'inactive')
  `).run(userId, propertyId || null, username, password);
  return db.prepare('SELECT * FROM internet_accounts WHERE id=?').get(r.lastInsertRowid);
}

// Удължава валидността на акаунта с N дни от max(now, current valid_until).
// Връща новия valid_until (ISO string).
function extendAccount(db, accountId, days) {
  const acc = db.prepare('SELECT * FROM internet_accounts WHERE id=?').get(accountId);
  if (!acc) throw new Error('account not found');
  const now = new Date();
  let from = now;
  if (acc.valid_until) {
    const cur = new Date(acc.valid_until + (acc.valid_until.endsWith('Z') ? '' : 'Z'));
    if (cur > from) from = cur;
  }
  const newEnd = new Date(from.getTime() + days * 86_400_000);
  const validFromIso = (acc.valid_from && new Date(acc.valid_from) < now) ? acc.valid_from : now.toISOString();
  db.prepare(`
    UPDATE internet_accounts SET valid_from=?, valid_until=?, status='active' WHERE id=?
  `).run(validFromIso, newEnd.toISOString(), accountId);
  return newEnd.toISOString();
}

// Прилага платена покупка — повиква се от Stripe webhook когато session приключи.
function applyPurchase(db, purchaseId) {
  const p = db.prepare('SELECT * FROM internet_purchases WHERE id=?').get(purchaseId);
  if (!p) throw new Error('purchase not found');
  if (p.applied_at) return p; // идемпотентно

  const acc = db.prepare('SELECT * FROM internet_accounts WHERE id=?').get(p.account_id);
  if (!acc) throw new Error('account not found');

  const from = new Date();
  let actualFrom = from;
  if (acc.valid_until) {
    const cur = new Date(acc.valid_until + (acc.valid_until.endsWith('Z') ? '' : 'Z'));
    if (cur > actualFrom) actualFrom = cur;
  }
  const newEnd = new Date(actualFrom.getTime() + p.duration_days * 86_400_000);

  db.prepare(`
    UPDATE internet_purchases
    SET applied_at=datetime('now'), valid_from=?, valid_until=?
    WHERE id=?
  `).run(actualFrom.toISOString(), newEnd.toISOString(), purchaseId);

  db.prepare(`
    UPDATE internet_accounts
    SET valid_from=COALESCE(valid_from, ?),
        valid_until=?,
        total_paid=COALESCE(total_paid, 0) + ?,
        status='active'
    WHERE id=?
  `).run(actualFrom.toISOString(), newEnd.toISOString(), p.amount || 0, p.account_id);

  return db.prepare('SELECT * FROM internet_purchases WHERE id=?').get(purchaseId);
}

module.exports = { genUsername, genPassword, getOrCreateAccount, extendAccount, applyPurchase };
