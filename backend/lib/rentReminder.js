// Напомняне за забавен наем — текстът и кой го получава.
//
// Решението на Иво: писмото отива до НАЕМАТЕЛЯ, но само след негово
// потвърждение. Затова тук няма изпращане — само се подготвя какво би се
// изпратило. Самото пращане е отделно действие, по един получател.
//
// ⚠️ Разпознаването на плащане изостава: банковото извлечение се качва на
// ръка, а Stripe идва с ден-два закъснение. Затова писмото ВИНАГИ съдържа
// изход „ако вече сте платили, не му обръщайте внимание" — иначе един
// неразпознат превод праща упрек на изряден наемател.

const BG_MONTHS = [
  'януари', 'февруари', 'март', 'април', 'май', 'юни',
  'юли', 'август', 'септември', 'октомври', 'ноември', 'декември',
];

const money = (n) => Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function monthName(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${BG_MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(ym || '');
}

// Денят на падежа като дата. Месеци с по-малко дни: 31-во число в ноември
// става 30-то, вместо да прелива в декември.
function dueDate(ym, dueDay) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo, Math.min(Math.max(1, Number(dueDay) || 5), last)));
}

function daysLate(ym, dueDay, today = new Date()) {
  const d = dueDate(ym, dueDay);
  if (!d) return 0;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.round((t - d.getTime()) / 86400000));
}

const fmtDate = (d) => d
  ? `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`
  : '';

// Кой реално може да получи напомняне. Имот без наем, без наемател или без
// имейл не влиза — иначе списъкът се пълни с редове, по които нищо не може
// да се направи.
function remindable(properties = [], { month, today = new Date() } = {}) {
  return properties
    .filter(p => p.is_overdue && Number(p.наем) > 0)
    .map(p => ({
      property_id: p.id,
      address: p.адрес || '',
      tenant: p.наемател || '',
      email: String(p.email || '').trim(),
      amount: Number(p.наем) || 0,
      paid_amount: Number(p.paid_amount) || 0,
      due_day: p.due_day || 5,
      due_date: fmtDate(dueDate(month, p.due_day || 5)),
      days_late: daysLate(month, p.due_day || 5, today),
      month,
      can_send: !!String(p.email || '').trim(),
      blocked: String(p.email || '').trim() ? null : 'няма имейл за връзка',
    }))
    .sort((a, b) => b.days_late - a.days_late);
}

function reminderSubject(row) {
  return `Напомняне за наем — ${row.address}, ${monthName(row.month)}`;
}

// Учтиво и фактическо. Без заплахи и без лихви — това е първо напомняне, а
// не покана за доброволно изпълнение.
function reminderBody(row, issuer = {}) {
  const lines = [
    `Здравейте${row.tenant ? ', ' + row.tenant : ''},`,
    '',
    `Напомняме Ви, че наемът за ${monthName(row.month)} за ${row.address} в размер на ${money(row.amount)} EUR още не е отразен като постъпил.`,
    row.due_date ? `Падежът беше ${row.due_date}${row.days_late ? ` — преди ${row.days_late} ${row.days_late === 1 ? 'ден' : 'дни'}` : ''}.` : '',
    '',
    'Ако плащането вече е направено, моля не обръщайте внимание на това писмо — изпратете ни платежното нареждане и ще го отразим.',
    '',
  ];
  if (issuer.iban) {
    lines.push(`Банкова сметка: ${issuer.iban}`);
    lines.push(`Основание: наем ${monthName(row.month)}, ${row.address}`);
    lines.push('');
  }
  lines.push('Поздрави,');
  lines.push(issuer.name || 'Sky Capital');
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

// Признак, че наемът за месеца е постъпил — последната преграда пред
// изпращането. Списъкът на екрана може да е отпреди половин час; ако в
// това време преводът е влязъл, писмото не бива да тръгва.
//
// Нарочно е ЩЕДРА: всяко подозрение за плащане спира писмото. Пропуснато
// напомняне се вижда в списъка и се праща пак; изпратен упрек към изряден
// наемател не се връща. Затова се брои и натрупаното покритие (предплащане),
// и частичната сума.
function paidSignForMonth(db, propertyId, month) {
  const one = (sql, ...args) => {
    try { return db.prepare(sql).get(...args); } catch { return null; }   // липсваща таблица
  };
  const bank = one(
    `SELECT COUNT(*) n FROM transactions
      WHERE категория='наем' AND operation='Кт' AND property_id=? AND месец=?`, propertyId, month);
  if (bank && bank.n > 0) return { paid: true, reason: 'банков превод за месеца' };

  const manual = one(`SELECT COUNT(*) n FROM manual_rent_payments WHERE property_id=? AND month=?`, propertyId, month);
  if (manual && manual.n > 0) return { paid: true, reason: 'ръчно въведено плащане' };

  const inv = one(
    `SELECT COUNT(*) n FROM rent_invoices
      WHERE type='invoice' AND COALESCE(product,'наем')='наем'
        AND property_id=? AND month=? AND paid_at IS NOT NULL`, propertyId, month);
  if (inv && inv.n > 0) return { paid: true, reason: 'платена фактура' };

  // Предплащане: преводът е дошъл в по-късен месец (често края на предходния),
  // но покрива този. Витали плаща на 30.09 за октомври.
  const ahead = one(
    `SELECT COUNT(*) n FROM transactions
      WHERE категория='наем' AND operation='Кт' AND property_id=? AND COALESCE(месец,'') > ?`, propertyId, month);
  if (ahead && ahead.n > 0) return { paid: true, reason: 'плащане за следващ месец — провери предплащането' };

  return { paid: false, reason: null };
}

// Второ напомняне за същия месец не тръгва само. Три писма за един наем
// обиждат човека повече от самото закъснение.
function alreadySent(db, propertyId, month) {
  try {
    return db.prepare(
      `SELECT id, sent_to, created_at FROM rent_reminders
        WHERE property_id=? AND month=? ORDER BY created_at DESC LIMIT 1`
    ).get(propertyId, month) || null;
  } catch { return null; }
}

module.exports = {
  remindable, reminderSubject, reminderBody, monthName, dueDate, daysLate, BG_MONTHS,
  paidSignForMonth, alreadySent,
};
