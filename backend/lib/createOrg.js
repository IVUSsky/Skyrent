// Споделена логика за провизиране на организация (Phase 2).
// Ползва се от /api/auth/signup (закрита бета) и /api/platform/orgs (superadmin).
const bcrypt = require('bcryptjs');

/**
 * Създава организация + owner admin акаунт.
 * @returns {{ organization_id, owner_user_id }}
 * @throws Error с .status за HTTP кода (400 при валидация)
 */
function createOrg(controlDb, getOrgDb, { name, owner_username, owner_password, owner_email, owner_name, plan = 'trial' }) {
  if (!name || !String(name).trim()) { const e = new Error('Името на организацията е задължително'); e.status = 400; throw e; }
  if (!owner_username || !owner_password) { const e = new Error('owner_username и owner_password са задължителни'); e.status = 400; throw e; }
  if (String(owner_password).length < 8) { const e = new Error('Паролата трябва да е поне 8 знака'); e.status = 400; throw e; }
  if (controlDb.prepare('SELECT id FROM users WHERE username=? OR (email != \'\' AND LOWER(email)=LOWER(?))').get(owner_username, owner_email || '')) {
    const e = new Error('Потребителското име или имейлът вече са заети'); e.status = 400; throw e;
  }

  const trialEnds = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const orgR = controlDb.prepare("INSERT INTO organizations (name, status, plan, trial_ends_at) VALUES (?, 'active', ?, ?)")
    .run(String(name).trim(), plan, trialEnds);
  const orgId = Number(orgR.lastInsertRowid);

  const orgDb = getOrgDb(orgId); // създава orgs/<id>.db + tenant миграции (празна структура, без seed)

  // White-label (Phase 4): issuer.name = името на организацията → PDF фактури/
  // договори, имейли и 2FA issuer излизат с бранда на клиента от ден 1.
  // (Допълва се от Settings → Издател: ЕИК, ДДС, IBAN, лого.)
  try {
    orgDb.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('issuer', ?)")
      .run(JSON.stringify({ name: String(name).trim() }));
  } catch (e) { console.warn('[createOrg] issuer seed:', e.message); }

  const hash = bcrypt.hashSync(owner_password, 10);
  const uR = controlDb.prepare(
    'INSERT INTO users (username, password_hash, role, name, email, organization_id, is_superadmin) VALUES (?,?,?,?,?,?,0)'
  ).run(owner_username, hash, 'admin', owner_name || '', owner_email || '', orgId);

  return { organization_id: orgId, owner_user_id: Number(uR.lastInsertRowid) };
}

module.exports = { createOrg };
