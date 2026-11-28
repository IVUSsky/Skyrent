// Отчети. GET /api/reports/annual?year=2026 — годишен отчет по фирмените сметки.
const express = require('express');
const { buildAnnualReport } = require('../lib/annualReport');

function readJsonSetting(db, key) {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return row && row.value ? JSON.parse(row.value) : null;
  } catch (_) { return null; }
}

// Движенията по фирмените сметки. Фирмени = IBAN-ите, които в
// account_scope_map са 'business'. Без такава карта (организация, която не я е
// настроила) — всички импортирани движения с scope 'business' (без ръчните
// записи без сесия, които са наеми в брой и не минават през банка).
function companyTransactions(db, fromDate, toDate) {
  const map = readJsonSetting(db, 'account_scope_map') || {};
  const ibans = Object.entries(map).filter(([, s]) => s === 'business').map(([iban]) => iban);
  const cols = `t.id, t.дата, t.месец, t.контрагент, t.основание, t.сума, t.operation, t.категория,
                t.property_id, t.currency, t.scope, t.session_id`;
  if (ibans.length) {
    return {
      source: 'accounts', ibans,
      rows: db.prepare(`SELECT ${cols} FROM transactions t JOIN import_sessions s ON s.id = t.session_id
        WHERE s.account_iban IN (${ibans.map(() => '?').join(',')}) AND t.дата >= ? AND t.дата <= ?
        ORDER BY t.дата, t.id`).all(...ibans, fromDate, toDate),
    };
  }
  return {
    source: 'scope', ibans: [],
    rows: db.prepare(`SELECT ${cols} FROM transactions t
      WHERE t.session_id IS NOT NULL AND COALESCE(t.scope,'business')='business' AND t.дата >= ? AND t.дата <= ?
      ORDER BY t.дата, t.id`).all(fromDate, toDate),
  };
}

module.exports = function (db) {
  const router = express.Router();

  router.get('/annual', (req, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    try {
      const now = new Date().getFullYear();
      const year = Number(req.query.year) || now;
      if (year < 2000 || year > now + 1) return res.status(400).json({ error: 'Невалидна година' });

      const { rows, source, ibans } = companyTransactions(db, `${year - 1}-01-01`, `${year}-12-31`);
      const properties = db.prepare('SELECT id, адрес, vat_exempt FROM properties').all();
      const contracts = db.prepare("SELECT property_id, status, monthly_rent, currency, kind FROM contracts WHERE status='active'").all();
      const loans = db.prepare('SELECT * FROM loans').all();
      const issuer = readJsonSetting(db, 'issuer') || {};

      const report = buildAnnualReport({ year, transactions: rows, properties, contracts, loans, issuer });

      // Години с данни — за превключвателя
      const years = (source === 'accounts'
        ? db.prepare(`SELECT DISTINCT substr(t.дата,1,4) y FROM transactions t JOIN import_sessions s ON s.id=t.session_id
            WHERE s.account_iban IN (${ibans.map(() => '?').join(',')}) ORDER BY y`).all(...ibans)
        : db.prepare("SELECT DISTINCT substr(дата,1,4) y FROM transactions WHERE session_id IS NOT NULL AND COALESCE(scope,'business')='business' ORDER BY y").all()
      ).map(r => Number(r.y)).filter(Boolean);

      // Последен импорт — за да е ясно докъде стигат данните
      const lastImport = db.prepare('SELECT MAX(imported_at) at FROM import_sessions').get()?.at || null;

      res.json({ ...report, source, accounts: ibans, years, company: issuer.name || null, last_import: lastImport });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
