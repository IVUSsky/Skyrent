// Месечно издаване (и по желание изпращане) на наемните фактури.
//
// Досега фактурите се пускаха само ръчно от Фактури → „+ Генерирай всички".
// Тук същото става на избран ден от месеца, за всички имоти с включено
// фактуриране. Изпращането по мейл е ОТДЕЛЕН ключ и по подразбиране е
// изключено — нищо не тръгва към наематели, докато Иво не го включи.
//
// Настройката е в settings['monthly_invoicing'] (JSON):
//   { enabled: false, day: 1, send: false }
// Последното изпълнение се пази в settings['monthly_invoicing_last_run'] =
// 'ГГГГ-ММ', за да не се повтаря при рестарт на контейнера в същия ден.

const DEFAULTS = { enabled: false, day: 1, send: false };

function readSettings(db) {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='monthly_invoicing'").get();
    if (!row) return { ...DEFAULTS };
    const v = JSON.parse(row.value) || {};
    return {
      enabled: v.enabled === true || v.enabled === 'true' || v.enabled === 1,
      day: Math.min(28, Math.max(1, Number(v.day) || DEFAULTS.day)), // 28 — за да го има всеки месец
      send: v.send === true || v.send === 'true' || v.send === 1,
    };
  } catch { return { ...DEFAULTS }; }
}

function writeSettings(db, patch) {
  const cur = readSettings(db);
  const next = {
    enabled: patch.enabled != null ? !!patch.enabled : cur.enabled,
    day: patch.day != null ? Math.min(28, Math.max(1, Number(patch.day) || cur.day)) : cur.day,
    send: patch.send != null ? !!patch.send : cur.send,
  };
  db.prepare("INSERT INTO settings (key, value) VALUES ('monthly_invoicing', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(JSON.stringify(next));
  return next;
}

const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Дължи ли се пускане днес: включено + денят съвпада + не е пускано този месец.
function dueToday(db, now = new Date()) {
  const s = readSettings(db);
  if (!s.enabled) return { due: false, reason: 'изключено' };
  if (now.getDate() !== s.day) return { due: false, reason: `не е ${s.day}-о число` };
  const last = db.prepare("SELECT value FROM settings WHERE key='monthly_invoicing_last_run'").get();
  if (last?.value === ym(now)) return { due: false, reason: 'вече е пуснато този месец' };
  return { due: true, settings: s };
}

// Имотите, за които се издава фактура — същият критерий като екрана Фактури.
function billableProperties(db) {
  return db.prepare(
    `SELECT id, адрес, наемател, email FROM properties
      WHERE invoice_enabled = 1 AND статус = '✅' AND COALESCE(наемател,'') != ''
      ORDER BY id`
  ).all();
}

// deps: { generate, send } — подменят се в тестовете; по подразбиране са
// истинските функции от routes/invoices.js (изисква се лениво заради цикъла).
async function runMonthlyInvoicing(db, opts = {}) {
  const now = opts.now || new Date();
  const month = opts.month || ym(now);
  const dry = !!opts.dry;
  const s = { ...readSettings(db), ...(opts.settings || {}) };
  const sendWanted = opts.send != null ? !!opts.send : s.send;

  let generate = opts.generate, send = opts.send_fn;
  if (!generate || !send) {
    const inv = require('../routes/invoices');
    generate = generate || inv.generateRentInvoice;
    send = send || inv.sendInvoiceEmail;
  }

  const result = { month, dry, created: [], skipped: [], sent: [], errors: [] };
  for (const p of billableProperties(db)) {
    try {
      if (dry) {
        const exists = db.prepare(
          `SELECT invoice_number FROM rent_invoices
            WHERE property_id=? AND month=? AND type='invoice' AND (product IS NULL OR product='наем')`
        ).get(p.id, month);
        if (exists) result.skipped.push({ property_id: p.id, адрес: p.адрес, reason: 'duplicate', invoice_number: exists.invoice_number });
        else result.created.push({ property_id: p.id, адрес: p.адрес, наемател: p.наемател });
        continue;
      }
      const r = await generate(db, { property_id: p.id, month });
      if (!r.ok) { result.skipped.push({ property_id: p.id, адрес: p.адрес, reason: r.reason || 'неуспешно' }); continue; }
      result.created.push({ property_id: p.id, адрес: p.адрес, наемател: p.наемател, id: r.id, invoice_number: r.invoice_number });

      if (sendWanted) {
        const row = db.prepare('SELECT * FROM rent_invoices WHERE id=?').get(r.id);
        const sr = await send(db, row);
        if (sr.ok) result.sent.push({ invoice_number: r.invoice_number, to: sr.sent_to });
        else result.errors.push({ property_id: p.id, invoice_number: r.invoice_number, error: sr.error });
      }
    } catch (e) {
      result.errors.push({ property_id: p.id, адрес: p.адрес, error: e.message });
    }
  }
  if (!dry) {
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES ('monthly_invoicing_last_run', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(month);
    } catch (_) {}
  }
  return result;
}

// Дневна проверка (в 07:00) за всички организации — всяка със своите настройки.
function startMonthlyInvoiceCron({ controlDb, getOrgDb }) {
  const cron = require('node-cron');
  cron.schedule('0 7 * * *', async () => {
    let orgs = [];
    try { orgs = controlDb.prepare('SELECT id FROM organizations').all(); } catch (_) { orgs = [{ id: 1 }]; }
    for (const o of orgs) {
      try {
        const db = getOrgDb(o.id);
        const d = dueToday(db);
        if (!d.due) continue;
        const r = await runMonthlyInvoicing(db);
        console.log(`[monthlyInvoice] org ${o.id}: издадени ${r.created.length}, прескочени ${r.skipped.length}, изпратени ${r.sent.length}, грешки ${r.errors.length}`);
        if (r.errors.length) console.warn('[monthlyInvoice] грешки:', JSON.stringify(r.errors));
      } catch (e) {
        console.error(`[monthlyInvoice] org ${o.id} failed:`, e.message);
      }
    }
  });
  console.log('[monthlyInvoice] дневна проверка в 07:00');
}

module.exports = { readSettings, writeSettings, dueToday, billableProperties, runMonthlyInvoicing, startMonthlyInvoiceCron, DEFAULTS };
