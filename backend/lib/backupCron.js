// Daily DB backup — writes a dated copy of portfolio.db into /data/backups/
// and emails it to the configured recipient via Resend. Runs at startup
// (with a short delay) and then every 24h at 03:00 Europe/Sofia.

const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');

const RETENTION_DAYS = 14;

function getIssuer(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='issuer'").get();
  if (!row) return {};
  try { return JSON.parse(row.value); } catch { return {}; }
}

function getDbPath() {
  return process.env.DB_PATH || path.join(__dirname, '..', 'db', 'portfolio.db');
}

function getBackupDir() {
  const base = process.env.DB_PATH
    ? path.dirname(process.env.DB_PATH)
    : path.join(__dirname, '..', 'db');
  const dir = path.join(base, 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFreshDbFile(db, target) {
  // Force a fresh in-memory export, then write to disk. This makes the
  // backup capture the latest committed state even if the SQLite file
  // on disk is slightly stale (sql.js writes asynchronously).
  const data = db._sqlDb.export();
  fs.writeFileSync(target, Buffer.from(data));
}

function pruneOldBackups(dir) {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith('skyrent_') || !name.endsWith('.db')) continue;
    const fp = path.join(dir, name);
    try {
      const st = fs.statSync(fp);
      if (st.mtimeMs < cutoff) { fs.unlinkSync(fp); removed++; }
    } catch (_) {}
  }
  return removed;
}

async function emailBackup(db, filename, buf) {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.BACKUP_EMAIL || process.env.ADMIN_EMAIL || 'ivollazarov@gmail.com';
  if (!apiKey) return { sent: false, reason: 'no_resend_key' };
  if (!to)     return { sent: false, reason: 'no_recipient' };

  const issuer    = getIssuer(db);
  const fromName  = issuer.name || 'Sky Capital';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'info@skycapital.pro';

  // Resend supports attachments up to ~40MB encoded. For a small landlord
  // the DB is typically well under 5MB, so this is fine.
  const sizeMb = (buf.length / 1024 / 1024).toFixed(2);

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to:   [to],
      subject: `🗄️ Skyrent backup — ${filename}`,
      html: `<p>Автоматичен дневен backup на Skyrent базата данни.</p>
             <p><b>Файл:</b> ${filename}<br>
                <b>Размер:</b> ${sizeMb} MB<br>
                <b>Дата:</b> ${new Date().toLocaleString('bg-BG')}</p>
             <p>Запазен е и локално в <code>/data/backups/</code> (retention: последните ${RETENTION_DAYS} дни).</p>
             <p style="font-size:11px;color:#888">Възстановяване: спри backend-а, замени portfolio.db с този файл, пусни backend-а пак.</p>`,
      attachments: [{ filename, content: buf.toString('base64') }],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { sent: false, reason: `resend ${resp.status}: ${text.slice(0, 200)}` };
  }
  return { sent: true };
}

async function runBackup(db) {
  const dbPath    = getDbPath();
  const backupDir = getBackupDir();
  const date      = new Date().toISOString().slice(0, 10);
  const filename  = `skyrent_${date}.db`;
  const target    = path.join(backupDir, filename);

  writeFreshDbFile(db, target);
  const buf = fs.readFileSync(target);
  const removed = pruneOldBackups(backupDir);
  const mail    = await emailBackup(db, filename, buf);

  console.log(`[backup] wrote ${target} (${buf.length} bytes), pruned ${removed} old, email ${mail.sent ? 'sent' : 'skipped: ' + mail.reason}`);
  return { file: target, bytes: buf.length, pruned: removed, email: mail };
}

function startBackupCron(db) {
  // Daily at 03:00 Europe/Sofia (server TZ)
  cron.schedule('0 3 * * *', async () => {
    try { await runBackup(db); }
    catch (e) { console.error('[backup cron] failed:', e.message); }
  });
  // Boot-time run — gives an immediate snapshot after every deploy.
  setTimeout(async () => {
    try { await runBackup(db); }
    catch (e) { console.error('[backup boot] failed:', e.message); }
  }, 30 * 1000);
  console.log('backup cron registered (daily 03:00 + boot snapshot)');
}

module.exports = { startBackupCron, runBackup };
