// Pluggable router provider за управление на интернет достъпа.
// Изборът: env ROUTER_PROVIDER ('mock' default, 'mikrotik' за реален MikroTik).
//
// Архитектура: 1 рутер на имот → таблица `routers` (host/user/pass per property_id).
// При ensureUser/disableUser провайдърът:
//   1. Намира рутера за account.property_id
//   2. Свързва се (или връща грешка)
//   3. Прилага командата
//
// Интерфейс:
//   ensureUser(db, account)  → активира потребителя
//   disableUser(db, account) → деактивира
//   testRouter(db, routerId) → health-check на 1 рутер от admin UI

function getRouterForAccount(db, account) {
  if (!account.property_id) return null;
  return db.prepare('SELECT * FROM routers WHERE property_id=?').get(account.property_id);
}

class MockProvider {
  constructor() { this.name = 'mock'; }

  async ensureUser(db, acc) {
    const r = getRouterForAccount(db, acc);
    if (!r) {
      console.log(`[router:mock] no router configured for property ${acc.property_id} — skip`);
      return { ok: true, provider: 'mock', state: 'no_router', message: 'Няма конфигуриран рутер за този имот' };
    }
    console.log(`[router:mock] ensureUser host=${r.host} username=${acc.username} mac=${acc.mac_address || '-'} valid_until=${acc.valid_until}`);
    return { ok: true, provider: 'mock', state: 'enabled', router_id: r.id };
  }

  async disableUser(db, acc) {
    const r = getRouterForAccount(db, acc);
    if (!r) return { ok: true, provider: 'mock', state: 'no_router' };
    console.log(`[router:mock] disableUser host=${r.host} username=${acc.username} mac=${acc.mac_address || '-'}`);
    return { ok: true, provider: 'mock', state: 'disabled', router_id: r.id };
  }

  async testRouter(db, routerId) {
    const r = db.prepare('SELECT * FROM routers WHERE id=?').get(routerId);
    if (!r) return { ok: false, message: 'Рутерът не е намерен' };
    return { ok: true, provider: 'mock', message: `Mock OK — host=${r.host}; реална връзка все още не е активирана (Фаза 2)` };
  }
}

// MikroTik provider — Фаза 2.
// План за имплементация: ползва node-routeros (RouterOS API над TCP/8728)
// или REST API (RouterOS v7+).
// За всеки ensureUser/disableUser:
//   1. Свързва се към routers.host:routers.api_port с api_user/api_pass
//   2. Управлява hotspot users (или firewall address-list по MAC)
class MikrotikProvider {
  constructor() { this.name = 'mikrotik'; }

  async ensureUser(db, acc) {
    const r = getRouterForAccount(db, acc);
    if (!r) throw new Error('Няма конфигуриран рутер за този имот');
    throw new Error('MikroTik провайдърът все още не е имплементиран — Фаза 2 (след купуване на хардуера).');
  }
  async disableUser(db, acc) {
    const r = getRouterForAccount(db, acc);
    if (!r) return { ok: true, message: 'Няма рутер' };
    throw new Error('MikroTik провайдърът все още не е имплементиран — Фаза 2.');
  }
  async testRouter(db, routerId) {
    const r = db.prepare('SELECT * FROM routers WHERE id=?').get(routerId);
    if (!r) return { ok: false, message: 'Рутерът не е намерен' };
    if (!r.host || !r.api_user) return { ok: false, message: 'Липсват host/user в конфигурацията на рутера' };
    return { ok: false, provider: 'mikrotik', message: 'Не е имплементиран (Фаза 2 — след закупуване).' };
  }
}

let singleton = null;
function getRouterProvider() {
  if (singleton) return singleton;
  const kind = (process.env.ROUTER_PROVIDER || 'mock').toLowerCase();
  switch (kind) {
    case 'mikrotik': singleton = new MikrotikProvider(); break;
    case 'mock':
    default:         singleton = new MockProvider();
  }
  console.log(`[routerProvider] Initialized: ${singleton.name}`);
  return singleton;
}

module.exports = { getRouterProvider };
