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
  // Подписът НЕ е достатъчен — трябва и правилното ПРЕДНАЗНАЧЕНИЕ на токена.
  // Стейдж токенът от 2FA (`{ id, stage:'totp' }`, издаван СЛЕД паролата и ПРЕДИ
  // кода) се подписва със същия ключ. Без тази проверка той минаваше за сесия:
  // няма organization_id → падаше на org 1, няма role → подминаваше оградите за
  // tenant/broker в server.js. Всеки наемател, който си включи 2FA, получаваше
  // достъп до данните на org 1. Виж RFC 8725 §3.12 — различните типове токени
  // трябва да са взаимно изключващи се.
  if (payload.stage) return res.status(401).json({ error: 'Invalid token' });

  // Задължителни права. Липсваща роля минаваше `role !== 'tenant'` проверките.
  const ROLES = new Set(['admin', 'broker', 'tenant']);
  if (!payload.id || !ROLES.has(payload.role)) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Задължителна организация — без fallback към 1. Всички издавани токени носят
  // organization_id от Phase 1 насам, а токените живеят 7 дни, тоест наследени
  // без това поле отдавна са изтекли.
  const orgId = Number(payload.organization_id);
  if (!orgId) return res.status(401).json({ error: 'Invalid token' });

  try {
    req.user = payload; // { id, username, role, organization_id, is_superadmin? }
    // Multi-tenant: org базата на потребителя влиза в ALS контекста на заявката
    // → dbProxy.prepare() в route-овете вижда САМО нея (физическа изолация).
    req.user.organization_id = orgId;
    const orgDb = getOrgDb(orgId);
    als.run({ orgDb, orgId }, next);
  } catch (e) {
    console.error('[auth middleware] org context:', e.message);
    res.status(500).json({ error: 'Auth context error' });
  }
};
