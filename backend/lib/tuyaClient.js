// Tuya Cloud клиент — изнесен от routes/smart.js, за да го ползва и порталът
// на наемателя (таб „Апартамент"), без да се дублира подписването.
//
// Подписване Tuya API v1.0 (HMAC-SHA256):
//   токен:   ACCESS_ID + t + nonce + stringToSign
//   заявка:  ACCESS_ID + access_token + t + nonce + stringToSign
//   stringToSign = METHOD \n sha256(body) \n\n path   (query подреден по азбучен ред)

const crypto = require('crypto');
const fetch = require('node-fetch');

const cfg = () => ({
  id: process.env.TUYA_ACCESS_ID,
  secret: process.env.TUYA_ACCESS_SECRET,
  base: process.env.TUYA_BASE_URL || 'https://openapi.tuyaeu.com',
});

function configured() { const c = cfg(); return !!(c.id && c.secret); }

function sortedPath(path) {
  const idx = path.indexOf('?');
  if (idx === -1) return path;
  return path.slice(0, idx) + '?' + path.slice(idx + 1).split('&').sort().join('&');
}

async function tuyaRequest(method, path, body) {
  const { id: ACCESS_ID, secret: ACCESS_SECRET, base: BASE_URL } = cfg();
  if (!ACCESS_ID || !ACCESS_SECRET) throw new Error('TUYA_ACCESS_ID/SECRET не са конфигурирани');
  const t = Date.now().toString();
  const nonce = crypto.randomBytes(8).toString('hex');

  const tokenPath = '/v1.0/token?grant_type=1';
  const tokenStringToSign = ['GET', crypto.createHash('sha256').update('').digest('hex'), '', tokenPath].join('\n');
  const tokenSign = crypto.createHmac('sha256', ACCESS_SECRET)
    .update(ACCESS_ID + t + nonce + tokenStringToSign).digest('hex').toUpperCase();

  const tokenRes = await fetch(`${BASE_URL}${tokenPath}`, {
    headers: { client_id: ACCESS_ID, sign: tokenSign, t, sign_method: 'HMAC-SHA256', nonce },
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.success) throw new Error('Tuya token error: ' + (tokenData.msg || JSON.stringify(tokenData)));
  const token = tokenData.result.access_token;

  const t2 = Date.now().toString();
  const nonce2 = crypto.randomBytes(8).toString('hex');
  const bodyStr = body ? JSON.stringify(body) : '';
  const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const signPath = sortedPath(path);
  const stringToSign = [method, bodyHash, '', signPath].join('\n');
  const reqSign = crypto.createHmac('sha256', ACCESS_SECRET)
    .update(ACCESS_ID + token + t2 + nonce2 + stringToSign).digest('hex').toUpperCase();

  const res = await fetch(`${BASE_URL}${signPath}`, {
    method,
    headers: {
      client_id: ACCESS_ID, access_token: token, sign: reqSign,
      t: t2, sign_method: 'HMAC-SHA256', nonce: nonce2, 'Content-Type': 'application/json',
    },
    body: body ? bodyStr : undefined,
  });
  const result = await res.json();
  console.log('[Tuya]', method, path, '->', JSON.stringify(result));
  return result;
}

// Четене на състояние → подредени стойности. Никога не хвърля: ако облакът
// не отговаря (или ключовете липсват), връща { online: false } и порталът
// показва „няма връзка" вместо да гръмне.
async function deviceStatus(tuyaDeviceId) {
  if (!configured()) return { online: false, error: 'not_configured' };
  try {
    const data = await tuyaRequest('GET', `/v1.0/devices/${tuyaDeviceId}/status`);
    if (!data.success) return { online: false, error: data.msg || 'tuya_error' };
    const dps = {};
    for (const dp of (data.result || [])) dps[dp.code] = dp.value;
    return {
      online: true,
      on: dps['switch'] ?? dps['switch_1'] ?? null,
      power_w: dps['cur_power'] != null ? dps['cur_power'] / 10 : null,
      voltage_v: dps['cur_voltage'] != null ? dps['cur_voltage'] / 10 : null,
      current_ma: dps['cur_current'] ?? null,
      energy_kwh: dps['add_ele'] != null ? dps['add_ele'] / 100 : null,
      temp_set: dps['temp_set'] ?? null,
      temp_current: dps['temp_current'] ?? null,
      mode: dps['mode'] ?? null,
    };
  } catch (e) {
    return { online: false, error: e.message };
  }
}

// Кое DP управлява включването. Бушонът tongou ползва `switch`, клапанът
// NSB01 — `switch_1`, едноканални контакти понякога `switch_led`. Четенето
// на състоянието отдавна приема и двете (`on` по-горе), но командата пращаше
// само `switch` — затова клапанът на ап. 4А нямаше да реагира на нищо.
const SWITCH_CODES = ['switch', 'switch_1', 'switch_2', 'switch_led'];

// Изборът е отделно от мрежата, за да се тества без Tuya.
function pickSwitchCode(statusResult) {
  if (!statusResult || statusResult.success === false) return null;
  const list = Array.isArray(statusResult) ? statusResult : (statusResult.result || []);
  const codes = new Set(list.map(dp => dp && dp.code).filter(Boolean));
  return SWITCH_CODES.find(c => codes.has(c)) || null;
}

// Пита устройството кое DP има, вместо да гадае по вид. Едно допълнително
// повикване при натискане — по-евтино от бутон, който мълчи.
async function switchCodeOf(tuyaDeviceId) {
  try {
    return pickSwitchCode(await tuyaRequest('GET', `/v1.0/devices/${tuyaDeviceId}/status`));
  } catch { return null; }
}

// Моторите за щори нямат ключ: карат се с DP `control` (open/stop/close)
// или с `percent_control` (0–100). Пращането на `switch` към тях е същата
// грешка като с клапана — Tuya приема и не прави нищо.
const CURTAIN_CODES = ['control', 'percent_control', 'mach_operate'];

function pickCurtainCode(statusResult) {
  if (!statusResult || statusResult.success === false) return null;
  const list = Array.isArray(statusResult) ? statusResult : (statusResult.result || []);
  const codes = new Set(list.map(dp => dp && dp.code).filter(Boolean));
  return CURTAIN_CODES.find(c => codes.has(c)) || null;
}

// `open` вместо `on`: за завеса „включено" не значи нищо.
async function curtainCommand(tuyaDeviceId, open) {
  let code = null;
  try {
    code = pickCurtainCode(await tuyaRequest('GET', `/v1.0/devices/${tuyaDeviceId}/status`));
  } catch { /* долу се връща ясен отказ */ }
  if (!code) return { ok: false, error: 'Устройството не приема команда за отваряне/затваряне', result: null };
  const value = code === 'percent_control' ? (open ? 100 : 0) : (open ? 'open' : 'close');
  const data = await tuyaRequest('POST', `/v1.0/devices/${tuyaDeviceId}/commands`, {
    commands: [{ code, value }],
  });
  return { ok: !!data.success, code, result: data };
}

async function switchDevice(tuyaDeviceId, on) {
  const code = await switchCodeOf(tuyaDeviceId);
  if (!code) {
    // Уред без ключ за включване — брава с пръстов отпечатък например.
    // По-добре ясен отказ, отколкото команда, която Tuya приема и игнорира.
    return { ok: false, error: 'Устройството няма ключ за включване/изключване', result: null };
  }
  const data = await tuyaRequest('POST', `/v1.0/devices/${tuyaDeviceId}/commands`, {
    commands: [{ code, value: !!on }],
  });
  return { ok: !!data.success, code, result: data };
}

module.exports = { tuyaRequest, deviceStatus, switchDevice, switchCodeOf, pickSwitchCode, curtainCommand, pickCurtainCode, CURTAIN_CODES, configured, sortedPath, SWITCH_CODES };
