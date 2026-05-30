require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./db/db');
const { seed, patchMarketVal, seedContractTemplate, seedBgContractTemplate, seedProtocolTemplate } = require('./db/seed');

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
  const db = await initDb();

  // Schema
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  db.exec(schema);

  // Seed (idempotent)
  seed(db);
  patchMarketVal(db);

  // Ensure columns exist (idempotent migrations)
  try { db.exec("ALTER TABLE properties ADD COLUMN тип TEXT");           console.log('Migration: added column тип'); }    catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN площ REAL");          console.log('Migration: added column площ'); }   catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN покупна REAL DEFAULT 0"); console.log('Migration: added column покупна'); } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN ремонт REAL DEFAULT 0");  console.log('Migration: added column ремонт'); }  catch(_) {}
  try { db.exec("ALTER TABLE expense_invoices ADD COLUMN invoice_number TEXT"); console.log('Migration: added invoice_number'); } catch(_) {}
  try { db.exec("ALTER TABLE expense_invoices ADD COLUMN invoice_date DATE");   console.log('Migration: added invoice_date');   } catch(_) {}
  try { db.exec("ALTER TABLE expense_invoices ADD COLUMN supplier_eik TEXT");   console.log('Migration: added supplier_eik');   } catch(_) {}
  try { db.exec("ALTER TABLE expense_invoices ADD COLUMN amount_no_vat REAL");  console.log('Migration: added amount_no_vat');  } catch(_) {}
  try { db.exec("ALTER TABLE expense_invoices ADD COLUMN vat_amount REAL");     console.log('Migration: added vat_amount');     } catch(_) {}
  try { db.exec("ALTER TABLE expense_invoices ADD COLUMN payment_type TEXT DEFAULT 'фактура'"); console.log('Migration: added payment_type'); } catch(_) {}
  try { db.exec("ALTER TABLE expense_invoices ADD COLUMN bank_tx_id INTEGER");  console.log('Migration: added bank_tx_id');     } catch(_) {}
  try { db.exec("ALTER TABLE expense_invoices ADD COLUMN source TEXT DEFAULT 'manual'"); console.log('Migration: added source'); } catch(_) {}

  // Property utility accounts (JSON map: {"топлофикация": "4000457500", "ток": "...", "вода": "..."})
  try { db.exec("ALTER TABLE properties ADD COLUMN utility_accounts TEXT DEFAULT '{}'"); console.log('Migration: added properties.utility_accounts'); } catch(_) {}

  // Property utility history — month-by-month consumption per property per utility
  db.exec(`CREATE TABLE IF NOT EXISTS property_utility_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER REFERENCES properties(id),
    invoice_id INTEGER REFERENCES expense_invoices(id),
    utility_type TEXT,          -- 'топлофикация', 'ток', 'вода', 'газ', 'друго'
    period TEXT,                -- 'YYYY-MM'
    amount REAL,                -- total cost (with VAT)
    currency TEXT,
    consumption_data TEXT,      -- JSON with all metrics (kWh, m³, degree days, etc.)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(property_id, utility_type, period)
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_puh_property ON property_utility_history(property_id, utility_type, period DESC)"); } catch(_) {}

  try { db.exec("ALTER TABLE properties ADD COLUMN email TEXT");              console.log('Migration: added email'); }              catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN телефон TEXT");           console.log('Migration: added телефон'); }           catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN invoice_enabled INTEGER DEFAULT 0"); console.log('Migration: added invoice_enabled'); } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN invoice_recipient TEXT"); console.log('Migration: added invoice_recipient'); } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN vat_exempt INTEGER DEFAULT 0"); console.log('Migration: added properties.vat_exempt'); } catch(_) {}

  try { db.exec("ALTER TABLE properties ADD COLUMN абонат_ток TEXT");  console.log('Migration: added абонат_ток');  } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN абонат_вода TEXT"); console.log('Migration: added абонат_вода'); } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN абонат_тец TEXT");  console.log('Migration: added абонат_тец');  } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN абонат_вход TEXT"); console.log('Migration: added абонат_вход'); } catch(_) {}

  try { db.exec("ALTER TABLE loans ADD COLUMN balance_date DATE"); console.log('Migration: added balance_date'); } catch(_) {}
  // Set balance_date to today for loans that don't have one
  db.exec("UPDATE loans SET balance_date = date('now') WHERE balance_date IS NULL");

  // Deduplicate expense_invoices from bank import (keep lowest id per bank_tx_id)
  db.exec(`
    DELETE FROM expense_invoices
    WHERE bank_tx_id IS NOT NULL
      AND id NOT IN (
        SELECT MIN(id) FROM expense_invoices WHERE bank_tx_id IS NOT NULL GROUP BY bank_tx_id
      )
  `);
  // Unique index to prevent future duplicates (partial — only for bank imports)
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_bank_tx ON expense_invoices(bank_tx_id) WHERE bank_tx_id IS NOT NULL"); } catch(_) {}

  // Transactions: add validated + rule_id for smart categorization
  try { db.exec("ALTER TABLE transactions ADD COLUMN validated INTEGER DEFAULT 1"); console.log('Migration: added validated'); } catch(_) {}
  try { db.exec("ALTER TABLE transactions ADD COLUMN rule_id INTEGER");             console.log('Migration: added rule_id');   } catch(_) {}
  // Transactions: currency (BGN before 2026, EUR from 2026)
  try { db.exec("ALTER TABLE transactions ADD COLUMN currency TEXT"); console.log('Migration: added currency to transactions'); } catch(_) {}
  // Backfill currency based on дата for existing transactions
  db.exec("UPDATE transactions SET currency='EUR' WHERE currency IS NULL AND дата >= '2026-01-01'");
  db.exec("UPDATE transactions SET currency='BGN' WHERE currency IS NULL");
  // Backfill expense_invoices currency based on месец (банков_импорт rows had 'BGN' hardcoded)
  db.exec("UPDATE expense_invoices SET currency='EUR' WHERE (currency IS NULL OR currency='BGN') AND месец >= '2026-01'");
  db.exec("UPDATE expense_invoices SET currency='BGN' WHERE currency IS NULL");

  // ── Investments module: precious metals (gold, silver, platinum) ──────
  // Tables are named gold_* for historical reasons but contain a 'метал'
  // column distinguishing 'gold' | 'silver' | 'platinum'.
  db.exec(`CREATE TABLE IF NOT EXISTS gold_investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    дата DATE NOT NULL,
    тип TEXT NOT NULL,
    количество REAL NOT NULL,
    цена_eur REAL NOT NULL,
    обща_сума REAL NOT NULL,
    доставчик TEXT DEFAULT '',
    продукт TEXT DEFAULT '',
    сертификат TEXT DEFAULT '',
    съхранение TEXT DEFAULT 'home',
    бележка TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS gold_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    цена_eur REAL NOT NULL,
    посока TEXT NOT NULL,
    количество_oz REAL,
    съобщение TEXT DEFAULT '',
    активна INTEGER DEFAULT 1,
    задействана INTEGER DEFAULT 0,
    задействана_на DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS gold_price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    дата DATETIME DEFAULT CURRENT_TIMESTAMP,
    цена_usd REAL,
    цена_eur REAL,
    промяна_24h REAL
  )`);
  // Add 'метал' column for multi-metal support (idempotent migrations)
  try { db.exec("ALTER TABLE gold_investments ADD COLUMN метал TEXT DEFAULT 'gold'");   console.log('Migration: added gold_investments.метал'); }   catch(_) {}
  try { db.exec("ALTER TABLE gold_investments ADD COLUMN source_expense_id INTEGER"); console.log('Migration: added gold_investments.source_expense_id'); } catch(_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_gold_inv_expense ON gold_investments(source_expense_id)"); } catch(_) {}
  try { db.exec("ALTER TABLE gold_alerts ADD COLUMN метал TEXT DEFAULT 'gold'");        console.log('Migration: added gold_alerts.метал'); }         catch(_) {}
  try { db.exec("ALTER TABLE gold_price_history ADD COLUMN метал TEXT DEFAULT 'gold'"); console.log('Migration: added gold_price_history.метал'); } catch(_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_gold_price_date ON gold_price_history(метал, дата DESC)"); } catch(_) {}
  db.exec(`CREATE TABLE IF NOT EXISTS investment_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    месец TEXT,
    тип TEXT,
    съдържание TEXT,
    данни TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec("ALTER TABLE investment_reports ADD COLUMN метал TEXT DEFAULT 'all'"); console.log('Migration: added investment_reports.метал'); } catch(_) {}
  console.log('investments tables ready (multi-metal: gold/silver/platinum)');

  // Contract templates & contracts
  db.exec(`CREATE TABLE IF NOT EXISTS contract_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    logo_path TEXT,
    is_default INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER REFERENCES contract_templates(id),
    property_id INTEGER REFERENCES properties(id),
    contract_number TEXT,
    status TEXT DEFAULT 'draft',
    landlord_name TEXT, landlord_address TEXT, landlord_egn TEXT, landlord_phone TEXT,
    tenant_name TEXT, tenant_address TEXT, tenant_egn TEXT,
    tenant_phone TEXT, tenant_email TEXT,
    property_address TEXT, property_description TEXT, property_area REAL,
    monthly_rent REAL, currency TEXT DEFAULT 'EUR',
    deposit REAL DEFAULT 0, payment_day INTEGER DEFAULT 5,
    start_date DATE, end_date DATE,
    conditions TEXT, notes TEXT,
    pdf_path TEXT, sent_at DATETIME, activated_at DATETIME, terminated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Migrate new contract fields
  ['landlord_type TEXT DEFAULT \'физическо\'','landlord_lk TEXT','landlord_lk_date TEXT',
   'tenant_doc TEXT','tenant_doc_date TEXT','tenant_doc_country TEXT','tenant_dob TEXT','delivery_date DATE',
   'tenant_mol TEXT',
   'абонат_ток TEXT','абонат_вода TEXT','абонат_тец TEXT','абонат_вход TEXT',
   'tenant_user_id INTEGER REFERENCES users(id)',
   'renewal_notice_sent_at DATETIME',
   "payment_method TEXT DEFAULT 'банков превод'",
   'pro_rata_amount REAL',
   'pro_rata_end_date DATE',
   'keys_door INTEGER DEFAULT 1',
   'keys_chip INTEGER DEFAULT 1',
   'property_state TEXT',
   'inventory TEXT',
   'protocol_pdf_path TEXT'
  ].forEach(col => { try { db.exec(`ALTER TABLE contracts ADD COLUMN ${col}`); } catch(_) {} });
  console.log('contracts tables ready');
  seedContractTemplate(db);
  seedBgContractTemplate(db);
  seedProtocolTemplate(db);

  // Rent invoices
  db.exec(`CREATE TABLE IF NOT EXISTS rent_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE,
    type TEXT DEFAULT 'invoice',
    related_invoice_id INTEGER REFERENCES rent_invoices(id),
    credit_note_reason TEXT,
    property_id INTEGER REFERENCES properties(id),
    month TEXT,
    tenant_name TEXT,
    recipient_name TEXT,
    recipient_address TEXT,
    recipient_eik TEXT,
    recipient_mol TEXT,
    amount REAL,
    vat_rate REAL DEFAULT 0,
    vat_amount REAL DEFAULT 0,
    total REAL,
    payment_type TEXT,
    tax_event_date DATE,
    due_date DATE,
    issued_at DATE DEFAULT (date('now')),
    sent_at DATETIME,
    pdf_path TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Migrate existing invoices table columns
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN type TEXT DEFAULT 'invoice'"); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN related_invoice_id INTEGER"); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN credit_note_reason TEXT"); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN recipient_mol TEXT"); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN tax_event_date DATE"); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN due_date DATE"); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN paid_at DATETIME"); console.log('Migration: added rent_invoices.paid_at'); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN payment_method TEXT"); console.log('Migration: added rent_invoices.payment_method'); } catch(_) {}
  console.log('rent_invoices table ready');

  // Stripe payment records
  db.exec(`CREATE TABLE IF NOT EXISTS stripe_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER REFERENCES rent_invoices(id),
    session_id TEXT UNIQUE,
    payment_intent_id TEXT,
    status TEXT DEFAULT 'pending',
    amount REAL,
    currency TEXT DEFAULT 'eur',
    customer_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_stripe_payments_invoice ON stripe_payments(invoice_id)"); } catch(_) {}
  console.log('stripe_payments table ready');

  // Manual rent payments (cash / other bank account)
  db.exec(`CREATE TABLE IF NOT EXISTS manual_rent_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    month TEXT NOT NULL,
    amount REAL DEFAULT 0,
    payment_type TEXT DEFAULT 'брой',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(property_id, month)
  )`);
  console.log('manual_rent_payments table ready');

  // Tenant history table
  db.exec(`CREATE TABLE IF NOT EXISTS tenant_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    tenant_name TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    monthly_rent REAL DEFAULT 0,
    deposit REAL DEFAULT 0,
    conditions TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log('tenant_history table ready');

  // Property inventory (furniture, appliances) + files (photos, manuals)
  db.exec(`CREATE TABLE IF NOT EXISTS property_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    brand TEXT DEFAULT '',
    model TEXT DEFAULT '',
    serial_number TEXT DEFAULT '',
    purchase_date DATE,
    purchase_price REAL,
    warranty_end DATE,
    notes TEXT DEFAULT '',
    common_problems TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS inventory_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_id INTEGER NOT NULL REFERENCES property_inventory(id),
    type TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    size INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_property ON property_inventory(property_id)"); } catch(_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_files_inv ON inventory_files(inventory_id)"); } catch(_) {}
  console.log('property_inventory + inventory_files tables ready');

  // Property photos
  db.exec(`CREATE TABLE IF NOT EXISTS property_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    filename TEXT NOT NULL,
    caption TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log('property_photos table ready');

  // Contract annexes
  db.exec(`CREATE TABLE IF NOT EXISTS contract_annexes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL REFERENCES contracts(id),
    annex_number TEXT NOT NULL,
    annex_date DATE NOT NULL,
    new_end_date DATE NOT NULL,
    new_monthly_rent REAL NOT NULL,
    new_currency TEXT DEFAULT 'EUR',
    notes TEXT DEFAULT '',
    pdf_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log('contract_annexes table ready');

  // Users table
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'broker',
    name TEXT DEFAULT '',
    email TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''");          console.log('Migration: added users.phone'); }          catch(_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0"); console.log('Migration: added users.must_change_password'); } catch(_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN last_login_at DATETIME");          console.log('Migration: added users.last_login_at'); }  catch(_) {}
  // Phase 2 SEPA DD autopay fields
  try { db.exec("ALTER TABLE users ADD COLUMN stripe_customer_id TEXT");         console.log('Migration: added users.stripe_customer_id'); }       catch(_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN sepa_payment_method_id TEXT");     console.log('Migration: added users.sepa_payment_method_id'); }   catch(_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN sepa_iban_last4 TEXT");            console.log('Migration: added users.sepa_iban_last4'); }          catch(_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN autopay_enabled INTEGER DEFAULT 0"); console.log('Migration: added users.autopay_enabled'); }        catch(_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN autopay_activated_at DATETIME");   console.log('Migration: added users.autopay_activated_at'); }    catch(_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN autopay_day INTEGER DEFAULT 5");   console.log('Migration: added users.autopay_day'); }              catch(_) {}
  // Seed first admin from env vars if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(process.env.APP_PASSWORD || 'skyrent2024', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, name) VALUES (?,?,?,?)")
      .run(process.env.APP_USERNAME || 'admin', hash, 'admin', 'Администратор');
    console.log('Seeded admin user from env vars');
  }
  console.log('users table ready');

  // Auth (public)
  app.use('/api/auth', require('./routes/auth')(db));

  // Protected routes
  const authMiddleware = require('./middleware/auth');
  app.use('/api', authMiddleware);

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

  // Routes
  app.use('/api/properties', require('./routes/properties')(db));
  app.use('/api/loans',      require('./routes/loans')(db));
  app.use('/api/metrics',    require('./routes/metrics')(db));
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
  app.use('/api/tenant', require('./routes/tenant')(db));

  // Stripe payments — tenant-facing endpoints mounted under /api/tenant (auth + tenant guard inside)
  const { tenantPaymentsRouter, webhookHandler } = require('./routes/payments');
  app.use('/api/tenant', tenantPaymentsRouter(db));
  // Wire up the pre-registered webhook handler (was placeholder before DB init)
  stripeWebhookHandler = webhookHandler(db);

  // Contract expiry notifications — runs on startup + once per 24h
  const { sendRenewalNotice } = require('./lib/tenantOnboarding');
  async function runExpiryCheck() {
    try {
      const rows = db.prepare(`
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
        const result = await sendRenewalNotice(db, {
          user: { id: c.user_id, email: c.user_email },
          contract: c,
          daysLeft,
        });
        if (result.sent) {
          db.prepare("UPDATE contracts SET renewal_notice_sent_at=datetime('now') WHERE id=?").run(c.id);
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
    startInvestmentsCron(db);
  } catch (e) {
    console.error('Failed to start investments cron:', e.message);
  }

  // ─── SEPA Autopay daily cron ──────────────────────────────────────────────
  // Each day at boot + every 24h, charge users whose autopay_day matches today.
  const { runAutopayCharges } = require('./lib/autopayCron');
  setTimeout(() => runAutopayCharges(db).catch(e => console.error('Autopay cron failed:', e.message)), 60 * 1000);
  setInterval(() => runAutopayCharges(db).catch(e => console.error('Autopay cron failed:', e.message)), 24 * 60 * 60 * 1000);

  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}

main().catch(err => { console.error(err); process.exit(1); });
