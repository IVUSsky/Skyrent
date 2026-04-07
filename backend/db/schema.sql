CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY,
  адрес TEXT,
  район TEXT,
  статус TEXT,
  наем REAL DEFAULT 0,
  наемател TEXT,
  площ REAL,
  тип TEXT,
  покупна REAL DEFAULT 0,
  ремонт REAL DEFAULT 0,
  market_val REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  банка TEXT,
  договор TEXT,
  кредитополучател TEXT,
  остатък REAL,
  вноска REAL,
  лихва REAL,
  краен INTEGER,
  имоти TEXT
);

CREATE TABLE IF NOT EXISTS import_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  tx_count INTEGER,
  month_from TEXT,
  month_to TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES import_sessions(id),
  дата DATE,
  контрагент TEXT,
  основание TEXT,
  сума REAL,
  operation TEXT,
  категория TEXT,
  property_id INTEGER REFERENCES properties(id),
  месец TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS expense_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  filepath TEXT,
  status TEXT DEFAULT 'pending',
  supplier_name TEXT,
  supplier_iban TEXT,
  supplier_bic TEXT,
  amount REAL,
  currency TEXT DEFAULT 'BGN',
  reason TEXT,
  property_id INTEGER REFERENCES properties(id),
  expense_category TEXT,
  месец TEXT,
  paid INTEGER DEFAULT 0,
  paid_date DATE,
  xml_exported INTEGER DEFAULT 0,
  ai_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS counterparties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  iban TEXT,
  bic TEXT,
  currency TEXT DEFAULT 'BGN',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS xml_exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  format TEXT,
  payer_iban TEXT,
  invoice_ids TEXT,
  total_count INTEGER,
  total_amount REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
