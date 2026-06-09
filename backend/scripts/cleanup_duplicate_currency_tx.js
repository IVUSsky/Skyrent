/**
 * Cleanup на double-import от BG→EUR transition (Jan 2026+).
 *
 * Bug: Bank statements от 2026 нататък са били импортирани два пъти —
 * веднъж в EUR (нативни стойности), веднъж в BGN (конвертирани).
 * Резултат: всеки физически платеж = 2 записа в transactions table.
 *
 * Стратегия: Изтрий BGN дубликати, остави EUR оригиналите.
 *
 * Match criteria за дубликат:
 *   - Същата дата
 *   - Същият контрагент (or both null/empty)
 *   - Същата operation (Дт/Кт)
 *   - BGN.сума ≈ EUR.сума × 1.95583 (tolerance 0.02 BGN)
 *
 * Usage:
 *   node backend/scripts/cleanup_duplicate_currency_tx.js          # dry-run
 *   node backend/scripts/cleanup_duplicate_currency_tx.js --go     # реално
 */
const https = require('https');

const API = 'https://gracious-stillness-production-dd4b.up.railway.app';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJJVlVTIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzgwODEwNzg4LCJleHAiOjE3ODE0MTU1ODh9.bz8XxQSnF-1OC31lJVJkuHCyf4pTOq9vuh61MUrqFuY';
const GO = process.argv.includes('--go');
const BGN_RATE = 1.95583;
const TOLERANCE = 0.02;  // ± 2 стотинки

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(API + path, { headers: { Authorization: `Bearer ${TOKEN}` } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d.slice(0, 300))); } });
    }).on('error', reject);
  });
}

function del(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(API + path, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${TOKEN}` },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(d)); } catch { resolve({ ok: true }); }
        } else reject(new Error(`HTTP ${res.statusCode}: ${d}`));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  console.log('Mode:', GO ? '🔥 LIVE DELETE' : '🧪 DRY-RUN');
  console.log('API:', API);

  console.log('\nFetching all transactions...');
  const data = await get('/api/import/transactions?limit=10000');
  const all = (data.rows || data).filter(t => (t.дата || '') >= '2026-01-01');
  console.log('Transactions от 2026-01-01 нататък:', all.length);

  // Index by date + контрагент + operation
  const byKey = new Map();
  for (const t of all) {
    const key = `${t.дата}|${(t.контрагент || '').trim()}|${t.operation}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(t);
  }

  // Find pairs: one BGN, one EUR where BGN ≈ EUR × 1.95583
  const duplicatePairs = [];
  for (const [key, txs] of byKey) {
    if (txs.length < 2) continue;
    const bgnTxs = txs.filter(t => t.currency === 'BGN');
    const eurTxs = txs.filter(t => t.currency === 'EUR');
    for (const bgn of bgnTxs) {
      const matchingEur = eurTxs.find(eur =>
        Math.abs(Math.abs(bgn.сума) - Math.abs(eur.сума) * BGN_RATE) < TOLERANCE
      );
      if (matchingEur) {
        duplicatePairs.push({ bgn, eur: matchingEur });
      }
    }
  }

  console.log('\n═══ DUPLICATE PAIRS FOUND ═══');
  console.log('Total pairs:', duplicatePairs.length);

  // Summary by operation type
  const byOp = {};
  for (const { bgn } of duplicatePairs) {
    const op = bgn.operation;
    if (!byOp[op]) byOp[op] = { count: 0, sum: 0 };
    byOp[op].count++;
    byOp[op].sum += Math.abs(bgn.сума);
  }
  console.log('\nBGN duplicates за изтриване по operation:');
  console.table(byOp);

  // Show first 20 examples
  console.log('\nПримери (top 20 по сума):');
  console.table(
    duplicatePairs
      .sort((a, b) => Math.abs(b.bgn.сума) - Math.abs(a.bgn.сума))
      .slice(0, 20)
      .map(({ bgn, eur }) => ({
        дата: bgn.дата,
        op: bgn.operation,
        кат: bgn.категория,
        контрагент: (bgn.контрагент || '').slice(0, 20),
        BGN_id: bgn.id,
        BGN_сума: Math.round(bgn.сума * 100) / 100,
        EUR_id: eur.id,
        EUR_сума: Math.round(eur.сума * 100) / 100,
        check: (Math.round(eur.сума * BGN_RATE * 100) / 100) + ' BGN?',
      }))
  );

  if (!GO) {
    console.log('\n✓ Dry-run complete. Re-run with --go to delete BGN duplicates.');
    return;
  }

  // LIVE DELETE
  console.log('\n🔥 DELETING BGN duplicates...');
  let deleted = 0;
  let errors = 0;
  for (const { bgn } of duplicatePairs) {
    try {
      await del(`/api/import/transactions/${bgn.id}`);
      deleted++;
      if (deleted % 20 === 0) process.stdout.write(`  ${deleted}...\n`);
    } catch (e) {
      errors++;
      console.error(`  FAIL #${bgn.id}: ${e.message}`);
    }
  }
  console.log(`\nDone. Deleted: ${deleted}, Errors: ${errors}`);
  console.log('\nNext: re-curl /api/personal/summary за месеците 2026-01..-06 за проверка.');
})();
