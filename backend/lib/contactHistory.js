// История на един контакт — всичко, което сме си разменили с този човек.
//
// Данните ги има отдавна, но на пет места: напомняния за наем, фактури,
// договори, заявки за поддръжка и разговори в портала. Нито едно от тях не
// се връзва с указателя по ключ — контактите нямат id в договорите, а се
// разпознават по ЕГН/имейл/телефон/име, както и при дубликатите.
//
// ⚠️ Какво НЕ влиза, за да не се чете повече, отколкото има:
//   • писма, пратени от собствената поща на Иво — Skyrent не ги вижда;
//   • отговори на наемателя по имейл — няма входяща поща;
//   • разговорите в 💬 са с AI помощника, НЕ с Иво. Отбелязано е изрично.

const { normName, sortedName, phoneKey, emailKey, egnKey } = require('./partyDedupe');

// Ключовете, по които се разпознава същият човек в другите таблици.
function contactKeys(party = {}) {
  return {
    emails: new Set([emailKey(party.email)].filter(Boolean)),
    phones: new Set([phoneKey(party.phone)].filter(Boolean)),
    egns:   new Set([egnKey(party.egn)].filter(Boolean)),
    name:   sortedName(party.name),
  };
}

// Съвпада ли редът с контакта. Името само по себе си е слабо доказателство,
// затова се ползва единствено когато няма нито ЕГН, нито имейл, нито телефон
// за сверяване — иначе двама съименници биха споделили история.
function matchesContact(keys, row = {}) {
  const e = emailKey(row.email || row.tenant_email || row.sent_to);
  if (e && keys.emails.has(e)) return true;
  const g = egnKey(row.egn || row.tenant_egn);
  if (g && keys.egns.has(g)) return true;
  const p = phoneKey(row.phone || row.tenant_phone);
  if (p && keys.phones.has(p)) return true;
  const hasStrong = !!(e || g || p);
  if (hasStrong) return false;
  const n = sortedName(row.name || row.tenant_name);
  return !!n && !!keys.name && n === keys.name;
}

const BG_MONTHS = ['януари','февруари','март','април','май','юни','юли','август','септември','октомври','ноември','декември'];
const monthName = (ym) => {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${BG_MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(ym || '');
};

const at = (v) => (v ? String(v) : null);

// Сглобява събитията. Всеки източник се подава вече филтриран от рутера —
// тук само се превежда на човешки и се подрежда.
function buildTimeline(src = {}) {
  const ev = [];
  const push = (when, kind, icon, title, detail, extra) => {
    if (!when) return;
    ev.push({ at: when, kind, icon, title, detail: detail || null, ...(extra || {}) });
  };

  for (const r of src.reminders || []) {
    push(at(r.created_at), 'reminder', '📧',
      `Напомняне за наем — ${monthName(r.month)}`,
      `до ${r.sent_to}`, { subject: r.subject || null, body: r.body || null, by: r.sent_by || null });
  }

  for (const c of src.contracts || []) {
    push(at(c.created_at || c.start_date), 'contract', '📄',
      `Договор ${c.contract_number || ''}`.trim(),
      c.property_address ? `${c.property_address}` : null, { contract_id: c.id });
    if (c.status === 'terminated' && c.terminated_at) {
      push(at(c.terminated_at), 'contract_end', '📕',
        `Прекратен договор ${c.contract_number || ''}`.trim(), null, { contract_id: c.id });
    }
  }

  for (const i of src.invoices || []) {
    push(at(i.sent_at), 'invoice_sent', '🧾',
      `Изпратена фактура № ${i.invoice_number || ''}`.trim(),
      i.month ? monthName(i.month) : null, { invoice_id: i.id });
    push(at(i.paid_at), 'invoice_paid', '✅',
      `Платена фактура № ${i.invoice_number || ''}`.trim(),
      i.total != null ? `${i.total} ${i.currency || 'EUR'}` : null, { invoice_id: i.id });
  }

  for (const t of src.tickets || []) {
    push(at(t.created_at), 'ticket', '🛟',
      `Заявка: ${t.title || t.category || ''}`.trim(),
      t.description ? String(t.description).slice(0, 160) : null, { ticket_id: t.id, status: t.status });
    if (t.resolved_at) {
      push(at(t.resolved_at), 'ticket_done', '🛟',
        `Затворена заявка: ${t.title || ''}`.trim(), null, { ticket_id: t.id });
    }
  }

  // Разговорите се групират по ДЕН, а не по реплика — иначе една сесия с
  // помощника залива цялата история с двайсет реда.
  const byDay = new Map();
  for (const m of src.chats || []) {
    const day = String(m.created_at || '').slice(0, 10);
    if (!day) continue;
    const d = byDay.get(day) || { n: 0, first: null, last: m.created_at };
    d.n += 1;
    if (m.role === 'user' && !d.first) d.first = m.content;
    byDay.set(day, d);
  }
  for (const [day, d] of byDay) {
    push(`${day} 23:59:59`, 'chat', '💬',
      `Разговор с помощника — ${d.n} ${d.n === 1 ? 'съобщение' : 'съобщения'}`,
      d.first ? String(d.first).slice(0, 160) : null, { day, assistant: true });
  }

  // Най-новото отгоре.
  return ev.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

module.exports = { contactKeys, matchesContact, buildTimeline, monthName };
