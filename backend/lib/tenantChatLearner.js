// Skyrent Tenant Chat Learner — Phase 4
// Weekly batch: read the past N days of tenant_chat_messages, ask Claude
// to spot recurring questions whose existing answers were weak, and stage
// suggestions in chat_learning_queue for admin review.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-4-6';
const DEFAULT_WINDOW_DAYS = 7;
const MIN_USER_MESSAGES   = 3;     // skip if there's almost no traffic

// Load chats from the window, grouped per tenant_user_id, with property
// context attached (first active property per tenant).
function loadRecentChats(db, days) {
  const rows = db.prepare(`
    SELECT m.id, m.tenant_user_id, m.role, m.content, m.created_at
    FROM tenant_chat_messages m
    WHERE m.created_at >= datetime('now', ?)
    ORDER BY m.tenant_user_id, m.created_at, m.id
  `).all(`-${days} days`);

  // Map tenant -> first active property (used for scope = per-apartment)
  const tenantIds = [...new Set(rows.map(r => r.tenant_user_id))];
  const tenantProp = {};
  if (tenantIds.length) {
    const placeholders = tenantIds.map(() => '?').join(',');
    const contracts = db.prepare(`
      SELECT tenant_user_id, property_id
      FROM contracts
      WHERE tenant_user_id IN (${placeholders})
        AND status IN ('active','sent','draft')
        AND property_id IS NOT NULL
      ORDER BY (status='active') DESC, created_at DESC
    `).all(...tenantIds);
    for (const c of contracts) {
      if (!tenantProp[c.tenant_user_id]) tenantProp[c.tenant_user_id] = c.property_id;
    }
  }

  // Group rows per tenant
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.tenant_user_id]) grouped[r.tenant_user_id] = [];
    grouped[r.tenant_user_id].push(r);
  }

  return Object.entries(grouped).map(([uid, msgs]) => ({
    tenant_user_id: Number(uid),
    property_id: tenantProp[uid] || null,
    messages: msgs,
  }));
}

// Plain-text transcript per tenant for the prompt
function formatTranscript(session) {
  const head = `--- Наемател #${session.tenant_user_id} (имот #${session.property_id || '—'}) ---`;
  const body = session.messages.map(m => {
    const tag = m.role === 'user' ? 'Q' : 'A';
    return `${tag}: ${String(m.content || '').replace(/\s+/g, ' ').slice(0, 600)}`;
  }).join('\n');
  return `${head}\n${body}`;
}

async function askClaude({ transcripts, propertyMap }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY не е конфигуриран');
  const client = new (Anthropic.default || Anthropic)({ apiKey });

  const propBlock = Object.entries(propertyMap)
    .map(([id, p]) => `  #${id} — ${p['адрес']}${p['район'] ? ` (${p['район']})` : ''}`)
    .join('\n') || '  (няма)';

  const prompt = `Ти си анализатор за Skyrent — система за наем на имоти. Получаваш разговори между наематели и AI асистент от последната седмица. Целта ти: намери ВЪПРОСИ КОИТО СЕ ПОВТАРЯТ или въпроси на които AI-ят НЕ е дал добър отговор, и предложи какво да се добави в базата знания, за да не остават без отговор следващия път.

ИМОТИ:
${propBlock}

РАЗГОВОРИ:
${transcripts.join('\n\n')}

ВЪРНИ СТРОГО JSON МАСИВ от обекти. Без markdown, без обяснителен текст преди или след. Всеки обект:
{
  "question": "представителна форма на въпроса (на български)",
  "proposed_answer": "конкретен предложен отговор който трябва да бъде добавен в knowledge base",
  "scope": "per-apartment" | "global",
  "property_ids": [числа — само ако scope=per-apartment; иначе празен масив],
  "reasoning": "1 изречение защо това е важно",
  "sample_count": число — колко пъти подобен въпрос е бил зададен
}

ПРАВИЛА:
- Игнорирай разговори с по-малко от 2 user съобщения.
- НЕ предлагай елементи които вече очевидно са били отговорени добре от AI-я.
- НЕ дублирай — групирай подобни въпроси в един запис.
- scope="global" само ако очевидно се отнася за всички имоти (напр. как се плаща, валута, общи правила).
- scope="per-apartment" с property_ids — за специфични въпроси за конкретен имот.
- Ако няма достойни кандидати — върни празен масив [].
- Бъди консервативен — по-добре 0 предложения отколкото шум.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = (response.content?.[0]?.text || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[chatLearner] Claude returned invalid JSON:', text.slice(0, 300));
    return [];
  }
}

function persistSuggestions(db, suggestions) {
  if (!suggestions.length) return 0;
  const stmt = db.prepare(`
    INSERT INTO chat_learning_queue
      (question, proposed_answer, scope, property_ids, reasoning, sample_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  for (const s of suggestions) {
    if (!s.question || !s.proposed_answer) continue;
    const scope = s.scope === 'global' ? 'global' : 'per-apartment';
    const propIds = JSON.stringify(Array.isArray(s.property_ids) ? s.property_ids : []);
    stmt.run(
      String(s.question).slice(0, 500),
      String(s.proposed_answer).slice(0, 2000),
      scope,
      propIds,
      String(s.reasoning || '').slice(0, 500),
      Number(s.sample_count) || 1,
    );
    inserted++;
  }
  return inserted;
}

async function runWeeklyAnalysis(db, options = {}) {
  const days = options.days || DEFAULT_WINDOW_DAYS;
  const sessions = loadRecentChats(db, days);

  const totalUserMsgs = sessions.reduce((s, x) => s + x.messages.filter(m => m.role === 'user').length, 0);
  if (totalUserMsgs < MIN_USER_MESSAGES) {
    return { skipped: true, reason: 'insufficient_traffic', user_messages: totalUserMsgs };
  }

  // Resolve property metadata for the prompt
  const propIds = [...new Set(sessions.map(s => s.property_id).filter(Boolean))];
  const propertyMap = {};
  if (propIds.length) {
    const placeholders = propIds.map(() => '?').join(',');
    const props = db.prepare(
      `SELECT id, адрес, район FROM properties WHERE id IN (${placeholders})`
    ).all(...propIds);
    for (const p of props) propertyMap[p.id] = p;
  }

  const transcripts = sessions.map(formatTranscript);
  const suggestions = await askClaude({ transcripts, propertyMap });
  const inserted = persistSuggestions(db, suggestions);

  return {
    skipped: false,
    sessions: sessions.length,
    user_messages: totalUserMsgs,
    suggestions_received: suggestions.length,
    queued: inserted,
  };
}

// Approve a queue item → write to chat_learned_faqs and mark approved.
// If scope=global, one FAQ with property_id NULL. If per-apartment, one
// FAQ per property_id in the saved list.
function approveQueueItem(db, queueId, overrides, reviewerId) {
  const row = db.prepare('SELECT * FROM chat_learning_queue WHERE id=?').get(queueId);
  if (!row) throw new Error('Queue item not found');
  if (row.status !== 'pending') throw new Error(`Item already ${row.status}`);

  const question = (overrides?.question ?? row.question);
  const answer   = (overrides?.proposed_answer ?? row.proposed_answer);
  const scope    = (overrides?.scope ?? row.scope);
  let propIds = [];
  try { propIds = JSON.parse(overrides?.property_ids ?? row.property_ids ?? '[]'); } catch(_) {}

  const insert = db.prepare(`
    INSERT INTO chat_learned_faqs (property_id, question, answer, source_queue_id)
    VALUES (?, ?, ?, ?)
  `);
  if (scope === 'global' || propIds.length === 0) {
    insert.run(null, question, answer, queueId);
  } else {
    for (const pid of propIds) insert.run(Number(pid), question, answer, queueId);
  }

  db.prepare(`
    UPDATE chat_learning_queue
    SET status='approved', reviewed_at=CURRENT_TIMESTAMP, reviewed_by=?
    WHERE id=?
  `).run(reviewerId || null, queueId);

  return { ok: true };
}

function rejectQueueItem(db, queueId, reviewerId) {
  const row = db.prepare('SELECT id, status FROM chat_learning_queue WHERE id=?').get(queueId);
  if (!row) throw new Error('Queue item not found');
  if (row.status !== 'pending') throw new Error(`Item already ${row.status}`);
  db.prepare(`
    UPDATE chat_learning_queue
    SET status='rejected', reviewed_at=CURRENT_TIMESTAMP, reviewed_by=?
    WHERE id=?
  `).run(reviewerId || null, queueId);
  return { ok: true };
}

module.exports = { runWeeklyAnalysis, approveQueueItem, rejectQueueItem };
