// Намиране на устройствата в Tuya акаунта, за да не се преписват номера на ръка.
//
// Досега всяко устройство се добавяше с ръчно преписан Device ID от Smart Life —
// бавно и лесно за грешка. Tuya дава списък на всичко в проекта, а категорията на
// устройството подсказва и вида, с който да влезе в Skyrent.

const { tuyaRequest } = require('./tuyaClient');

// Категориите на Tuya са кратки кодове. Тези тук покриват каквото слагаме по
// апартаментите; непознатата категория не се познава, а се оставя на човека.
const CATEGORY_TYPE = {
  kt: 'ac',            // климатик
  ktkzq: 'ac',         // контролер за климатик
  wnykq: 'ir_ac',      // универсално инфраред дистанционно
  rs: 'boiler',        // бойлер
  kf: 'boiler',
  cz: 'socket',        // контакт
  pc: 'socket',        // разклонител
  dj: 'light',         // лампа
  dd: 'light',
  xdd: 'light',
  tgq: 'light',        // димер
  dlq: 'breaker',      // предпазител
  zndb: 'breaker',     // електромер с прекъсвач
  ms: 'lock',          // брава
  jtmspro: 'lock',
  clkg: 'curtain',     // ключ за щори
  cl: 'curtain',       // мотор за щори
  sfkzq: 'water_valve',// клапан за вода
  sd: 'water_valve',
};

// Думи в името, когато категорията не казва нищо. Хората кръщават устройствата
// на български и на латиница — гледаме и двете.
const NAME_HINTS = [
  [/климат|klimat|conditioner|\bac\b/i, 'ac'],
  [/бойлер|boiler|water heater/i, 'boiler'],
  [/контакт|socket|plug|разклон/i, 'socket'],
  [/лампа|осветл|light|lamp/i, 'light'],
  [/щор|перде|curtain|blind|roller/i, 'curtain'],
  [/кран|клапан|valve/i, 'water_valve'],
  [/бушон|предпазит|breaker|мерач/i, 'breaker'],
  [/брава|lock/i, 'lock'],
  [/рутер|router/i, 'router'],
  [/инфрачерв|инфраред|infrared|\bir\b|remote/i, 'ir_ac'],
];

function suggestType(category, name) {
  const c = String(category || '').trim().toLowerCase();
  if (CATEGORY_TYPE[c]) return CATEGORY_TYPE[c];
  const n = String(name || '');
  for (const [re, type] of NAME_HINTS) if (re.test(n)) return type;
  return null;   // нищо не се предполага наслуки — човекът избира
}

// Tuya връща страници по най-много 20, с курсор към последния видян номер
async function listAllDevices({ max = 200 } = {}) {
  const out = [];
  let lastId = null;
  for (let page = 0; page < 20 && out.length < max; page++) {
    const q = 'page_size=20' + (lastId ? '&last_id=' + encodeURIComponent(lastId) : '');
    const d = await tuyaRequest('GET', `/v2.0/cloud/thing/device?${q}`);
    if (!d.success) throw new Error('Tuya: ' + (d.msg || 'не връща устройствата'));
    const batch = (d.result && (d.result.list || d.result)) || [];
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
    lastId = batch[batch.length - 1].id;
    if (batch.length < 20) break;
  }
  return out;
}

// Привежда суровия отговор към това, което интерфейсът показва, и отбелязва
// кои вече са вписани в Skyrent — за да не се добавят по два пъти.
function describeDevices(raw, knownIds = []) {
  const known = new Set((knownIds || []).map(String));
  return (raw || []).map(d => {
    const id = d.id || d.device_id || d.uuid;
    return {
      tuya_device_id: id,
      name: d.customName || d.custom_name || d.name || id,
      category: d.category || null,
      product: d.productName || d.product_name || null,
      online: d.isOnline !== undefined ? !!d.isOnline : (d.online !== undefined ? !!d.online : null),
      suggested_type: suggestType(d.category, d.customName || d.custom_name || d.name),
      already_added: known.has(String(id)),
    };
  }).filter(d => d.tuya_device_id);
}

module.exports = { CATEGORY_TYPE, suggestType, listAllDevices, describeDevices };
