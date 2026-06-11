require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3002;

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
  origin: (origin, cb) => cb(null, true) // permissive; tighten via FRONTEND_URL in prod
}));

// Stripe webhook must be registered BEFORE express.json() — needs raw body
// for signature verification. The handler itself is mounted later (after DB init).
let stripeWebhookHandler = null;
app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    if (!stripeWebhookHandler) return res.status(503).send('Server starting');
    return stripeWebhookHandler(req, res, next);
  }
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

async function main() {
  // ─── Multi-tenant boot (SaaS Phase 1) ──────────────────────────────────────
  // control.db (organizations/users) + orgs/<id>.db per организация.
  // Route-овете получават dbProxy (per-request org през ALS, попълван от
  // authMiddleware). Crons получават bound org-1 handle (orgMain).
  const { initControlDb, getOrgDb, setTenantMigrator, bootstrap, dbProxy } = require('./db/db');
  const { runControlMigrations, runTenantMigrations } = require('./db/migrations');

  const controlDb = initControlDb();
  runControlMigrations(controlDb);
  setTenantMigrator(runTenantMigrations);
  bootstrap();
  // Fallback: чисто нова инсталация (нито bootstrap копие, нито users) → seed
  // първия admin от env. СЛЕД bootstrap, за да не изпревари копието от orgs/1.db.
  if (controlDb.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(process.env.APP_PASSWORD || 'skyrent2024', 10);
    controlDb.prepare("INSERT INTO users (username, password_hash, role, name, organization_id, is_superadmin) VALUES (?,?,?,?,1,1)")
      .run(process.env.APP_USERNAME || 'admin', hash, 'admin', 'Администратор');
    console.log('Seeded admin user from env vars');
  }
  // отвори всички org бази (пуска tenant миграциите за всяка)
  for (const o of controlDb.prepare('SELECT id FROM organizations').all()) getOrgDb(o.id);

  const db = dbProxy;            // route-овете: per-request org резолюция
  const orgMain = getOrgDb(1);   // crons / фонови задачи: org 1 (Sky Capital)

  // Health (public, lightweight) — за keep-alive pinger (UptimeRobot) който държи
  // Railway контейнера буден и предотвратява 20-30s cold-start след престой.
  // НЕ докосва базата → нулева цена.
  app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

  // Auth (public)
  app.use('/api/auth', require('./routes/auth')(controlDb, getOrgDb));

  // Protected routes
  const authMiddleware = require('./middleware/auth');
  app.use('/api', authMiddleware);

  // ─── Tenant containment (secure by default) ───────────────────────────────
  // Наемателите ползват ИЗКЛЮЧИТЕЛНО /api/tenant/* (целият tenant портал е там)
  // + /api/auth/* за login/password. ВСИЧКО друго (metrics, import, expenses,
  // loans, smart, personal, settings, ...) е admin/broker и трябва да е скрито
  // от tenant роля. Преди този guard tenant token можеше да чете цялото
  // портфолио, личните банкови движения и да управлява smart устройствата.
  //
  // "Secure by default": всеки НОВ route автоматично е tenant-blocked освен ако
  // изрично е под /api/tenant — критично за SaaS multi-tenant изолация.
  const TENANT_ALLOWED = ['/api/tenant', '/api/auth'];
  app.use('/api', (req, res, next) => {
    if (req.user?.role !== 'tenant') return next();           // admin/broker → пълен достъп
    const url = req.originalUrl.split('?')[0];
    if (TENANT_ALLOWED.some(p => url === p || url.startsWith(p + '/'))) return next();
    return res.status(403).json({ error: 'Forbidden' });
  });

  // Backup — download the SQLite database file
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db', 'portfolio.db');
  app.get('/api/backup', (req, res) => {
    try {
      // Force a fresh save before download
      const data = db._sqlDb.export();
      const buf  = Buffer.from(data);
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="skyrent_backup_${date}.db"`);
      res.setHeader('Content-Length', buf.length);
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // VACUUM — освобождава място след масови delete/update (sql.js не auto-vacuum-ва).
  // Свива .db файла → по-бърз cold-start (зарежда се по-малко) и по-бързи записи
  // (export-ва се по-малко). Само admin.
  app.post('/api/admin/vacuum', (req, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    try {
      const before = db._sqlDb.export().length;
      db._sqlDb.exec('VACUUM');
      db._maybeSave();
      const after = db._sqlDb.export().length;
      res.json({
        ok: true,
        before_kb: Math.round(before / 1024),
        after_kb: Math.round(after / 1024),
        saved_kb: Math.round((before - after) / 1024),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Routes
  app.use('/api/properties', require('./routes/properties')(db));
  app.use('/api/loans',      require('./routes/loans')(db));
  app.use('/api/metrics',    require('./routes/metrics')(db));
  app.use('/api/metrics/portfolio', require('./routes/metricsPortfolio')(db));
  app.use('/api/import',     require('./routes/import')(db));
  app.use('/api/settings',   require('./routes/settings')(db));
  app.use('/api/email',      require('./routes/email')(db));
  app.use('/api/invoices',   require('./routes/invoices')(db));
  app.use('/api/contracts',  require('./routes/contracts')(db));
  app.use('/api/users',      require('./routes/users')(db));

  const { expRouter, cpRouter } = require('./routes/expenses')(db);
  app.use('/api/expenses',       expRouter);
  app.use('/api/counterparties', cpRouter);

  app.use('/api/smart', require('./routes/smart')(db));
  app.use('/api/inventory', require('./routes/inventory')(db));
  app.use('/api/investments', require('./routes/investments')(db));
  app.use('/api/investments/bulgar', require('./routes/bulgar')(db));
  app.use('/api/personal', require('./routes/personal')(db));
  app.use('/api/tenant', require('./routes/tenant')(db));
  app.use('/api/chat-learning', require('./routes/chatLearning')(db));
  app.use('/api/addons', require('./routes/addons')(db));
  app.use('/api/support', require('./routes/support')(db));
  app.use('/api/notifications', require('./routes/notifications')(db));
  app.use('/api/internet', require('./routes/internet')(db));
  app.use('/api/integrity', require('./routes/integrity')(db));

  // Stripe payments — tenant-facing endpoints mounted under /api/tenant (auth + tenant guard inside)
  const { tenantPaymentsRouter, webhookHandler } = require('./routes/payments');
  app.use('/api/tenant', tenantPaymentsRouter(db));
  // Wire up the pre-registered webhook handler (was placeholder before DB init)
  stripeWebhookHandler = webhookHandler(db);

  // Contract expiry notifications — runs on startup + once per 24h
  const { sendRenewalNotice } = require('./lib/tenantOnboarding');
  async function runExpiryCheck() {
    try {
      const rows = orgMain.prepare(`
        SELECT c.*, u.email AS user_email, u.id AS user_id
        FROM contracts c
        LEFT JOIN users u ON u.id = c.tenant_user_id
        WHERE c.status='active'
          AND c.end_date IS NOT NULL
          AND c.renewal_notice_sent_at IS NULL
          AND date(c.end_date) >= date('now', '+27 days')
          AND date(c.end_date) <= date('now', '+33 days')
      `).all();
      for (const c of rows) {
        if (!c.user_id || !c.user_email) continue;
        const daysLeft = Math.round((new Date(c.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        const result = await sendRenewalNotice(orgMain, {
          user: { id: c.user_id, email: c.user_email },
          contract: c,
          daysLeft,
        });
        if (result.sent) {
          orgMain.prepare("UPDATE contracts SET renewal_notice_sent_at=datetime('now') WHERE id=?").run(c.id);
          console.log(`Renewal notice sent for contract ${c.contract_number} (${daysLeft}d left)`);
        }
      }
    } catch (e) {
      console.error('Expiry check failed:', e.message);
    }
  }
  // Run shortly after startup so port-bind isn't delayed
  setTimeout(runExpiryCheck, 30 * 1000);
  setInterval(runExpiryCheck, 24 * 60 * 60 * 1000);

  // ─── Investments cron (gold price + alerts + AI reports) ─────────────────
  try {
    const { startInvestmentsCron } = require('./lib/investmentsCron');
    startInvestmentsCron(orgMain);
  } catch (e) {
    console.error('Failed to start investments cron:', e.message);
  }

  // ─── Daily DB backup cron + email ─────────────────────────────────────────
  try {
    const { startBackupCron, runBackup } = require('./lib/backupCron');
    startBackupCron(orgMain);
    // Expose a manual-trigger endpoint for admins (handy if you want a fresh
    // copy before risky changes). Tenant role blocked.
    app.post('/api/backup/run', async (req, res) => {
      if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Forbidden' });
      try {
        const result = await runBackup(db);
        res.json(result);
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Manual /data zip download — bundles contracts, invoices, photos.
    // Big — not emailed; downloaded on demand. Tenant role blocked.
    app.get('/api/backup/data', (req, res) => {
      if (req.user?.role === 'tenant') return res.status(403).json({ error: 'Forbidden' });
      try {
        const AdmZip = require('adm-zip');
        const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) return res.status(404).json({ error: 'DATA_DIR missing' });
        const zip = new AdmZip();
        // Only include the subdirectories we care about — skip /backups so the
        // archive doesn't recursively grow.
        for (const sub of ['contracts', 'invoices', 'property_photos']) {
          const dir = path.join(dataDir, sub);
          if (fs.existsSync(dir)) zip.addLocalFolder(dir, sub);
        }
        const date = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="skyrent_data_${date}.zip"`);
        res.send(zip.toBuffer());
      } catch (err) { res.status(500).json({ error: err.message }); }
    });
  } catch (e) {
    console.error('Failed to start backup cron:', e.message);
  }

  // ─── Tenant chat learner — weekly digest (Sun 02:00 Europe/Sofia) ─────────
  try {
    const cron = require('node-cron');
    const { runWeeklyAnalysis } = require('./lib/tenantChatLearner');
    cron.schedule('0 2 * * 0', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('[chat-learner cron] skipping — no ANTHROPIC_API_KEY');
        return;
      }
      try {
        const result = await runWeeklyAnalysis(orgMain);
        console.log('[chat-learner cron] result:', JSON.stringify(result));
      } catch (e) {
        console.error('[chat-learner cron] failed:', e.message);
      }
    });
    console.log('chat-learner cron registered (Sun 02:00)');
  } catch (e) {
    console.error('Failed to register chat-learner cron:', e.message);
  }

  // ─── SEPA Autopay daily cron ──────────────────────────────────────────────
  // Each day at boot + every 24h, charge users whose autopay_day matches today.
  const { runAutopayCharges } = require('./lib/autopayCron');
  setTimeout(() => runAutopayCharges(orgMain).catch(e => console.error('Autopay cron failed:', e.message)), 60 * 1000);
  setInterval(() => runAutopayCharges(orgMain).catch(e => console.error('Autopay cron failed:', e.message)), 24 * 60 * 60 * 1000);

  // ─── Internet account reconciliation cron (every 5 min) ──────────────────
  try {
    const { startInternetCron } = require('./lib/internetCron');
    startInternetCron(orgMain);
  } catch (e) {
    console.error('Failed to register internet cron:', e.message);
  }

  // ─── Express error-handling middleware (must be LAST, след всички routes) ──
  // Хваща synchronous грешки + такива подадени през next(err). Гарантира че
  // винаги връщаме JSON 500 вместо да оставим заявката да виси или процесът да
  // падне от неуловена грешка в route handler.
  app.use((err, req, res, next) => {
    console.error('[express error]', req.method, req.path, '—', err.message);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}

// ─── Process-level safety net ───────────────────────────────────────────────
// Express 4 НЕ хваща async rejections в route handlers, а cron jobs работят
// извън request lifecycle. Без тези handlers един unhandled rejection в който
// и да е cron/endpoint може тихо да свали целия процес — tenant портал, Stripe
// webhooks, всичко. Логваме и продължаваме (не exit) — по-добре degraded от dead.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.stack || err.message || err);
  // Не правим process.exit — оставяме процеса жив. Ако състоянието е наистина
  // коруптирано, Railway health check ще го рестартира.
});

main().catch(err => { console.error(err); process.exit(1); });
