// Единен JWT secret — fail-closed. БЕЗ силен секрет сървърът ОТКАЗВА да стартира.
// (Преди имаше fallback 'skyrent-secret' → нападател можеше да подправи токен с
// произволен organization_id + is_superadmin → пълен cross-tenant + платформен достъп.)
const SECRET = process.env.JWT_SECRET;
const WEAK = new Set(['', 'skyrent-secret', 'secret', 'changeme', 'jwt-secret']);

if (!SECRET || WEAK.has(SECRET)) {
  console.error('FATAL: JWT_SECRET липсва или е слаб/дефолтен. Задай силен случаен JWT_SECRET в env (напр. `openssl rand -hex 32`).');
  process.exit(1);
}
if (SECRET.length < 16) {
  console.warn('[security] JWT_SECRET е под 16 знака — препоръчва се по-дълъг случаен низ.');
}

module.exports = SECRET;
