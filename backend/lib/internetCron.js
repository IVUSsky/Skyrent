// Cron-като worker за интернет акаунтите.
//
// На всеки tick (5 мин):
//   1. Намира акаунти със status='active' и valid_until <= now → маркира 'expired'
//      и вика disableUser на рутера.
//   2. Намира акаунти със status='inactive'/'expired' но valid_until > now
//      → маркира 'active' и вика ensureUser на рутера.
//
// Извиква се ръчно от admin endpoint /api/internet/sync-all също.

const { getRouterProvider } = require('./routerProvider');
const { notifyTenant } = require('./notify');

async function reconcileInternetAccounts(db, opts = {}) {
  const router = getRouterProvider();
  const stats = { expired: 0, activated: 0, errors: 0, checked: 0 };

  // Активни акаунти с активни планове в бъдещето → трябва да са enabled
  const accounts = db.prepare(`
    SELECT a.*, u.email AS user_email, u.name AS user_name
    FROM internet_accounts a
    LEFT JOIN users u ON u.id = a.user_id
  `).all();

  for (const acc of accounts) {
    stats.checked++;
    const now = new Date();
    const validUntil = acc.valid_until ? new Date(acc.valid_until + (acc.valid_until.endsWith('Z') ? '' : 'Z')) : null;
    const isPaid    = validUntil && validUntil > now;

    try {
      if (isPaid && acc.status !== 'active') {
        // Activate
        await router.ensureUser(db, {
          username: acc.username, password: acc.password, mac_address: acc.mac_address,
          valid_until: acc.valid_until, property_id: acc.property_id,
        });
        db.prepare(`
          UPDATE internet_accounts SET status='active', router_synced_at=datetime('now'),
            router_state=? WHERE id=?
        `).run(JSON.stringify({ ok: true, ts: now.toISOString() }), acc.id);
        stats.activated++;
      } else if (!isPaid && acc.status === 'active') {
        // Expire
        await router.disableUser(db, { username: acc.username, mac_address: acc.mac_address, property_id: acc.property_id });
        db.prepare(`
          UPDATE internet_accounts SET status='expired', router_synced_at=datetime('now'),
            router_state=? WHERE id=?
        `).run(JSON.stringify({ ok: true, ts: now.toISOString(), reason: 'expired' }), acc.id);
        stats.expired++;
        // Notify the tenant
        notifyTenant(db, acc.user_id, {
          kind: 'internet_expired',
          title: 'Интернет достъпът ви изтече',
          body: 'Купете нов пакет от Tab Интернет в портала.',
          link: 'internet', ref_type: 'internet_account', ref_id: acc.id,
        });
      }
    } catch (err) {
      stats.errors++;
      console.error(`[internetCron] account ${acc.id} sync failed:`, err.message);
      db.prepare(`UPDATE internet_accounts SET router_state=? WHERE id=?`)
        .run(JSON.stringify({ ok: false, ts: now.toISOString(), error: err.message }), acc.id);
    }
  }

  if (!opts.silent) console.log('[internetCron] reconcile done:', stats);
  return stats;
}

function startInternetCron(db) {
  // Run once at startup (after 30s, to let app finish booting), then every 5 min
  setTimeout(() => reconcileInternetAccounts(db).catch(e => console.error('[internetCron] startup error:', e)), 30_000);
  setInterval(() => reconcileInternetAccounts(db).catch(e => console.error('[internetCron] tick error:', e)), 5 * 60 * 1000);
  console.log('[internetCron] scheduled every 5 minutes');
}

module.exports = { reconcileInternetAccounts, startInternetCron };
