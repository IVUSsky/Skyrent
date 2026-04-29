require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./db/db');
const { seed, patchMarketVal, seedContractTemplate } = require('./db/seed');

const app = express();
const PORT = process.env.PORT || 3002;

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
  origin: (origin, cb) => cb(null, true) // permissive; tighten via FRONTEND_URL in prod
}));
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

  try { db.exec("ALTER TABLE properties ADD COLUMN email TEXT");              console.log('Migration: added email'); }              catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN телефон TEXT");           console.log('Migration: added телефон'); }           catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN invoice_enabled INTEGER DEFAULT 0"); console.log('Migration: added invoice_enabled'); } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN invoice_recipient TEXT"); console.log('Migration: added invoice_recipient'); } catch(_) {}

  try { db.exec("ALTER TABLE properties ADD COLUMN абонат_ток TEXT");  console.log('Migration: added абонат_ток');  } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN абонат_вода TEXT"); console.log('Migration: added абонат_вода'); } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN абонат_тец TEXT");  console.log('Migration: added абонат_тец');  } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN абонат_вход TEXT"); console.log('Migration: added абонат_вход'); } catch(_) {}

  try { db.exec("ALTER TABLE loans ADD COLUMN balance_date DATE"); console.log('Migration: added balance_date'); } catch(_) {}
  // Set balance_date to today for loans that don't have one
  db.exec("UPDATE loans SET balance_date = date('now') WHERE balance_date IS NULL");

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
   'абонат_ток TEXT','абонат_вода TEXT','абонат_тец TEXT','абонат_вход TEXT'
  ].forEach(col => { try { db.exec(`ALTER TABLE contracts ADD COLUMN ${col}`); } catch(_) {} });
  console.log('contracts tables ready');
  seedContractTemplate(db);

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
  console.log('rent_invoices table ready');

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

  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}

main().catch(err => { console.error(err); process.exit(1); });
