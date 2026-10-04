// Кое смарт устройство наемателят вижда и кое може да управлява.
//
// Правилото е нарочно консервативно: наемателят може да ВИЖДА всички устройства
// в своя имот (консумация), но да УПРАВЛЯВА само онези, които собственикът е
// разрешил изрично (smart_devices.tenant_control = 1) И които не са опасни по
// вид. Главният предпазител никога не се дава — един грешен бутон сваля
// хладилника, рутера и интернета, за който наемателят плаща.

// Видове, които НИКОГА не се дават на наемател, дори да са маркирани
const NEVER_TENANT = new Set(['breaker', 'main', 'lock', 'gate']);
// Видове, които имат смисъл за наемателя
const TENANT_TYPES = new Set(['ac', 'climate', 'boiler', 'socket', 'light', 'valve', 'water_valve', 'heater']);

function deviceType(d) { return String(d?.type || '').trim().toLowerCase(); }

// Може ли наемателят да управлява това устройство
function canTenantControl(device) {
  if (!device || !device.enabled) return false;
  const t = deviceType(device);
  if (NEVER_TENANT.has(t)) return false;
  if (!TENANT_TYPES.has(t)) return false;
  return device.tenant_control === 1 || device.tenant_control === true;
}

// Устройствата на имота на наемателя, с признак за управление.
// propertyId = null → празен списък (наемател без активен договор).
function devicesForTenant(db, propertyId) {
  if (!propertyId) return [];
  const rows = db.prepare(
    `SELECT id, property_id, tuya_device_id, name, type, enabled, tenant_control
       FROM smart_devices WHERE property_id = ? AND enabled = 1 ORDER BY id`
  ).all(propertyId);
  return rows.map(d => ({
    id: d.id,
    name: d.name,
    type: deviceType(d),
    controllable: canTenantControl(d),
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

module.exports = { canTenantControl, devicesForTenant, assertTenantMayControl, NEVER_TENANT, TENANT_TYPES };
