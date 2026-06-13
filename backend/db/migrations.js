// Skyrent DB миграции (SaaS Phase 1) — извлечени от server.js main().
// runTenantMigrations(db)  → пуска се върху ВСЯКА org база (idempotent).
// runControlMigrations(db) → control.db: organizations, users, login_audit.
const fs = require('fs');
const path = require('path');
const { seed, patchMarketVal, seedContractTemplate, seedBgContractTemplate, seedProtocolTemplate } = require('./seed');

function runTenantMigrations(db) {

  // Schema
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // ВНИМАНИЕ: НЕ seed(db)/patchMarketVal(db) тук! Те сийдват имотите на
  // Sky Capital → в multi-tenant контекст биха ИЗТЕКЛИ в всяка нова org база
  // (хванато от E2E изолационния тест). Org 1 е копие на portfolio.db (данните
  // са там); новите организации започват с празна, само-структурна база.

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
  try { db.exec("ALTER TABLE properties ADD COLUMN stripe_enabled INTEGER DEFAULT 1"); console.log('Migration: added properties.stripe_enabled'); } catch(_) {}
  db.exec("UPDATE properties SET stripe_enabled = 1 WHERE stripe_enabled IS NULL");

  try { db.exec("ALTER TABLE properties ADD COLUMN абонат_ток TEXT");  console.log('Migration: added абонат_ток');  } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN абонат_вода TEXT"); console.log('Migration: added абонат_вода'); } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN абонат_тец TEXT");  console.log('Migration: added абонат_тец');  } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN абонат_вход TEXT"); console.log('Migration: added абонат_вход'); } catch(_) {}

  // Lifecycle stage + pre-construction tracking (2026-06-07)
  // lifecycle_stage values: active | listing | furnishing | renovating |
  //                        pre_construction | reserved | for_sale | inactive
  try { db.exec("ALTER TABLE properties ADD COLUMN lifecycle_stage TEXT"); console.log('Migration: added lifecycle_stage'); } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN lifecycle_eta_date DATE"); console.log('Migration: added lifecycle_eta_date'); } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN purchase_paid_amount REAL"); console.log('Migration: added purchase_paid_amount'); } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN purchase_balance_due REAL"); console.log('Migration: added purchase_balance_due'); } catch(_) {}
  try { db.exec("ALTER TABLE properties ADD COLUMN purchase_balance_due_date DATE"); console.log('Migration: added purchase_balance_due_date'); } catch(_) {}

  // data-integrity: acknowledgments + per-property rent tracking channel
  db.exec(`CREATE TABLE IF NOT EXISTS integrity_acks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signature TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'accepted',
    note TEXT,
    acked_at TEXT
  )`);
  try { db.exec("ALTER TABLE properties ADD COLUMN rent_channel TEXT DEFAULT 'this'"); console.log('Migration: added properties.rent_channel'); } catch(_) {}
  console.log('integrity tables ready');

  // Default lifecycle_stage from emoji status (idempotent — only if NULL).
  // User-ът после може да override-не через UI.
  db.exec("UPDATE properties SET lifecycle_stage = 'active'    WHERE lifecycle_stage IS NULL AND статус = '✅'");
  db.exec("UPDATE properties SET lifecycle_stage = 'furnishing' WHERE lifecycle_stage IS NULL AND статус = '🔶'");
  db.exec("UPDATE properties SET lifecycle_stage = 'inactive'  WHERE lifecycle_stage IS NULL AND статус = '❌'");
  db.exec("UPDATE properties SET lifecycle_stage = 'inactive'  WHERE lifecycle_stage IS NULL");

  // Семя-ваме Симеоново 12 като pre_construction (memory:
  // project_skyrent_simeonovo_preconstruction.md — 20% deposit, 80% дължимо ~2027).
  // Idempotent: не пипа ако user-ът вече е попълнил purchase_paid_amount.
  db.exec(`
    UPDATE properties
    SET lifecycle_stage = 'pre_construction',
        lifecycle_eta_date = COALESCE(lifecycle_eta_date, '2027-12-31'),
        purchase_paid_amount = COALESCE(purchase_paid_amount,
          ROUND(0.20 * COALESCE(market_val, покупна + ремонт, 0), 2)),
        purchase_balance_due = COALESCE(purchase_balance_due,
          ROUND(0.80 * COALESCE(market_val, покупна + ремонт, 0), 2)),
        purchase_balance_due_date = COALESCE(purchase_balance_due_date, '2027-12-31')
    WHERE id IN (34, 35, 36, 37) AND purchase_paid_amount IS NULL
  `);

  try { db.exec("ALTER TABLE loans ADD COLUMN balance_date DATE"); console.log('Migration: added balance_date'); } catch(_) {}
  try { db.exec("ALTER TABLE loans ADD COLUMN paid_external INTEGER DEFAULT 0"); console.log('Migration: added loans.paid_external'); } catch(_) {}
  try { db.exec("ALTER TABLE loans ADD COLUMN paid_external_note TEXT"); console.log('Migration: added loans.paid_external_note'); } catch(_) {}
  // Set balance_date to today for loans that don't have one
  db.exec("UPDATE loans SET balance_date = date('now') WHERE balance_date IS NULL");

  try { db.exec("ALTER TABLE loans ADD COLUMN currency TEXT DEFAULT 'EUR'"); console.log('Migration: added loans.currency'); } catch(_) {}
  db.exec("UPDATE loans SET currency = 'EUR' WHERE currency IS NULL OR currency = ''");

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

  // ── Personal vs Business scope ────────────────────────────────────────
  // scope='business' (default) → имотен бизнес: ОПР, наеми, кредити, ремонти
  // scope='personal'           → личен бюджет: заплата, договор управление,
  //                              домакински разходи. НЕ влиза в Dashboard метриките.
  try { db.exec("ALTER TABLE transactions ADD COLUMN scope TEXT DEFAULT 'business'");      console.log('Migration: added transactions.scope'); }      catch(_) {}
  try { db.exec("ALTER TABLE expense_invoices ADD COLUMN scope TEXT DEFAULT 'business'"); console.log('Migration: added expense_invoices.scope'); } catch(_) {}
  try { db.exec("ALTER TABLE tx_rules ADD COLUMN scope TEXT DEFAULT 'business'");          console.log('Migration: added tx_rules.scope'); }          catch(_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_transactions_scope ON transactions(scope, дата)"); } catch(_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_transactions_session ON transactions(session_id)"); } catch(_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_transactions_cat_op ON transactions(категория, operation)"); } catch(_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(дата DESC)"); } catch(_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_expense_invoices_scope ON expense_invoices(scope, месец)"); } catch(_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_expense_invoices_bank_tx ON expense_invoices(bank_tx_id) WHERE bank_tx_id IS NOT NULL"); } catch(_) {}
  // Account info per import session (IBAN + scope by file)
  try { db.exec("ALTER TABLE import_sessions ADD COLUMN account_iban TEXT");        console.log('Migration: added import_sessions.account_iban'); } catch(_) {}
  try { db.exec("ALTER TABLE import_sessions ADD COLUMN account_scope TEXT");       console.log('Migration: added import_sessions.account_scope'); } catch(_) {}
  try { db.exec("ALTER TABLE import_sessions ADD COLUMN opening_balance REAL");     console.log('Migration: added import_sessions.opening_balance'); } catch(_) {}
  try { db.exec("ALTER TABLE import_sessions ADD COLUMN closing_balance REAL");     console.log('Migration: added import_sessions.closing_balance'); } catch(_) {}
  try { db.exec("ALTER TABLE import_sessions ADD COLUMN account_currency TEXT");    console.log('Migration: added import_sessions.account_currency'); } catch(_) {}

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

  // AI Market Agent — daily signals from news + price analysis
  db.exec(`CREATE TABLE IF NOT EXISTS agent_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    дата DATETIME DEFAULT CURRENT_TIMESTAMP,
    метал TEXT NOT NULL,
    сигнал TEXT NOT NULL,
    уверенност INTEGER,
    обоснование TEXT,
    новини_json TEXT,
    цена_eur REAL,
    действие_препоръка TEXT,
    email_sent INTEGER DEFAULT 0
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_agent_signals_metal_date ON agent_signals(метал, дата DESC)"); } catch(_) {}

  // Trading 212 portfolio snapshots — daily history for charting net wealth.
  db.exec(`CREATE TABLE IF NOT EXISTS t212_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    дата DATETIME DEFAULT CURRENT_TIMESTAMP,
    валута TEXT,
    кеш_общо REAL,
    кеш_свободен REAL,
    блокиран REAL,
    инвестирано REAL,
    текуща_стойност REAL,
    печалба REAL,
    печалба_pct REAL,
    брой_позиции INTEGER,
    позиции_json TEXT
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_t212_snapshots_date ON t212_snapshots(дата DESC)"); } catch(_) {}

  // Net Wealth daily snapshots (имоти equity + metals + T212 NAV → общо)
  db.exec(`CREATE TABLE IF NOT EXISTS wealth_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    дата DATETIME DEFAULT CURRENT_TIMESTAMP,
    общо REAL,
    имоти_equity REAL,
    имоти_asset REAL,
    имоти_debt REAL,
    имоти_брой INTEGER,
    злато REAL,
    сребро REAL,
    t212 REAL,
    разпределение_json TEXT
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_wealth_snapshots_date ON wealth_snapshots(дата DESC)"); } catch(_) {}
  try { db.exec("ALTER TABLE wealth_snapshots ADD COLUMN болгар REAL DEFAULT 0"); console.log('Migration: added wealth_snapshots.болгар'); } catch(_) {}

  // Net Wealth goals — точкови цели с дата (например "€500K до 31.12.2026")
  db.exec(`CREATE TABLE IF NOT EXISTS wealth_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    име TEXT NOT NULL,
    цел_сума REAL NOT NULL,
    цел_дата DATE NOT NULL,
    бележка TEXT,
    активна INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log('investments tables ready (multi-metal + t212_snapshots + wealth_snapshots + wealth_goals)');

  // ── Bulgar Capital (дялов фонд с тримесечни дивиденти) ─────────
  // Позиция = един влог с фиксиран % годишна доходност, период на дивиденти.
  // Дивидентите се изплащат в кеш и влизат в personal_income (тип 'лихва_болгар').
  db.exec(`CREATE TABLE IF NOT EXISTS bulgar_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    име TEXT NOT NULL,
    дата_влог DATE NOT NULL,
    главница_orig REAL NOT NULL,
    валута_orig TEXT DEFAULT 'BGN',
    главница_eur REAL NOT NULL,
    лихва_pct REAL,
    период_месеци INTEGER DEFAULT 3,
    бележка TEXT,
    активна INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS bulgar_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id INTEGER REFERENCES bulgar_positions(id) ON DELETE CASCADE,
    дата DATE NOT NULL,
    тип TEXT NOT NULL,
    сума REAL NOT NULL,
    валута TEXT DEFAULT 'EUR',
    bank_tx_id INTEGER,
    бележка TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_bulgar_tx_pos ON bulgar_transactions(position_id, дата DESC)"); } catch(_) {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_bulgar_tx_bank ON bulgar_transactions(bank_tx_id) WHERE bank_tx_id IS NOT NULL"); } catch(_) {}
  console.log('bulgar_capital tables ready');

  // ── Personal income (заплата / договор управление / дивидент / лихва / друго)
  // Източник: ProBanking импорт (link чрез bank_tx_id), друга банка (manual),
  // или директно ръчно въвеждане.
  db.exec(`CREATE TABLE IF NOT EXISTS personal_income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    дата DATE NOT NULL,
    тип TEXT NOT NULL,
    сума REAL NOT NULL,
    валута TEXT DEFAULT 'EUR',
    източник TEXT DEFAULT '',
    бележка TEXT DEFAULT '',
    bank_tx_id INTEGER REFERENCES transactions(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_personal_income_date ON personal_income(дата DESC)"); } catch(_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_personal_income_tx ON personal_income(bank_tx_id) WHERE bank_tx_id IS NOT NULL"); } catch(_) {}
  console.log('personal_income table ready');

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
  // Продукт/група на фактурата: 'наем' (по подразбиране) | 'интернет' | ...
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN product TEXT DEFAULT 'наем'"); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN related_invoice_id INTEGER"); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN credit_note_reason TEXT"); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN recipient_mol TEXT"); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN tax_event_date DATE"); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN due_date DATE"); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN paid_at DATETIME"); console.log('Migration: added rent_invoices.paid_at'); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN payment_method TEXT"); console.log('Migration: added rent_invoices.payment_method'); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN addons_total REAL DEFAULT 0"); console.log('Migration: added rent_invoices.addons_total'); } catch(_) {}
  try { db.exec("ALTER TABLE rent_invoices ADD COLUMN addons_json TEXT"); console.log('Migration: added rent_invoices.addons_json'); } catch(_) {}
  console.log('rent_invoices table ready');

  // Addon services catalog + tenant subscriptions
  db.exec(`CREATE TABLE IF NOT EXISTS addon_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    monthly_price REAL NOT NULL DEFAULT 0,
    deposit_amount REAL NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'EUR',
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec("ALTER TABLE addon_services ADD COLUMN property_scope TEXT DEFAULT 'all'"); console.log('Migration: added addon_services.property_scope'); } catch(_) {}
  // Backfill за съществуващите услуги: Стелаж → storage, Интернет/ТВ/уреди → residential
  db.exec("UPDATE addon_services SET property_scope = 'storage' WHERE property_scope IS NULL AND name = 'Стелаж'");
  db.exec("UPDATE addon_services SET property_scope = 'residential' WHERE property_scope IS NULL OR property_scope = ''");
  db.exec("UPDATE addon_services SET property_scope = 'residential' WHERE property_scope = 'all' AND name IN ('Интернет','Телевизор','Кафемашина','Прахосмукачка','Робот-прахосмукачка','Микровълнова','PlayStation 5')");
  db.exec("UPDATE addon_services SET property_scope = 'storage' WHERE name = 'Стелаж'");

  db.exec(`CREATE TABLE IF NOT EXISTS tenant_addons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL REFERENCES addon_services(id),
    property_id INTEGER REFERENCES properties(id),
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    activated_at DATETIME,
    stopped_at DATETIME,
    deposit_charged INTEGER DEFAULT 0,
    deposit_charged_invoice_id INTEGER,
    deposit_refunded INTEGER DEFAULT 0,
    admin_notes TEXT
  )`);
  // Seed initial catalog only if empty
  const addonCount = db.prepare('SELECT COUNT(*) as cnt FROM addon_services').get();
  if (addonCount.cnt === 0) {
    const ins = db.prepare(`
      INSERT INTO addon_services (name, description, icon, monthly_price, deposit_amount, sort_order, property_scope)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const seed = [
      ['Интернет', 'Wi-Fi 300 Mbps, фиксиран месечен абонамент', '🌐', 15, 0, 10, 'residential'],
      ['Телевизор', 'Телевизор с дистанционно', '📺', 12, 0, 15, 'residential'],
      ['Кафемашина', 'Кафемашина за еспресо', '☕', 10, 0, 20, 'residential'],
      ['Прахосмукачка', 'Безжична прахосмукачка', '🧹', 8, 0, 30, 'residential'],
      ['Робот-прахосмукачка', 'Роботизирана прахосмукачка', '🤖', 15, 50, 40, 'residential'],
      ['Микровълнова', 'Микровълнова фурна', '🍱', 5, 0, 50, 'residential'],
      ['PlayStation 5', 'Конзола с контролер и 2 игри', '🎮', 30, 200, 60, 'residential'],
      ['Стелаж', 'Метален стелаж за гараж/мазе (за съхранение на вещи)', '📦', 5, 0, 70, 'storage'],
    ];
    for (const s of seed) ins.run(...s);
    console.log('Seeded addon_services catalog with', seed.length, 'items');
  }
  // Idempotent: ако базата вече е seed-ната, гарантирай че следните са добавени
  const ensureAddon = (name, description, icon, monthly_price, deposit_amount, sort_order, property_scope) => {
    const exists = db.prepare('SELECT 1 FROM addon_services WHERE name = ?').get(name);
    if (!exists) {
      db.prepare(`
        INSERT INTO addon_services (name, description, icon, monthly_price, deposit_amount, sort_order, active, property_scope)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `).run(name, description, icon, monthly_price, deposit_amount, sort_order, property_scope || 'all');
      console.log(`Added ${name} to addon catalog`);
    }
  };
  ensureAddon('Телевизор', 'Телевизор с дистанционно',                              '📺', 12, 0,  15, 'residential');
  ensureAddon('Стелаж',    'Метален стелаж за гараж/мазе (за съхранение на вещи)',  '📦',  5, 0,  70, 'storage');
  console.log('addon_services + tenant_addons ready');

  // Support tickets + messages + attachments + notifications
  db.exec(`CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    property_id INTEGER REFERENCES properties(id),
    category TEXT,
    priority TEXT DEFAULT 'normal',
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    last_admin_read_at DATETIME,
    last_tenant_read_at DATETIME
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL REFERENCES support_tickets(id),
    author_role TEXT NOT NULL,
    author_user_id INTEGER,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS support_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER REFERENCES support_tickets(id),
    message_id INTEGER REFERENCES support_messages(id),
    filename TEXT NOT NULL,
    original_name TEXT,
    mime_type TEXT,
    size INTEGER,
    uploaded_by_role TEXT,
    uploaded_by_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_type TEXT NOT NULL,
    recipient_user_id INTEGER,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    ref_type TEXT,
    ref_id INTEGER,
    read_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_type, recipient_user_id, read_at, created_at DESC)"); } catch(_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status, updated_at DESC)"); } catch(_) {}
  console.log('support_tickets + notifications ready');

  // Internet reselling: per-property routers + plans + accounts + purchases
  db.exec(`CREATE TABLE IF NOT EXISTS routers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER REFERENCES properties(id),
    name TEXT,
    model TEXT,
    host TEXT NOT NULL,
    api_port INTEGER DEFAULT 8728,
    api_user TEXT,
    api_pass TEXT,
    use_tls INTEGER DEFAULT 0,
    status TEXT DEFAULT 'unknown',
    last_seen_at DATETIME,
    last_error TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(property_id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS internet_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    duration_days INTEGER NOT NULL,
    price REAL NOT NULL,
    speed_down_mbps INTEGER,
    speed_up_mbps INTEGER,
    currency TEXT DEFAULT 'EUR',
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS internet_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    property_id INTEGER REFERENCES properties(id),
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    mac_address TEXT,
    status TEXT NOT NULL DEFAULT 'inactive',
    valid_from DATETIME,
    valid_until DATETIME,
    total_paid REAL DEFAULT 0,
    router_synced_at DATETIME,
    router_state TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS internet_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES internet_accounts(id),
    plan_id INTEGER NOT NULL REFERENCES internet_plans(id),
    plan_name TEXT,
    amount REAL NOT NULL,
    duration_days INTEGER NOT NULL,
    currency TEXT DEFAULT 'EUR',
    status TEXT NOT NULL DEFAULT 'pending',
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    paid_at DATETIME,
    applied_at DATETIME,
    valid_from DATETIME,
    valid_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Връзка към авто-генерираната фактура при плащане
  try { db.exec("ALTER TABLE internet_purchases ADD COLUMN invoice_id INTEGER REFERENCES rent_invoices(id)"); } catch(_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_inet_accounts_status ON internet_accounts(status, valid_until)"); } catch(_) {}
  // Seed plans only if empty
  const planCount = db.prepare('SELECT COUNT(*) as cnt FROM internet_plans').get();
  if (planCount.cnt === 0) {
    const ins = db.prepare(`
      INSERT INTO internet_plans (name, description, duration_days, price, speed_down_mbps, speed_up_mbps, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const seed = [
      ['24 часа',  'Кратък достъп до 24 часа',    1,   3.00, 100, 50, 10],
      ['7 дни',    'Седмичен пакет',               7,  10.00, 100, 50, 20],
      ['1 месец',  'Месечен пакет — най-изгоден',  30, 25.00, 100, 50, 30],
      ['3 месеца', 'Тримесечен пакет',             90, 65.00, 100, 50, 40],
    ];
    for (const s of seed) ins.run(...s);
    console.log('Seeded internet_plans with', seed.length, 'plans');
  }
  console.log('internet_* tables ready');

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

  // Chat learning queue — weekly digest of tenant Q&A patterns that aren't
  // well-answered yet. Admin reviews each row and either approves (promoted
  // into chat_learned_faqs) or rejects. See [[skyrent-tenant-chat-agent]].
  db.exec(`CREATE TABLE IF NOT EXISTS chat_learning_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    proposed_answer TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'per-apartment',
    property_ids TEXT,
    reasoning TEXT DEFAULT '',
    sample_count INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    reviewed_by INTEGER REFERENCES users(id)
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_chat_learning_status ON chat_learning_queue(status, created_at DESC)"); } catch(_) {}
  console.log('chat_learning_queue table ready');

  // Approved learned FAQs — read by the tenant agent in addition to
  // apartment_knowledge. property_id NULL means global (all apartments).
  db.exec(`CREATE TABLE IF NOT EXISTS chat_learned_faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER REFERENCES properties(id),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    source_queue_id INTEGER REFERENCES chat_learning_queue(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_chat_learned_faqs_property ON chat_learned_faqs(property_id)"); } catch(_) {}
  console.log('chat_learned_faqs table ready');

  // Tenant chat history — AI assistant in Tenant Portal (Phase 2)
  db.exec(`CREATE TABLE IF NOT EXISTS tenant_chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_tenant_chat_user_date ON tenant_chat_messages(tenant_user_id, created_at)"); } catch(_) {}
  console.log('tenant_chat_messages table ready');

  // Apartment knowledge base — for AI tenant chat agent (Phase 1)
  db.exec(`CREATE TABLE IF NOT EXISTS apartment_knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL UNIQUE REFERENCES properties(id),
    wifi_ssid TEXT DEFAULT '',
    wifi_password TEXT DEFAULT '',
    internet_provider TEXT DEFAULT '',
    internet_account TEXT DEFAULT '',
    building_info TEXT DEFAULT '',
    payment_instructions TEXT DEFAULT '',
    free_faq TEXT DEFAULT '',
    appliances_json TEXT DEFAULT '[]',
    contacts_json TEXT DEFAULT '[]',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_apartment_knowledge_property ON apartment_knowledge(property_id)"); } catch(_) {}
  console.log('apartment_knowledge table ready');

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
}

function runControlMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
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
  // Login audit log — security alerts + forensics
  db.exec(`CREATE TABLE IF NOT EXISTS login_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    username TEXT,
    success INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT,
    totp_used INTEGER DEFAULT 0,
    failure_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_login_audit_user_date ON login_audit(user_id, created_at DESC)"); } catch(_) {}
  console.log('login_audit table ready');

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
  // TOTP 2FA — totp_secret stored once enabled, totp_backup_codes is a JSON
  // array of SHA-256 hashes (consumed on use).
  try { db.exec("ALTER TABLE users ADD COLUMN totp_secret TEXT");           console.log('Migration: added users.totp_secret'); }       catch(_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0"); console.log('Migration: added users.totp_enabled'); } catch(_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN totp_backup_codes TEXT");     console.log('Migration: added users.totp_backup_codes'); } catch(_) {}
  // multi-tenancy колони (Phase 1) — ПРЕДИ seed-а (той ги реферира)
  try { db.exec("ALTER TABLE users ADD COLUMN organization_id INTEGER DEFAULT 1"); console.log('Migration: added users.organization_id'); } catch(_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN is_superadmin INTEGER DEFAULT 0");   console.log('Migration: added users.is_superadmin'); }   catch(_) {}
  // Phase 2: trial основа за billing (Phase 3)
  try { db.exec("ALTER TABLE organizations ADD COLUMN plan TEXT DEFAULT 'trial'");  console.log('Migration: added organizations.plan'); }          catch(_) {}
  try { db.exec("ALTER TABLE organizations ADD COLUMN trial_ends_at DATETIME");     console.log('Migration: added organizations.trial_ends_at'); } catch(_) {}
  // Phase 3: Stripe SaaS billing
  try { db.exec("ALTER TABLE organizations ADD COLUMN stripe_customer_id TEXT");     console.log('Migration: added organizations.stripe_customer_id'); }     catch(_) {}
  try { db.exec("ALTER TABLE organizations ADD COLUMN stripe_subscription_id TEXT"); console.log('Migration: added organizations.stripe_subscription_id'); } catch(_) {}

  // Phase 5: платформен команден център — broadcast оферти/новини + leads
  db.exec(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'news',          -- news | offer | service
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    cta_label TEXT,                             -- напр. "Интересувам се"
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS announcement_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    announcement_id INTEGER NOT NULL REFERENCES announcements(id),
    organization_id INTEGER NOT NULL,
    user_id INTEGER,
    username TEXT, email TEXT, org_name TEXT,   -- денормализирано за лесен преглед
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS announcement_dismissals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    announcement_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    UNIQUE(announcement_id, user_id)
  )`);
  console.log('platform announcements tables ready');
  // ВАЖНО: env-seed на първия admin е в server.js СЛЕД bootstrap() — иначе
  // изпреварва копието на реалните users от orgs/1.db и то се скипва.
  console.log('users table ready');
}

module.exports = { runTenantMigrations, runControlMigrations };
