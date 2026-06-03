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

// MikroTik provider — RouterOS API (TCP 8728 plain, 8729 SSL).
//
// Стратегия: при наличие на mac_address → IP/Hotspot/IP Binding (bypassed)
// — рутерът пропуска MAC адреса без login. Без MAC → обикновен Hotspot user
// с username/password. Всички записи маркирани с comment="skyrent:<id>"
// за идемпотентност и за audit.

class MikrotikProvider {
  constructor() { this.name = 'mikrotik'; }

  async _connect(r) {
    const { RouterOSAPI } = require('node-routeros');
    const conn = new RouterOSAPI({
      host: r.host,
      port: r.api_port || (r.use_tls ? 8729 : 8728),
      user: r.api_user || 'admin',
      password: r.api_pass || '',
      tls: r.use_tls ? { rejectUnauthorized: false } : undefined,
      timeout: 10,
      keepalive: false,
    });
    await conn.connect();
    return conn;
  }

  _markComment(acc) {
    return `skyrent:${acc.username}`;
  }

  async ensureUser(db, acc) {
    const r = getRouterForAccount(db, acc);
    if (!r) throw new Error(`Няма конфигуриран рутер за имот ${acc.property_id}`);
    const conn = await this._connect(r);
    try {
      const comment = this._markComment(acc);
      if (acc.mac_address) {
        // MAC binding — bypass Hotspot login за това устройство
        const existing = await conn.write('/ip/hotspot/ip-binding/print', ['?mac-address=' + acc.mac_address]);
        if (existing.length) {
          await conn.write('/ip/hotspot/ip-binding/set', [
            '=.id=' + existing[0]['.id'],
            '=type=bypassed',
            '=comment=' + comment,
          ]);
        } else {
          await conn.write('/ip/hotspot/ip-binding/add', [
            '=mac-address=' + acc.mac_address,
            '=type=bypassed',
            '=comment=' + comment,
          ]);
        }
        return { ok: true, provider: 'mikrotik', method: 'mac-binding', router_id: r.id };
      }
      // Обикновен Hotspot user (username/password)
      const existing = await conn.write('/ip/hotspot/user/print', ['?name=' + acc.username]);
      if (existing.length) {
        await conn.write('/ip/hotspot/user/set', [
          '=.id=' + existing[0]['.id'],
          '=password=' + acc.password,
          '=disabled=no',
          '=comment=' + comment,
        ]);
      } else {
        await conn.write('/ip/hotspot/user/add', [
          '=name=' + acc.username,
          '=password=' + acc.password,
          '=comment=' + comment,
        ]);
      }
      return { ok: true, provider: 'mikrotik', method: 'hotspot-user', router_id: r.id };
    } finally {
      try { conn.close(); } catch (_) {}
    }
  }

  async disableUser(db, acc) {
    const r = getRouterForAccount(db, acc);
    if (!r) return { ok: true, message: 'Няма рутер' };
    const conn = await this._connect(r);
    try {
      // Премахни ip-binding ако има MAC
      if (acc.mac_address) {
        const existing = await conn.write('/ip/hotspot/ip-binding/print', ['?mac-address=' + acc.mac_address]);
        for (const e of existing) {
          await conn.write('/ip/hotspot/ip-binding/remove', ['=.id=' + e['.id']]);
        }
      }
      // Премахни Hotspot user (винаги опитваме, и в двата случая)
      const users = await conn.write('/ip/hotspot/user/print', ['?name=' + acc.username]);
      for (const u of users) {
        await conn.write('/ip/hotspot/user/remove', ['=.id=' + u['.id']]);
      }
      // Изкарай активните сесии
      const active = await conn.write('/ip/hotspot/active/print', ['?user=' + acc.username]);
      for (const sess of active) {
        try { await conn.write('/ip/hotspot/active/remove', ['=.id=' + sess['.id']]); } catch (_) {}
      }
      return { ok: true, provider: 'mikrotik', router_id: r.id };
    } finally {
      try { conn.close(); } catch (_) {}
    }
  }

  async testRouter(db, routerId) {
    const r = db.prepare('SELECT * FROM routers WHERE id=?').get(routerId);
    if (!r) return { ok: false, message: 'Рутерът не е намерен' };
    if (!r.host || !r.api_user) return { ok: false, message: 'Липсват host/user в конфигурацията на рутера' };
    try {
      const conn = await this._connect(r);
      const id = await conn.write('/system/identity/print');
      const resource = await conn.write('/system/resource/print');
      conn.close();
      const name = id[0]?.name || 'неизвестен';
      const ver  = resource[0]?.version || '?';
      const model = resource[0]?.['board-name'] || '?';
      return {
        ok: true, provider: 'mikrotik',
        message: `✓ ${name} (${model}, RouterOS ${ver})`,
      };
    } catch (err) {
      return { ok: false, provider: 'mikrotik', message: `Грешка: ${err.message}` };
    }
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
