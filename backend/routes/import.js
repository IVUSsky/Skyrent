const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');

module.exports = function(db) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage() });

  // POST /parse
  router.post('/parse', upload.single('file'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // Find header row containing 'Дата и час'
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(20, rawRows.length); i++) {
        const row = rawRows[i];
        if (row.some(cell => String(cell).includes('Дата и час'))) {
          headerRowIdx = i;
          break;
        }
      }

      if (headerRowIdx === -1) {
        return res.status(400).json({ error: 'Could not find header row with "Дата и час"' });
      }

      // Load tenant_map from settings
      const tenantMapRow = db.prepare("SELECT value FROM settings WHERE key='tenant_map'").get();
      let tenantMap = {};
      if (tenantMapRow) {
        try { tenantMap = JSON.parse(tenantMapRow.value); } catch {}
      }

      // Normalize tenant map keys to lowercase
      const normalizedTenantMap = {};
      for (const [k, v] of Object.entries(tenantMap)) {
        normalizedTenantMap[k.toLowerCase()] = v;
      }

      const dataRows = rawRows.slice(headerRowIdx + 1);
      const transactions = [];
      const unknownTenants = [];
      const unknownTenantsSet = new Set();

      for (const row of dataRows) {
        // Skip empty rows
        if (!row[0] && !row[4]) continue;

        const dateRaw = String(row[0] || '').trim();
        if (!dateRaw) continue;

        // Parse date: "DD.MM.YYYY HH:mm"
        let дата = '';
        let месец = '';
        const dateMatch = dateRaw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (dateMatch) {
          дата = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
          месец = `${dateMatch[3]}-${dateMatch[2]}`;
        } else {
          // Try as JS Date
          try {
            const d = new Date(dateRaw);
            if (!isNaN(d)) {
              дата = d.toISOString().slice(0, 10);
              месец = дата.slice(0, 7);
            }
          } catch {}
        }

        // Parse amount col[4]
        let суmaRaw = row[4];
        let сума = 0;
        if (typeof суmaRaw === 'number') {
          сума = суmaRaw;
        } else {
          const cleaned = String(суmaRaw || '').replace(/\s/g, '').replace(',', '.');
          сума = parseFloat(cleaned) || 0;
        }

        const operation = String(row[7] || '').trim(); // 'Дт' or 'Кт'
        const контрагент = String(row[10] || '').trim();
        const основание = String(row[12] || '').trim();

        const kontLower = контрагент.toLowerCase();
        const osnLower = основание.toLowerCase();

        let категория = '';
        let property_id = null;

        // Try to find property_id from tenant_map
        for (const [key, pid] of Object.entries(normalizedTenantMap)) {
          if (kontLower.includes(key) || osnLower.includes(key)) {
            property_id = pid;
            break;
          }
        }

        if (operation === 'Кт') {
          const rentKeywords = ['наем', 'rent', 'наем'];
          const hasRentKeyword = rentKeywords.some(kw => osnLower.includes(kw) || kontLower.includes(kw));
          const inTenantMap = property_id !== null;

          if (hasRentKeyword || inTenantMap) {
            категория = 'наем';
            // Track unknown tenants (matched by keyword but not in map)
            if (hasRentKeyword && !inTenantMap && контрагент && !unknownTenantsSet.has(контрагент)) {
              unknownTenantsSet.add(контрагент);
              unknownTenants.push({ контрагент, основание });
            }
          } else if (kontLower.includes('иво лазаров') || osnLower.includes('заем')) {
            категория = 'equity_inject';
          } else if (osnLower.includes('нап') || osnLower.includes('ддс')) {
            категория = 'нап_ддс';
          } else {
            категория = 'приход_друг';
          }
        } else if (operation === 'Дт') {
          const loanKeywords = ['прокредит', 'unicredit', 'уникредит', 'пощенска', 'вноска', 'кредит'];
          const expenseKeywords = ['такса', 'застраховка', 'счетоводство', 'поддръжка', 'нотариус'];

          const isLoan = loanKeywords.some(kw => kontLower.includes(kw) || osnLower.includes(kw));
          const isExpense = expenseKeywords.some(kw => kontLower.includes(kw) || osnLower.includes(kw));

          if (isLoan) {
            категория = 'вноска';
          } else if (isExpense) {
            категория = 'разход';
          } else {
            категория = 'разход_друг';
          }
        } else {
          категория = 'друго';
        }

        transactions.push({
          дата,
          контрагент,
          основание,
          сума,
          operation,
          категория,
          property_id,
          месец,
        });
      }

      res.json({ transactions, unknownTenants });
    } catch (err) {
      console.error('Parse error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /save
  router.post('/save', (req, res) => {
    try {
      const { filename, transactions } = req.body;
      if (!transactions || !Array.isArray(transactions)) {
        return res.status(400).json({ error: 'transactions array required' });
      }

      const months = transactions.map(t => t.месец).filter(Boolean).sort();
      const month_from = months[0] || null;
      const month_to = months[months.length - 1] || null;

      const insertSession = db.prepare(`
        INSERT INTO import_sessions (filename, tx_count, month_from, month_to)
        VALUES (?, ?, ?, ?)
      `);

      const insertTx = db.prepare(`
        INSERT INTO transactions (session_id, дата, контрагент, основание, сума, operation, категория, property_id, месец)
        VALUES (@session_id, @дата, @контрагент, @основание, @сума, @operation, @категория, @property_id, @месец)
      `);

      const insertExpense = db.prepare(`
        INSERT INTO expense_invoices
          (filename, status, supplier_name, amount, currency, reason, property_id, expense_category, месец, payment_type, bank_tx_id, paid, paid_date)
        VALUES (?, 'done', ?, ?, 'EUR', ?, ?, ?, ?, 'банков_импорт', ?, 1, ?)
      `);

      const doImport = db.transaction(() => {
        const sessionResult = insertSession.run(filename || 'upload.xlsx', transactions.length, month_from, month_to);
        const session_id = sessionResult.lastInsertRowid;
        for (const tx of transactions) {
          const txResult = insertTx.run({
            session_id,
            дата: tx.дата || null,
            контрагент: tx.контрагент || '',
            основание: tx.основание || '',
            сума: tx.сума || 0,
            operation: tx.operation || '',
            категория: tx.категория || '',
            property_id: tx.property_id || null,
            месец: tx.месец || null,
          });

          // Дт разходи → expense_invoices
          if (tx.operation === 'Дт' && (tx.категория === 'разход' || tx.категория === 'разход_друг')) {
            insertExpense.run(
              `🏦 ${tx.контрагент || 'Банков разход'}`,
              tx.контрагент || '',
              tx.сума || 0,
              tx.основание || '',
              tx.property_id || null,
              tx.категория === 'разход' ? 'разход' : 'друго',
              tx.месец || null,
              txResult.lastInsertRowid,
              tx.дата || null
            );
          }
        }
        return session_id;
      });

      const session_id = doImport();
      res.json({ ok: true, session_id });
    } catch (err) {
      console.error('Save error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /monthly
  router.get('/monthly', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT
          месец,
          SUM(CASE WHEN категория='наем' THEN сума ELSE 0 END) as наем_total,
          SUM(CASE WHEN категория='вноска' THEN сума ELSE 0 END) as вноска_total,
          SUM(CASE WHEN категория IN ('разход','разход_друг') THEN сума ELSE 0 END) as разход_total,
          SUM(CASE WHEN категория='нап_ддс' THEN сума ELSE 0 END) as нап_ддс_total,
          SUM(CASE WHEN категория='equity_inject' THEN сума ELSE 0 END) as equity_total
        FROM transactions
        WHERE месец IS NOT NULL AND месец != ''
        GROUP BY месец
        ORDER BY месец DESC
      `).all();

      const result = rows.map(r => ({
        месец: r.месец,
        наем_total: r.наем_total || 0,
        вноска_total: r.вноска_total || 0,
        разход_total: r.разход_total || 0,
        нап_ддс_total: r.нап_ддс_total || 0,
        equity_total: r.equity_total || 0,
        net: (r.наем_total || 0) - (r.вноска_total || 0) - (r.разход_total || 0) - (r.нап_ддс_total || 0),
      }));

      res.json(result);
    } catch (err) {
      console.error('Monthly error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
