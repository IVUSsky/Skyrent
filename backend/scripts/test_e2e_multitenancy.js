// E2E тест на multi-tenancy през реалния HTTP стек (локален сървър).
// Изисква server.js да върви на localhost:3002. Ползва JWT_SECRET от env.
require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const assert = require('assert');

const SECRET = process.env.JWT_SECRET || 'skyrent-secret';
const BASE = 'http://localhost:3002';

function call(method, p, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
    const req = http.request(BASE + p, { method, headers }, s => {
      let d = ''; s.on('data', c => d += c);
      s.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} resolve({ code: s.statusCode, j, raw: d }); });
    });
    req.on('error', reject); if (payload) req.write(payload); req.end();
  });
}

(async () => {
  // токени: superadmin org1 (id 1) + СТАР формат (без organization_id) за fallback теста
  const tokSuper = jwt.sign({ id: 1, username: 'admin', role: 'admin', organization_id: 1, is_superadmin: 1 }, SECRET, { expiresIn: '10m' });
  const tokOld   = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, SECRET, { expiresIn: '10m' });

  // 1) org 1 parity
  const p1 = await call('GET', '/api/properties', tokSuper);
  assert.strictEqual(p1.code, 200, 'org1 properties code');
  console.log('✓ org1 properties: ' + p1.j.length);

  // 2) СТАР token (без org claim) → fallback org 1
  const pOld = await call('GET', '/api/properties', tokOld);
  assert.strictEqual(pOld.code, 200, 'old-token code');
  assert.strictEqual(pOld.j.length, p1.j.length, 'old token трябва да вижда org 1');
  console.log('✓ стар token → org 1 fallback (' + pOld.j.length + ')');

  // 3) платформа: създай org 2 (или вече съществува от предишен пуск)
  const mk = await call('POST', '/api/platform/orgs', tokSuper,
    { name: 'Тест ПМ ЕООД', owner_username: 'e2e_owner', owner_password: 'тайна-парола-1', owner_email: 'e2e@test.bg' });
  let org2Id;
  if (mk.code === 201) { org2Id = mk.j.organization_id; console.log('✓ org ' + org2Id + ' създадена'); }
  else {
    assert(/съществува|заети/.test(mk.j?.error || ''), 'unexpected create error: ' + mk.raw);
    // reuse: намери org-а на e2e_owner през login по-долу (org2Id от JWT)
    org2Id = null; console.log('(e2e_owner вече съществува — reuse org от login)');
  }

  // 4) не-superadmin няма достъп до платформата
  const tokOwnerProbe = jwt.sign({ id: 999, username: 'e2e_owner', role: 'admin', organization_id: org2Id || 2, is_superadmin: 0 }, SECRET, { expiresIn: '10m' });
  const deny = await call('GET', '/api/platform/orgs', tokOwnerProbe);
  assert.strictEqual(deny.code, 403, 'platform трябва 403 за не-superadmin');
  console.log('✓ платформата е заключена за обикновени org admins');

  // 5) login като org2 owner (реален bcrypt + JWT flow)
  const lg = await call('POST', '/api/auth/login', null, { username: 'e2e_owner', password: 'тайна-парола-1' });
  assert.strictEqual(lg.code, 200, 'org2 login failed: ' + lg.raw);
  const tok2 = lg.j.token;
  const claims = jwt.decode(tok2);
  if (org2Id == null) org2Id = claims.organization_id;
  assert.strictEqual(claims.organization_id, org2Id, 'JWT няма правилен org claim');
  assert(org2Id > 1, 'e2e_owner трябва да е в org > 1');
  console.log('✓ org2 login OK, JWT org=' + claims.organization_id);

  // 6) ИЗОЛАЦИЯ: org2 НЕ вижда org1 имотите (празна или само свои тестови)
  const p2 = await call('GET', '/api/properties', tok2);
  assert.strictEqual(p2.code, 200);
  assert(p2.j.length < 5, 'ИЗТИЧАНЕ! org2 вижда ' + p2.j.length + ' имота (org1 има ' + p1.j.length + ')');
  assert(!p2.j.some(x => (x['адрес'] || '').includes('Иширков')), 'ИЗТИЧАНЕ! org2 вижда org1 имот');
  const org2Before = p2.j.length;
  console.log('✓ org2 properties: ' + org2Before + ' (изолация)');

  // 7) запис в org2 НЕ пипа org1
  const add = await call('POST', '/api/properties', tok2, { адрес: 'E2E Тест Имот', район: 'Тест', наем: 100 });
  assert(add.code === 200 || add.code === 201, 'org2 create property: ' + add.raw);
  const p2b = await call('GET', '/api/properties', tok2);
  assert.strictEqual(p2b.j.length, org2Before + 1, 'org2 трябва +1 имот');
  const p1b = await call('GET', '/api/properties', tokSuper);
  assert.strictEqual(p1b.j.length, p1.j.length, 'org1 броят се промени — ИЗТИЧАНЕ на запис!');
  console.log('✓ запис в org2 не пипа org1 (org1=' + p1b.j.length + ', org2=' + p2b.j.length + ')');

  // 8) org2 users view: owner-ът вижда само себе си
  const u2 = await call('GET', '/api/users', tok2);
  assert.strictEqual(u2.code, 200);
  assert(u2.j.every(u => u.username === 'e2e_owner'), 'org2 вижда чужди users: ' + JSON.stringify(u2.j.map(x => x.username)));
  console.log('✓ org2 users: само своите (' + u2.j.length + ')');

  // 9) SIGNUP (Phase 2): грешен код → 403; верен → org + token; изолация
  if (process.env.SIGNUP_CODE) {
    const bad = await call('POST', '/api/auth/signup', null,
      { signup_code: 'грешен', org_name: 'X', username: 'e2e_su_' + Date.now(), password: 'парола123' });
    assert.strictEqual(bad.code, 403, 'signup с грешен код трябва 403');
    const su = 'e2e_su_' + Date.now();
    const ok = await call('POST', '/api/auth/signup', null,
      { signup_code: process.env.SIGNUP_CODE, org_name: 'Signup Тест ООД', username: su, password: 'парола123', email: su + '@test.bg' });
    assert.strictEqual(ok.code, 201, 'signup fail: ' + ok.raw);
    assert(ok.j.token && ok.j.organization_id > 1, 'signup без token/org');
    const ps = await call('GET', '/api/properties', ok.j.token);
    assert.strictEqual(ps.j.length, 0, 'signup org вижда чужди данни!');
    console.log('✓ signup: код guard + нова org ' + ok.j.organization_id + ' + изолация');
  } else {
    console.log('(signup тест пропуснат — няма SIGNUP_CODE env)');
  }

  console.log('\n✓✓ E2E multi-tenancy: всички проверки минаха');
})().catch(e => { console.error('✗ E2E FAIL:', e.message); process.exit(1); });
