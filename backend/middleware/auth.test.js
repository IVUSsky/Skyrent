// Тестове на приемането на токени (middleware/auth.js).
//
// Поводът (S1 от прегледа 07.09.2026): стейдж токенът от 2FA — издаван СЛЕД
// правилната парола и ПРЕДИ кода — се подписва със същия ключ. Middleware-ът
// проверяваше само подписа, затова токенът минаваше за пълна сесия:
//   · няма organization_id → `Number(undefined) || 1` → контекст на ОРГ 1;
//   · няма role → оградите `role !== 'tenant'` в server.js го подминаваха.
// Всеки от наемателите можеше сам да си включи 2FA (/api/auth е разрешен за
// tenant), да влезе с паролата си и да получи достъп до данните на org 1.
const jwt = require('jsonwebtoken');

// Модулът чете ключа при require → задаваме го преди това.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-за-тестове-само';
const SECRET = process.env.JWT_SECRET;

// db/db.js се дърпа от middleware-а; подменяме го с безобиден двойник.
const path = require('path');
require.cache[require.resolve('../db/db.js')] = {
  id: require.resolve('../db/db.js'),
  filename: require.resolve('../db/db.js'),
  loaded: true,
  exports: {
    getOrgDb: (id) => ({ __org: id }),
    als: { run: (_store, next) => next() },
  },
};

const auth = require('./auth');

const call = (token, method = 'GET') => {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {}, method, query: {} };
  const res = {
    statusCode: null, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  let passed = false;
  auth(req, res, () => { passed = true; });
  return { req, res, passed };
};

const fullToken = (over = {}) => jwt.sign(
  { id: 5, username: 'ivo', role: 'admin', organization_id: 3, ...over }, SECRET);

describe('приемане на токени', () => {
  it('пуска нормална сесия и слага организацията от токена', () => {
    const r = call(fullToken());
    expect(r.passed).toBe(true);
    expect(r.req.user.organization_id).toBe(3);
  });

  it('ОТХВЪРЛЯ стейдж токена от 2FA', () => {
    const stage = jwt.sign({ id: 5, stage: 'totp' }, SECRET);
    const r = call(stage);
    expect(r.passed).toBe(false);
    expect(r.res.statusCode).toBe(401);
  });

  it('стейдж токен не пропада към организация 1', () => {
    const stage = jwt.sign({ id: 5, stage: 'totp' }, SECRET);
    const r = call(stage);
    expect(r.req.user).toBeUndefined();
  });

  it('отхвърля токен без роля — иначе минава оградите за tenant/broker', () => {
    const r = call(jwt.sign({ id: 5, organization_id: 3 }, SECRET));
    expect(r.passed).toBe(false);
    expect(r.res.statusCode).toBe(401);
  });

  it('отхвърля непозната роля', () => {
    const r = call(fullToken({ role: 'superuser' }));
    expect(r.passed).toBe(false);
  });

  it('отхвърля токен без организация — без мълчалив fallback към 1', () => {
    const r = call(jwt.sign({ id: 5, role: 'admin' }, SECRET));
    expect(r.passed).toBe(false);
    expect(r.res.statusCode).toBe(401);
  });

  it('отхвърля токен без id', () => {
    const r = call(jwt.sign({ role: 'admin', organization_id: 3 }, SECRET));
    expect(r.passed).toBe(false);
  });

  it('отхвърля подправен подпис', () => {
    const r = call(jwt.sign({ id: 5, role: 'admin', organization_id: 3 }, 'друг-ключ'));
    expect(r.passed).toBe(false);
  });

  it('без токен → 401', () => {
    const r = call(null);
    expect(r.passed).toBe(false);
    expect(r.res.statusCode).toBe(401);
  });

  it('пуска и трите валидни роли', () => {
    for (const role of ['admin', 'broker', 'tenant']) {
      expect(call(fullToken({ role })).passed).toBe(true);
    }
  });
});
