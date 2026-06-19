const jwt = require('jsonwebtoken');
const { getOrgDb, als } = require('../db/db');
const JWT_SECRET = require('../lib/jwtSecret'); // fail-closed; без слаб fallback

module.exports = function(req, res, next) {
  // Accept JWT from Authorization header (default) OR ?token= query param.
  // Query-токенът се приема САМО за GET (сваляне на PDF/снимки през <a>/<img>) —
  // така изтекъл URL-токен (логове/history) не може да се ползва за write (POST/PUT/DELETE).
  const token = req.headers.authorization?.split(' ')[1] || (req.method === 'GET' ? req.query.token : undefined);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  try {
    req.user = payload; // { id, username, role, organization_id?, is_superadmin? }
    // Multi-tenant: org базата на потребителя влиза в ALS контекста на заявката
    // → dbProxy.prepare() в route-овете вижда САМО нея (физическа изолация).
    // Стар token без organization_id (отпреди Phase 1) → org 1.
    const orgId = Number(payload.organization_id) || 1;
    req.user.organization_id = orgId;
    const orgDb = getOrgDb(orgId);
    als.run({ orgDb, orgId }, next);
  } catch (e) {
    console.error('[auth middleware] org context:', e.message);
    res.status(500).json({ error: 'Auth context error' });
  }
};
