// Кое смарт устройство наемателят вижда и кое може да управлява.
//
// Правилото е нарочно консервативно: наемателят може да ВИЖДА всички устройства
// в своя имот (консумация), но да УПРАВЛЯВА само онези, които собственикът е
// разрешил изрично (smart_devices.tenant_control = 1) И които не са опасни по
// вид. Главният предпазител никога не се дава — един грешен бутон сваля
// хладилника, рутера и интернета, за който наемателят плаща.

// Видове, които не се дават на наемател по подразбиране. Собственикът може
// да ги отключи за конкретно устройство (`tenant_control_risky`), но не с
// едно щракване и не без да види какво рискува — виж RISK_NOTES.
const NEVER_TENANT = new Set(['breaker', 'main', 'lock', 'gate']);

// Какво точно се случва, ако наемателят го използва. Текстът отива и в
// админския екран (преди отключване), и в портала (до бутона) — инцидентът
// на 16.10.2026 стана именно защото това не пишеше никъде.
const RISK_NOTES = {
  breaker: 'Спирането на тока сваля и рутера — след това устройството не стига до интернет и НЕ може да се включи от приложението. Връщането иска физическо отиване до таблото.',
  main:    'Главен прекъсвач: спира тока на целия имот, включително хладилника и рутера. Включването обратно иска физическо отиване.',
  lock:    'Брава: грешно заключване може да остави човек отвън.',
  gate:    'Портал/врата: отваря достъп до общата част.',
};

const riskNote = (device) => RISK_NOTES[deviceType(device)] || null;
// Видове, които имат смисъл за наемателя
// `ir_ac` е климатик без Wi-Fi, каран през инфраред контролер (виж lib/tuyaIr.js)
const TENANT_TYPES = new Set(['ac', 'ir_ac', 'climate', 'boiler', 'socket', 'light', 'valve', 'water_valve', 'heater', 'curtain']);

function deviceType(d) { return String(d?.type || '').trim().toLowerCase(); }

const isOn = (v) => v === 1 || v === true || v === '1';

// Може ли наемателят да управлява това устройство.
//
// Опасните видове искат ДВЕ отметки: общата „наемателят може" и изричната
// за този уред. Така „дай му всичко в този апартамент" е възможно (Иво,
// 03.11.2026 за ап. 4А), но не се случва по невнимание в чужда организация.
function canTenantControl(device) {
  if (!device || !device.enabled) return false;
  if (!isOn(device.tenant_control)) return false;
  const t = deviceType(device);
  if (NEVER_TENANT.has(t)) return isOn(device.tenant_control_risky);
  return TENANT_TYPES.has(t);
}

// Устройствата на имота на наемателя, с признак за управление.
// propertyId = null → празен списък (наемател без активен договор).
function devicesForTenant(db, propertyId) {
  if (!propertyId) return [];
  // SELECT * нарочно: ir_remote_id е добавена с миграция и ако тя още не е
  // минала, изброяването на колони би счупило целия списък на наемателя.
  // Изтичане няма — към портала отива само явно избраното по-долу.
  const rows = db.prepare(
    'SELECT * FROM smart_devices WHERE property_id = ? AND enabled = 1 ORDER BY id'
  ).all(propertyId);
  return rows.map(d => ({
    id: d.id,
    name: d.name,
    type: deviceType(d),
    controllable: canTenantControl(d),
    // Какво рискува, ако го натисне — стои до бутона в портала. Ключ, а не
    // готов текст: порталът говори четири езика, а наемателите тук не са
    // само българи.
    risk_key: canTenantControl(d) && riskNote(d) ? deviceType(d) : null,
    // Климатик през инфраред: порталът показва и температура, не само бутон
    infrared: deviceType(d) === 'ir_ac' && !!d.ir_remote_id,
    // tuya_device_id нарочно НЕ се връща към наемателя
  }));
}

// Проверка преди команда: устройството на този имот ли е и позволено ли е
function assertTenantMayControl(db, propertyId, deviceId) {
  const d = propertyId
    ? db.prepare('SELECT * FROM smart_devices WHERE id = ? AND property_id = ?').get(deviceId, propertyId)
    : null;
  if (!d) return { ok: false, status: 404, error: 'Устройството не е намерено в твоя имот' };
  if (!canTenantControl(d)) return { ok: false, status: 403, error: 'Това устройство не се управлява от приложението' };
  return { ok: true, device: d };
}

module.exports = {
  canTenantControl, devicesForTenant, assertTenantMayControl, riskNote,
  NEVER_TENANT, TENANT_TYPES, RISK_NOTES,
};
