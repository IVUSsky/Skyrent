// Климатици БЕЗ Wi-Fi — управляват се през инфраред контролер (IR hub).
//
// Защо отделен файл: обикновените смарт устройства се карат с команда `switch`
// (виж tuyaClient.switchDevice), а инфраред контролерите не я разбират. Tuya има
// съвсем друг път за тях, и за климатици той приема включване, режим, температура
// и вентилатор НАВЕДНЪЖ — тоест през инфраред получаваме повече, отколкото имаме
// за смарт климатиците.
//
// Нужни са ДВА идентификатора:
//   infrared_id — самият контролер (това е tuya_device_id в smart_devices)
//   remote_id   — конкретното „дистанционно“, научено в Smart Life (ir_remote_id)
//
// ⚠️ Инфраредът е ЕДНОПОСОЧЕН. Състоянието, което Tuya връща, е последната
// изпратена команда, не реалното положение на климатика — ако наемателят го
// изключи с истинското дистанционно, тук ще пише, че работи.

const { tuyaRequest } = require('./tuyaClient');

const TEMP_MIN = 16, TEMP_MAX = 30;

// Режимите на Tuya за климатик през инфраред
const MODES = { cool: 0, heat: 1, auto: 2, fan: 3, dry: 4 };
const MODE_BG = { 0: 'охлаждане', 1: 'отопление', 2: 'автоматично', 3: 'вентилатор', 4: 'изсушаване' };

function clampTemp(t) {
  // null и празен низ НЕ са 0 — иначе „без температура“ става 16 градуса
  if (t == null || t === '') return null;
  const n = Math.round(Number(t));
  if (!Number.isFinite(n)) return null;
  return Math.min(TEMP_MAX, Math.max(TEMP_MIN, n));
}

// Приема и число (0–4), и дума ('cool', 'охлаждане'); непознатото → null
function normalizeMode(m) {
  if (m == null || m === '') return null;
  const n = Number(m);
  if (Number.isInteger(n) && n >= 0 && n <= 4) return n;
  const key = String(m).trim().toLowerCase();
  if (key in MODES) return MODES[key];
  for (const [code, bg] of Object.entries(MODE_BG)) if (bg === key) return Number(code);
  return null;
}

// Тялото за командата към климатика. Подават се само зададените полета, за да
// не се бутат стойности, които потребителят не е искал да сменя.
function buildAcBody({ power, mode, temp, wind } = {}) {
  const body = {};
  if (power != null) body.power = power ? 1 : 0;
  const m = normalizeMode(mode);
  if (m != null) body.mode = m;
  const t = clampTemp(temp);
  if (t != null) body.temp = t;
  if (wind != null) {
    const w = Number(wind);
    if (Number.isInteger(w) && w >= 0 && w <= 3) body.wind = w;
  }
  return body;
}

// Tuya връща стойностите като НИЗОВЕ — превеждаме ги в нормални типове
function parseAcStatus(result) {
  const r = result || {};
  const num = (v) => (v == null || v === '' ? null : Number(v));
  const mode = num(r.mode);
  return {
    on: r.power == null ? null : String(r.power) === '1',
    mode,
    mode_bg: mode == null ? null : (MODE_BG[mode] || null),
    temp: num(r.temp),
    wind: num(r.wind),
  };
}

// ── Заявки към Tuya ────────────────────────────────────────────────

// Кои „дистанционни“ са научени в този контролер
async function listRemotes(infraredId) {
  const d = await tuyaRequest('GET', `/v2.0/infrareds/${infraredId}/remotes`);
  if (!d.success) throw new Error('Tuya: ' + (d.msg || 'не връща дистанционните'));
  return (d.result || []).map(x => ({
    remote_id: x.remote_id,
    name: x.remote_name || x.remote_id,
    category_id: x.category_id,
    brand: x.brand_name || null,
  }));
}

async function acCommand(infraredId, remoteId, opts) {
  const body = buildAcBody(opts);
  if (!Object.keys(body).length) throw new Error('няма какво да се изпрати');
  const d = await tuyaRequest('POST',
    `/v2.0/infrareds/${infraredId}/air-conditioners/${remoteId}/scenes/command`, body);
  return { ok: !!d.success, sent: body, result: d };
}

async function acStatus(infraredId, remoteId) {
  const d = await tuyaRequest('GET', `/v2.0/infrareds/${infraredId}/remotes/${remoteId}/ac/status`);
  if (!d.success) throw new Error('Tuya: ' + (d.msg || 'не връща състоянието'));
  return parseAcStatus(d.result);
}

module.exports = {
  TEMP_MIN, TEMP_MAX, MODES, MODE_BG,
  clampTemp, normalizeMode, buildAcBody, parseAcStatus,
  listRemotes, acCommand, acStatus,
};
