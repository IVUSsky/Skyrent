#!/usr/bin/env node
// Standalone test за директна връзка с MikroTik през RouterOS API.
//
// Употреба:
//   node scripts/test-mikrotik.js <host> <user> <password> [port] [tls]
//
// Пример:
//   node scripts/test-mikrotik.js 192.168.88.1 skyrent MyP@ss
//   node scripts/test-mikrotik.js 192.168.88.1 skyrent MyP@ss 8729 tls
//
// Какво прави:
//   1. Свързва се
//   2. Принтва system identity + версия + модел
//   3. Принтва съществуващи Hotspot потребители
//   4. Добавя тестов потребител "skyrent_test" / "test123"
//   5. Премахва го веднага след това
//   6. Излиза

const { RouterOSAPI } = require('node-routeros');

async function main() {
  const [, , host, user, password, portArg, tlsArg] = process.argv;
  if (!host || !user || !password) {
    console.error('Употреба: node scripts/test-mikrotik.js <host> <user> <password> [port] [tls]');
    process.exit(1);
  }
  const useTls = tlsArg === 'tls' || tlsArg === 'ssl';
  const port = portArg ? Number(portArg) : (useTls ? 8729 : 8728);

  console.log(`→ Свързване към ${host}:${port}${useTls ? ' (TLS)' : ''} като ${user}...`);
  const conn = new RouterOSAPI({
    host, port, user, password,
    tls: useTls ? { rejectUnauthorized: false } : undefined,
    timeout: 10, keepalive: false,
  });
  try {
    await conn.connect();
    console.log('✓ Свързан');

    const id = await conn.write('/system/identity/print');
    const res = await conn.write('/system/resource/print');
    console.log(`  Име: ${id[0]?.name || '?'}`);
    console.log(`  Модел: ${res[0]?.['board-name'] || '?'}`);
    console.log(`  RouterOS: ${res[0]?.version || '?'}`);

    console.log('\n→ Списък Hotspot потребители:');
    const users = await conn.write('/ip/hotspot/user/print');
    if (users.length === 0) console.log('  (празно)');
    else users.forEach(u => console.log(`  - ${u.name} (server: ${u.server || '?'}, profile: ${u.profile || '?'})`));

    console.log('\n→ Добавяне на тестов потребител "skyrent_test"...');
    // Премахни ако вече съществува (от предишен run)
    const existing = await conn.write('/ip/hotspot/user/print', ['?name=skyrent_test']);
    for (const e of existing) {
      await conn.write('/ip/hotspot/user/remove', ['=.id=' + e['.id']]);
    }
    await conn.write('/ip/hotspot/user/add', [
      '=name=skyrent_test', '=password=test123', '=comment=skyrent-smoke-test',
    ]);
    console.log('✓ Добавен');

    console.log('\n→ Премахване на тестовия потребител...');
    const fresh = await conn.write('/ip/hotspot/user/print', ['?name=skyrent_test']);
    for (const e of fresh) {
      await conn.write('/ip/hotspot/user/remove', ['=.id=' + e['.id']]);
    }
    console.log('✓ Премахнат\n');

    console.log('🎉 ВСИЧКИ ТЕСТОВЕ МИНАХА! MikroTik API работи правилно.');
    conn.close();
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Грешка:', err.message);
    try { conn.close(); } catch (_) {}
    process.exit(2);
  }
}
main();
