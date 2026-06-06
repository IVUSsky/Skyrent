/**
 * Data quality диагностика — какво е в DB-то реално.
 * Run: node backend/scripts/check_data_quality.js
 */
const { initDb } = require('../db/db');

(async () => {
  const db = await initDb();

  console.log('══ TABLES ══');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log(tables.map(t => t.name).join(', '));

  console.log('\n══ expense_invoices ══');
  const expCount = db.prepare('SELECT COUNT(*) as n FROM expense_invoices').get();
  console.log('Total rows:', expCount.n);

  console.log('\n══ transactions ══');
  const txCount = db.prepare('SELECT COUNT(*) as n FROM transactions').get();
  console.log('Total rows:', txCount.n);

  if (txCount.n > 0) {
    const txByOp = db.prepare(`
      SELECT operation, COUNT(*) as n, ROUND(SUM(сума), 2) as sum
      FROM transactions
      GROUP BY operation
    `).all();
    console.log('By operation:');
    console.table(txByOp);

    const txByCat = db.prepare(`
      SELECT COALESCE(категория, '<NULL>') as cat, operation,
             COUNT(*) as n, ROUND(SUM(сума), 2) as sum
      FROM transactions
      GROUP BY cat, operation
      ORDER BY sum DESC
      LIMIT 30
    `).all();
    console.log('By category × operation (top 30 by sum):');
    console.table(txByCat);

    const txByMonth = db.prepare(`
      SELECT месец, operation, COUNT(*) as n, ROUND(SUM(сума), 2) as sum
      FROM transactions
      WHERE месец >= '2025-06'
      GROUP BY месец, operation
      ORDER BY месец DESC, operation
    `).all();
    console.log('Last 12m (Jun 2025+) by месец × operation:');
    console.table(txByMonth);

    const txWithProp = db.prepare('SELECT COUNT(*) as n FROM transactions WHERE property_id IS NOT NULL').get();
    const txNoProp = db.prepare('SELECT COUNT(*) as n FROM transactions WHERE property_id IS NULL').get();
    console.log(`property_id assigned: ${txWithProp.n} | NULL: ${txNoProp.n}`);
  }

  console.log('\n══ properties ══');
  const propTotal = db.prepare('SELECT COUNT(*) as n FROM properties').get();
  const propActive = db.prepare("SELECT COUNT(*) as n FROM properties WHERE статус = '✅'").get();
  console.log(`Total: ${propTotal.n} | Active (✅): ${propActive.n}`);
  const inactive = db.prepare(`
    SELECT id, адрес, тип, наем, статус FROM properties
    WHERE статус != '✅' OR статус IS NULL
    ORDER BY id
  `).all();
  console.log('Non-active properties:');
  console.table(inactive.map(p => ({ id: p.id, адрес: p['адрес'], тип: p['тип'], наем: p['наем'], статус: p['статус'] })));

  console.log('\n══ loans ══');
  const loans = db.prepare('SELECT * FROM loans').all();
  console.log(`Total loans: ${loans.length}`);
  console.table(loans.map(l => ({
    id: l.id, банка: l.банка, договор: l.договор,
    остатък: l['остатък'], currency: l.currency,
    лихва: l['лихва'], имоти: l['имоти'] || '<empty>',
  })));

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
