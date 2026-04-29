const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');

module.exports = function(db) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage() });

  // ── Helper: load rules from DB ─────────────────────────────
  function loadRules() {
    try { return db.prepare('SELECT * FROM tx_rules ORDER BY id ASC').all(); }
    catch { return []; }
  }

  // ── Helper: categorize one row ─────────────────────────────
  function categorizeRow({ operation, контрагент, основание, property_id_from_map }) {
    const kontLower = контрагент.toLowerCase();
    const osnLower  = основание.toLowerCase();
    let категория  = '';
    let property_id = property_id_from_map;

    if (operation === 'Кт') {
      const hasRentKw = ['наем','rent'].some(kw => osnLower.includes(kw) || kontLower.includes(kw));
      if (hasRentKw || property_id !== null) {
        категория = 'наем';
      } else if (kontLower.includes('иво лазаров') || osnLower.includes('заем')) {
        категория = 'equity_inject';
      } else if (osnLower.includes('нап') || osnLower.includes('ддс')) {
        категория = 'нап_ддс';
      } else {
        категория = 'приход_друг';
      }
    } else if (operation === 'Дт') {
      const isLoan    = ['прокредит','unicredit','уникредит','пощенска','вноска','кредит'].some(kw => kontLower.includes(kw) || osnLower.includes(kw));
      const isExpense = ['такса','застраховка','счетоводство','поддръжка','нотариус'].some(kw => kontLower.includes(kw) || osnLower.includes(kw));
      if (isLoan)         категория = 'вноска';
      else if (isExpense) категория = 'разход';
      else                категория = 'разход_друг';
    } else {
      категория = 'друго';
    }

    return { категория, property_id };
  }

  // ── Helper: parse one XLSX buffer ─────────────────────────
  function parseBuffer(buffer, tenantMap, rules) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Find header row
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(20, rawRows.length); i++) {
      if (rawRows[i].some(cell => String(cell).includes('Дата и час'))) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx === -1) throw new Error('Could not find header row with "Дата и час"');

    const transactions   = [];
    const unknownTenants = [];
    const unknownSet     = new Set();

    for (const row of rawRows.slice(headerRowIdx + 1)) {
      if (!row[0] && !row[4]) continue;
      const dateRaw = String(row[0] || '').trim();
      if (!dateRaw) continue;

      // Parse date
      let дата = '', месец = '';
      const dm = dateRaw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (dm) {
        дата  = `${dm[3]}-${dm[2]}-${dm[1]}`;
        месец = `${dm[3]}-${dm[2]}`;
      } else {
        try {
          const d = new Date(dateRaw);
          if (!isNaN(d)) { дата = d.toISOString().slice(0, 10); месец = дата.slice(0, 7); }
        } catch {}
      }

      // Parse amount
      const суmaRaw = row[4];
      let сума = typeof суmaRaw === 'number'
        ? суmaRaw
        : parseFloat(String(суmaRaw || '').replace(/\s/g, '').replace(',', '.')) || 0;

      const operation   = String(row[7]  || '').trim();
      const контрагент  = String(row[10] || '').trim();
      const основание   = String(row[12] || '').trim();
      const kontLower   = контрагент.toLowerCase();
      const osnLower    = основание.toLowerCase();

      // Tenant map lookup
      let property_id_from_map = null;
      for (const [key, pid] of Object.entries(tenantMap)) {
        if (kontLower.includes(key) || osnLower.includes(key)) {
          property_id_from_map = pid;
          break;
        }
      }

      // Auto-categorize (built-in logic)
      let { категория, property_id } = categorizeRow({ operation, контрагент, основание, property_id_from_map });

      // Track unknown tenants
      if (категория === 'наем' && !property_id_from_map && контрагент && !unknownSet.has(контрагент)) {
        unknownSet.add(контрагент);
        unknownTenants.push({ контрагент, основание });
      }

      // ── Apply custom rules (override built-in) ─────────────
      let rule_id   = null;
      let validated = 1; // manual/built-in = pre-validated
      for (const rule of rules) {
        const pat = rule.pattern.toLowerCase();
        if (kontLower.includes(pat) || osnLower.includes(pat)) {
          категория  = rule.категория;
          if (rule.property_id) property_id = rule.property_id;
          rule_id   = rule.id;
          validated = 0; // rule-matched → needs user validation
          break;
        }
      }

      transactions.push({ дата, контрагент, основание, сума, operation, категория, property_id, месец, rule_id, validated });
    }

    return { transactions, unknownTenants };
  }

  // ── POST /parse (single file) ──────────────────────────────
  router.post('/parse', upload.single('file'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const tenantMapRow = db.prepare("SELECT value FROM settings WHERE key='tenant_map'").get();
      let tenantMap = {};
      if (tenantMapRow) { try { tenantMap = JSON.parse(tenantMapRow.value); } catch {} }
      // Normalize to lowercase keys
      const normMap = Object.fromEntries(Object.entries(tenantMap).map(([k,v]) => [k.toLowerCase(), v]));

      const rules = loadRules();
      const { transactions, unknownTenants } = parseBuffer(req.file.buffer, normMap, rules);
      res.json({ transactions, unknownTenants });
    } catch (err) {
      console.error('Parse error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /parse-multi (multiple files) ────────────────────
  router.post('/parse-multi', upload.array('files', 24), (req, res) => {
    try {
      if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });

      const tenantMapRow = db.prepare("SELECT value FROM settings WHERE key='tenant_map'").get();
      let tenantMap = {};
      if (tenantMapRow) { try { tenantMap = JSON.parse(tenantMapRow.value); } catch {} }
      const normMap = Object.fromEntries(Object.entries(tenantMap).map(([k,v]) => [k.toLowerCase(), v]));
      const rules   = loadRules();

      let allTx       = [];
      let allUnknown  = [];
      const errors    = [];

      for (const file of req.files) {
        try {
          const { transactions, unknownTenants } = parseBuffer(file.buffer, normMap, rules);
          allTx      = allTx.concat(transactions);
          allUnknown = allUnknown.concat(unknownTenants.filter(u => !allUnknown.some(x => x.контрагент === u.контрагент)));
        } catch(e) {
          errors.push(`${file.originalname}: ${e.message}`);
        }
      }

      // Sort chronologically
      allTx.sort((a, b) => (a.дата || '').localeCompare(b.дата || ''));

      res.json({ transactions: allTx, unknownTenants: allUnknown, errors });
    } catch (err) {
      console.error('Parse-multi error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /save ─────────────────────────────────────────────
  router.post('/save', (req, res) => {
    try {
      const { filename, transactions } = req.body;
      if (!transactions || !Array.isArray(transactions)) {
        return res.status(400).json({ error: 'transactions array required' });
      }

      const months     = transactions.map(t => t.месец).filter(Boolean).sort();
      const month_from = months[0] || null;
      const month_to   = months[months.length - 1] || null;

      const insertSession = db.prepare(`
        INSERT INTO import_sessions (filename, tx_count, month_from, month_to)
        VALUES (?, ?, ?, ?)
      `);

      const insertTx = db.prepare(`
        INSERT INTO transactions (session_id, дата, контрагент, основание, сума, operation, категория, property_id, месец, validated, rule_id)
        VALUES (@session_id, @дата, @контрагент, @основание, @сума, @operation, @категория, @property_id, @месец, @validated, @rule_id)
      `);

      // Check for duplicate
      const dupCheck = db.prepare(
        'SELECT id FROM transactions WHERE дата=? AND ROUND(сума,2)=ROUND(?,2) AND operation=? AND контрагент=?'
      );

      const insertExpense = db.prepare(`
        INSERT INTO expense_invoices
          (filename, status, supplier_name, amount, currency, reason, property_id, expense_category, месец, payment_type, bank_tx_id, paid, paid_date)
        VALUES (?, 'done', ?, ?, 'BGN', ?, ?, ?, ?, 'банков_импорт', ?, 1, ?)
      `);

      let saved = 0, skipped = 0;

      const doImport = db.transaction(() => {
        const sessionResult = insertSession.run(filename || 'upload.xlsx', transactions.length, month_from, month_to);
        const session_id    = sessionResult.lastInsertRowid;

        for (const tx of transactions) {
          // Deduplication check
          if (tx.дата && dupCheck.get(tx.дата, tx.сума || 0, tx.operation || '', tx.контрагент || '')) {
            skipped++;
            continue;
          }

          const txResult = insertTx.run({
            session_id,
            дата:       tx.дата       || null,
            контрагент: tx.контрагент || '',
            основание:  tx.основание  || '',
            сума:       tx.сума       || 0,
            operation:  tx.operation  || '',
            категория:  tx.категория  || '',
            property_id: tx.property_id || null,
            месец:      tx.месец      || null,
            validated:  tx.validated  != null ? tx.validated : 1,
            rule_id:    tx.rule_id    || null,
          });
          saved++;

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
      res.json({ ok: true, session_id, saved, skipped });
    } catch (err) {
      console.error('Save error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /unmatched — наемни без property_id ────────────────
  router.get('/unmatched', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT id, дата, контрагент, основание, сума, месец
        FROM transactions
        WHERE категория = 'наем' AND (property_id IS NULL OR property_id = 0)
        ORDER BY месец DESC, дата DESC
      `).all();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /transactions/:id — assign property_id ───────────
  router.patch('/transactions/:id', (req, res) => {
    try {
      const { property_id } = req.body;
      if (!property_id) return res.status(400).json({ error: 'property_id е задължителен' });
      db.prepare('UPDATE transactions SET property_id = ? WHERE id = ?').run(Number(property_id), req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /transactions/:id/category ──────────────────────
  router.patch('/transactions/:id/category', (req, res) => {
    try {
      const { категория, property_id } = req.body;
      if (!категория) return res.status(400).json({ error: 'категория е задължителна' });
      db.prepare('UPDATE transactions SET категория=?, property_id=COALESCE(?,property_id), validated=1 WHERE id=?')
        .run(категория, property_id || null, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /transactions/:id/validate ──────────────────────
  router.patch('/transactions/:id/validate', (req, res) => {
    try {
      db.prepare('UPDATE transactions SET validated=1 WHERE id=?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /transactions/validate-bulk ──────────────────────
  router.post('/transactions/validate-bulk', (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !ids.length) return res.status(400).json({ error: 'ids required' });
      const stmt = db.prepare('UPDATE transactions SET validated=1 WHERE id=?');
      const run  = db.transaction(list => list.forEach(id => stmt.run(id)));
      run(ids);
      res.json({ ok: true, count: ids.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /pending — unvalidated (rule-matched) ──────────────
  router.get('/pending', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT t.*, r.pattern as rule_pattern
        FROM transactions t
        LEFT JOIN tx_rules r ON t.rule_id = r.id
        WHERE t.validated = 0
        ORDER BY t.дата DESC
        LIMIT 500
      `).all();
      const count = db.prepare('SELECT COUNT(*) as cnt FROM transactions WHERE validated=0').get().cnt;
      res.json({ rows, count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /monthly ───────────────────────────────────────────
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

      res.json(rows.map(r => ({
        месец:       r.месец,
        наем_total:    r.наем_total    || 0,
        вноска_total:  r.вноска_total  || 0,
        разход_total:  r.разход_total  || 0,
        нап_ддс_total: r.нап_ддс_total || 0,
        equity_total:  r.equity_total  || 0,
        net: (r.наем_total || 0) + (r.нап_ддс_total || 0) - (r.вноска_total || 0) - (r.разход_total || 0),
      })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /transactions — paginated with filters ─────────────
  router.get('/transactions', (req, res) => {
    try {
      const { месец, категория, search, validated, limit = 200, offset = 0 } = req.query;
      const where  = [];
      const params = [];
      if (месец) { where.push('месец = ?'); params.push(месец); }
      if (категория && категория !== 'all') { where.push('категория = ?'); params.push(категория); }
      if (search) { where.push('(контрагент LIKE ? OR основание LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
      if (validated === '0') { where.push('validated = 0'); }
      else if (validated === '1') { where.push('validated = 1'); }
      const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const rows  = db.prepare(`SELECT * FROM transactions ${whereStr} ORDER BY дата DESC, id DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), Number(offset));
      const total = db.prepare(`SELECT COUNT(*) as cnt FROM transactions ${whereStr}`).get(...params).cnt;
      res.json({ rows, total });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /stats — KPI aggregates ────────────────────────────
  router.get('/stats', (req, res) => {
    try {
      const now  = new Date();
      const pad  = n => String(n).padStart(2, '0');
      const cur  = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
      const d3   = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const m3   = `${d3.getFullYear()}-${pad(d3.getMonth() + 1)}`;
      const ytdS = `${now.getFullYear()}-01`;
      const ly   = String(now.getFullYear() - 1);

      const agg = (w, p) => db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN категория='наем' THEN сума ELSE 0 END),0) as наем,
          COALESCE(SUM(CASE WHEN категория='вноска' THEN сума ELSE 0 END),0) as вноска,
          COALESCE(SUM(CASE WHEN категория IN ('разход','разход_друг') THEN сума ELSE 0 END),0) as разход,
          COALESCE(SUM(CASE WHEN категория='нап_ддс' THEN сума ELSE 0 END),0) as нап_ддс,
          COUNT(*) as cnt
        FROM transactions ${w}
      `).get(...p);

      res.json({
        currentMonth: { label: cur,                   ...agg('WHERE месец = ?',    [cur])  },
        last3months:  { label: `${m3} → ${cur}`,      ...agg('WHERE месец >= ?',   [m3])   },
        ytd:          { label: `${now.getFullYear()} ГТД`, ...agg('WHERE месец >= ?', [ytdS]) },
        lastYear:     { label: ly,                     ...agg('WHERE месец LIKE ?', [`${ly}-%`]) },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /rules ─────────────────────────────────────────────
  router.get('/rules', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM tx_rules ORDER BY id DESC').all();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /rules ────────────────────────────────────────────
  router.post('/rules', (req, res) => {
    try {
      const { pattern, категория, property_id } = req.body;
      if (!pattern || !категория) return res.status(400).json({ error: 'pattern и категория са задължителни' });
      // Avoid exact duplicate patterns
      const existing = db.prepare('SELECT id FROM tx_rules WHERE LOWER(pattern)=LOWER(?)').get(pattern);
      if (existing) {
        db.prepare('UPDATE tx_rules SET категория=?, property_id=? WHERE id=?').run(категория, property_id || null, existing.id);
        return res.json({ ok: true, id: existing.id, updated: true });
      }
      const result = db.prepare('INSERT INTO tx_rules (pattern, категория, property_id) VALUES (?,?,?)').run(pattern, категория, property_id || null);
      res.json({ ok: true, id: result.lastInsertRowid });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── DELETE /rules/:id ──────────────────────────────────────
  router.delete('/rules/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM tx_rules WHERE id=?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /transactions/all — clear all transactions and import sessions
  router.delete('/transactions/all', (req, res) => {
    try {
      const count = db.prepare('SELECT COUNT(*) as c FROM transactions').get().c;
      db.prepare('DELETE FROM transactions').run();
      db.prepare('DELETE FROM import_sessions').run();
      res.json({ ok: true, deleted: count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
