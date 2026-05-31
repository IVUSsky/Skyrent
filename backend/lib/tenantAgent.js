// Skyrent Tenant Chat Agent — Phase 2
// Claude Haiku 4.5 + tool use + prompt caching on apartment knowledge.
// Single rolling conversation per tenant (no session concept yet).

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_HISTORY = 20;     // turns sent back to Claude on each call
const HISTORY_WINDOW_DAYS = 7;   // older messages aren't pulled — fresh context after a gap
const MAX_TOOL_LOOPS = 5;   // safety cap on tool-use iterations

// ── Read settings issuer (landlord IBAN etc.) ─────────────────────────
function getIssuer(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='issuer'").get();
  if (!row) return {};
  try { return JSON.parse(row.value); } catch { return {}; }
}

// ── Apartment context lookup (with simple in-process cache to avoid
//    re-querying every loop iteration within one request) ─────────────
function loadApartmentContext(db, userId) {
  // Find tenant's active properties via contracts
  const contracts = db.prepare(`
    SELECT c.*, p.адрес AS property_address, p.район, p.тип, p.площ
    FROM contracts c
    LEFT JOIN properties p ON p.id = c.property_id
    WHERE c.tenant_user_id=? AND c.status IN ('active','sent','draft')
    ORDER BY (c.status='active') DESC, c.created_at DESC
  `).all(userId);

  const propertyIds = [...new Set(contracts.map(c => c.property_id).filter(Boolean))];
  if (propertyIds.length === 0) return { properties: [], knowledge: [] };

  const placeholders = propertyIds.map(() => '?').join(',');
  const properties = db.prepare(
    `SELECT id, адрес, район, тип, площ, телефон, email,
            абонат_ток, абонат_вода, абонат_тец, абонат_вход
     FROM properties WHERE id IN (${placeholders})`
  ).all(...propertyIds);

  const knowledge = db.prepare(
    `SELECT * FROM apartment_knowledge WHERE property_id IN (${placeholders})`
  ).all(...propertyIds);

  // Inventory: appliances/furniture already maintained via the Inventory tab.
  // We deliberately skip purchase_price (privacy) and serial_number (rarely useful, often sensitive).
  const inventory = db.prepare(
    `SELECT property_id, category, name, brand, model, notes, common_problems,
            purchase_date, warranty_end
     FROM property_inventory
     WHERE property_id IN (${placeholders})
     ORDER BY property_id, sort_order, name`
  ).all(...propertyIds);

  // Approved learned FAQs — per-property + global (property_id IS NULL)
  const learnedFaqs = db.prepare(
    `SELECT property_id, question, answer FROM chat_learned_faqs
     WHERE property_id IN (${placeholders}) OR property_id IS NULL
     ORDER BY (property_id IS NULL), id DESC`
  ).all(...propertyIds);

  // Property photo counts + captions — for visual-question routing.
  // Tenant can browse the actual images in the 📷 Снимки tab.
  const photos = db.prepare(
    `SELECT property_id, caption FROM property_photos
     WHERE property_id IN (${placeholders})
     ORDER BY property_id, created_at`
  ).all(...propertyIds);

  return { properties, knowledge, inventory, learnedFaqs, photos };
}

function formatApartmentContext({ properties, knowledge, inventory = [], learnedFaqs = [], photos = [] }) {
  if (properties.length === 0) {
    return 'Наемателят още няма свързан имот в системата.';
  }
  const kbByProp = {};
  for (const k of knowledge) kbByProp[k.property_id] = k;

  const invByProp = {};
  for (const item of inventory) {
    if (!invByProp[item.property_id]) invByProp[item.property_id] = [];
    invByProp[item.property_id].push(item);
  }

  const faqByProp = {};
  const globalFaqs = [];
  for (const f of learnedFaqs) {
    if (f.property_id == null) globalFaqs.push(f);
    else {
      if (!faqByProp[f.property_id]) faqByProp[f.property_id] = [];
      faqByProp[f.property_id].push(f);
    }
  }

  const photosByProp = {};
  for (const ph of photos) {
    if (!photosByProp[ph.property_id]) photosByProp[ph.property_id] = [];
    photosByProp[ph.property_id].push(ph);
  }

  const propertyBlocks = properties.map(p => {
    const kb = kbByProp[p.id] || {};
    let appliances = [];
    let contacts = [];
    try { appliances = JSON.parse(kb.appliances_json || '[]'); } catch(_) {}
    try { contacts   = JSON.parse(kb.contacts_json   || '[]'); } catch(_) {}

    const lines = [
      `АПАРТАМЕНТ #${p.id} — ${p['адрес']}`,
      p['район']  ? `Район: ${p['район']}` : null,
      p['тип']    ? `Тип: ${p['тип']}`     : null,
      p['площ']   ? `Площ: ${p['площ']} m²` : null,
    ];

    if (kb.wifi_ssid || kb.wifi_password) {
      lines.push('', 'WIFI:',
        kb.wifi_ssid     ? `  SSID: ${kb.wifi_ssid}` : null,
        kb.wifi_password ? `  Парола: ${kb.wifi_password}` : null);
    }
    if (kb.internet_provider || kb.internet_account) {
      lines.push('', 'ИНТЕРНЕТ:',
        kb.internet_provider ? `  Доставчик: ${kb.internet_provider}` : null,
        kb.internet_account  ? `  Абонатен номер: ${kb.internet_account}` : null);
    }
    if (p['абонат_ток'] || p['абонат_вода'] || p['абонат_тец'] || p['абонат_вход']) {
      lines.push('', 'АБОНАТНИ НОМЕРА (комунални):',
        p['абонат_ток']  ? `  Ток: ${p['абонат_ток']}`    : null,
        p['абонат_вода'] ? `  Вода: ${p['абонат_вода']}`  : null,
        p['абонат_тец']  ? `  ТЕЦ: ${p['абонат_тец']}`    : null,
        p['абонат_вход'] ? `  Входна такса: ${p['абонат_вход']}` : null);
    }
    if (appliances.length) {
      lines.push('', 'УРЕДИ (ръчно въведени):');
      for (const a of appliances) {
        lines.push(`  • ${a.name || ''} ${a.brand_model ? `(${a.brand_model})` : ''}${a.instructions ? ` — ${a.instructions}` : ''}`);
      }
    }
    const propInventory = invByProp[p.id] || [];
    if (propInventory.length) {
      // Group by category for readability
      const byCat = {};
      for (const it of propInventory) {
        const cat = it.category || 'Друго';
        if (!byCat[cat]) byCat[cat] = [];
        byCat[cat].push(it);
      }
      lines.push('', 'ИНВЕНТАР / ОБЗАВЕЖДАНЕ:');
      for (const [cat, items] of Object.entries(byCat)) {
        lines.push(`  [${cat}]`);
        for (const it of items) {
          const brand = [it.brand, it.model].filter(Boolean).join(' ');
          const parts = [`    • ${it.name}`];
          if (brand) parts.push(`(${brand})`);
          lines.push(parts.join(' '));
          if (it.notes)           lines.push(`        бележка: ${it.notes}`);
          if (it.common_problems) lines.push(`        чести проблеми/решения: ${it.common_problems}`);
          if (it.warranty_end)    lines.push(`        гаранция до: ${it.warranty_end}`);
        }
      }
    }
    if (contacts.length) {
      lines.push('', 'КОНТАКТИ:');
      for (const c of contacts) {
        lines.push(`  • ${c.role || ''}: ${c.name || ''} ${c.phone ? `тел. ${c.phone}` : ''}${c.notes ? ` — ${c.notes}` : ''}`);
      }
    }
    if (kb.building_info)        lines.push('', `СГРАДА: ${kb.building_info}`);
    if (kb.payment_instructions) lines.push('', `ПЛАЩАНЕ: ${kb.payment_instructions}`);
    if (kb.free_faq)             lines.push('', `ДОПЪЛНИТЕЛНА ИНФОРМАЦИЯ: ${kb.free_faq}`);

    const propPhotos = photosByProp[p.id] || [];
    if (propPhotos.length) {
      lines.push('', `СНИМКИ: ${propPhotos.length} налични в раздел 📷 Снимки в портала.`);
      const captioned = propPhotos.filter(ph => ph.caption && ph.caption.trim());
      if (captioned.length) {
        lines.push('Заглавия:');
        for (const ph of captioned.slice(0, 10)) {
          lines.push(`  • ${ph.caption}`);
        }
      }
    }

    const propFaqs = faqByProp[p.id] || [];
    if (propFaqs.length) {
      lines.push('', 'НАУЧЕНИ FAQ (одобрени от админ):');
      for (const f of propFaqs) {
        lines.push(`  Q: ${f.question}`);
        lines.push(`  A: ${f.answer}`);
      }
    }

    return lines.filter(Boolean).join('\n');
  }).join('\n\n────────────────────────\n\n');

  let out = propertyBlocks;
  if (globalFaqs.length) {
    out += '\n\n════════════════════════\n\nОБЩИ FAQ (за всички имоти):\n';
    for (const f of globalFaqs) {
      out += `\n  Q: ${f.question}\n  A: ${f.answer}\n`;
    }
  }
  return out;
}

// ── Tool definitions sent to Claude ───────────────────────────────────
const TOOLS = [
  {
    name: 'get_unpaid_invoices',
    description: 'Връща списък с неплатени фактури на наемателя (наем). Използвай когато наемателят пита за дължима сума, текущ баланс или какво има за плащане.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_contract_details',
    description: 'Връща активния договор на наемателя — срок, месечен наем, ден на плащане, депозит, дни до изтичане. Използвай при въпроси за договора.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_deposit_info',
    description: 'Връща информация за депозита по активния договор — сума и валута. Използвай само при директен въпрос за депозита.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_payment_methods',
    description: 'Връща наличните начини за плащане на наема — IBAN на наемодателя и дали е достъпно картово плащане. Използвай когато наемателят пита как да плати.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  // Server-side tool — Anthropic runs the search and feeds results to the
  // model inline. max_uses caps cost (~$10 per 1000 searches).
  {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: 2,
  },
];

// Custom (client-executed) tools — used to distinguish from server tools
// like web_search in the tool-use loop.
const CUSTOM_TOOL_NAMES = new Set([
  'get_unpaid_invoices',
  'get_contract_details',
  'get_deposit_info',
  'get_payment_methods',
]);

// ── Tool runners — internal queries ───────────────────────────────────
function runTool(db, userId, name) {
  if (name === 'get_unpaid_invoices') {
    const rows = db.prepare(`
      SELECT i.invoice_number, i.type, i.month, i.total, i.due_date, i.issued_at
      FROM rent_invoices i
      WHERE i.paid_at IS NULL
        AND i.property_id IN (
          SELECT DISTINCT property_id FROM contracts
          WHERE tenant_user_id=? AND property_id IS NOT NULL
        )
      ORDER BY i.due_date ASC
    `).all(userId);
    const today = new Date().toISOString().slice(0, 10);
    const enriched = rows.map(r => ({
      ...r,
      is_overdue: r.due_date && r.due_date < today,
    }));
    const total = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    return { count: rows.length, total_due_eur: Number(total.toFixed(2)), invoices: enriched };
  }

  if (name === 'get_contract_details') {
    const c = db.prepare(`
      SELECT contract_number, status, start_date, end_date, monthly_rent, currency,
             payment_day, deposit, payment_method
      FROM contracts
      WHERE tenant_user_id=?
      ORDER BY (status='active') DESC, created_at DESC
      LIMIT 1
    `).get(userId);
    if (!c) return { error: 'Няма намерен активен договор за този наемател.' };
    let daysUntilExpiry = null;
    if (c.end_date) {
      const d = (new Date(c.end_date) - new Date()) / (1000 * 60 * 60 * 24);
      daysUntilExpiry = Math.round(d);
    }
    return { ...c, days_until_expiry: daysUntilExpiry };
  }

  if (name === 'get_deposit_info') {
    const c = db.prepare(`
      SELECT deposit, currency, contract_number
      FROM contracts
      WHERE tenant_user_id=?
      ORDER BY (status='active') DESC, created_at DESC
      LIMIT 1
    `).get(userId);
    if (!c) return { error: 'Няма намерен договор.' };
    return {
      amount: Number(c.deposit) || 0,
      currency: c.currency || 'EUR',
      contract_number: c.contract_number,
      note: 'Депозитът се връща при освобождаване на имота след проверка на инвентара.',
    };
  }

  if (name === 'get_payment_methods') {
    const issuer = getIssuer(db);
    const c = db.prepare(`
      SELECT payment_method FROM contracts
      WHERE tenant_user_id=? AND status='active'
      ORDER BY created_at DESC LIMIT 1
    `).get(userId);
    return {
      iban: issuer.iban || null,
      bank_name: issuer.bank || null,
      bic: issuer.bic || null,
      beneficiary: issuer.name || 'Sky Capital OOD',
      stripe_card_payment_available: c?.payment_method === 'карта (Stripe)' || true,
      note: 'За картово плащане използвай бутона "Плати" в раздел Фактури в портала.',
    };
  }

  return { error: `Непознат tool: ${name}` };
}

// ── Persistence: load + save chat history ─────────────────────────────
function loadHistory(db, userId, limit = MAX_HISTORY) {
  // Cap by both count and age — if the tenant comes back after a long gap,
  // we start a fresh conversation rather than dragging in stale context.
  const rows = db.prepare(`
    SELECT role, content FROM tenant_chat_messages
    WHERE tenant_user_id=?
      AND created_at >= datetime('now', ?)
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(userId, `-${HISTORY_WINDOW_DAYS} days`, limit);
  return rows.reverse().map(r => ({ role: r.role, content: r.content }));
}

function saveMessage(db, userId, role, content) {
  db.prepare(
    'INSERT INTO tenant_chat_messages (tenant_user_id, role, content) VALUES (?, ?, ?)'
  ).run(userId, role, String(content || ''));
}

// ── Main entry: ask the agent ─────────────────────────────────────────
async function askAgent(db, userId, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY не е конфигуриран на сървъра');

  const client = new (Anthropic.default || Anthropic)({ apiKey });

  // 1. Build system prompt with cached apartment knowledge
  const ctx = loadApartmentContext(db, userId);
  const apartmentBlock = formatApartmentContext(ctx);

  const systemBlocks = [
    {
      type: 'text',
      text: `Ти си AI асистент в портала за наематели на Sky Capital (Skyrent). Помагаш на наемателите САМИ да намерят отговора.

═══ АБСОЛЮТНО ПРАВИЛО — БЕЗ ИЗКЛЮЧЕНИЯ ═══
ЗАБРАНЕНИ са следните фрази (и каквато и да е тяхна вариация):
- "свържи се с управителя"
- "обърни се към управителя / наемодателя / собственика / екипа"
- "обади се на"
- "изпрати имейл на / на info@..."
- "попитай управителя"
- "контактувай с"
- "потърси съдействие от"

НИКОГА не насочвай наемателя към телефон, имейл, обаждане или друг човешки контакт. Дори когато наистина не знаеш отговор — не препоръчвай контакт с управителя.

═══ ЗАДЪЛЖИТЕЛНИ TOOL ИЗВИКВАНИЯ ═══
Преди да отговориш на следните типове въпроси, ВИНАГИ първо извикай съответния tool. НЕ казвай "нямам тази информация" преди да си опитал tool-а:

| Тема на въпроса | Задължителен tool |
|---|---|
| наем, месечна вноска, до кога е договорът, срок, ден на плащане, депозит-условие | get_contract_details |
| дължима сума, неплатено, баланс, фактура за месец X | get_unpaid_invoices |
| как да платя, IBAN, банкова сметка, картово плащане | get_payment_methods |
| депозит — размер, как се връща | get_deposit_info |

Ако tool върне поле = null или липсва (напр. monthly_rent: null), кажи: "В системата няма попълнена сума за наема" и насочи към раздел "📋 Договор" в портала. НЕ казвай "обърни се към управителя".

═══ ОБЩИ ПРАВИЛА ═══
- Засечи езика на въпроса (български / English / русский / українська) и отговори на СЪЩИЯ език. Default — български.
- Бъди кратък, директен, любезен. Без излишни любезности.
- Когато даваш суми, винаги слагай валутата.
- Не измисляй данни. Не давай юридически/счетоводни съвети.
- За визуални въпроси ("как изглежда X", "къде е Y", "покажи ми Z"): ако в контекста има секция СНИМКИ с подходящо заглавие, насочи: "Виж раздел 📷 Снимки в портала". НЕ описвай снимките сам — нямаш достъп до изображенията.

═══ КОГА ДА ТЪРСИШ В НЕТА (web_search) ═══
- САМО когато наемателят пита как да оправи / използва / настрои конкретен уред И имаш марка+модел в контекста (секции УРЕДИ или ИНВЕНТАР).
- Заявка: марка+модел+проблема (напр. "Daikin FTXM35K error code A3 troubleshooting").
- НЕ за общи въпроси за наем/договор/политика.
- След намиране — преведи на езика на наемателя, дай 2-4 кратки конкретни стъпки.`,
    },
    {
      type: 'text',
      text: `КОНТЕКСТ ЗА АПАРТАМЕНТА(ИТЕ) НА НАЕМАТЕЛЯ:\n\n${apartmentBlock}`,
      cache_control: { type: 'ephemeral' },
    },
  ];

  // 2. Build messages = prior history + new user message
  const history = loadHistory(db, userId);
  const messages = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  // 3. Tool-use loop
  let finalText = '';
  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemBlocks,
      tools: TOOLS,
      messages,
    });

    // Append the assistant turn to messages (needed if we need to feed tool_result back)
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];
      for (const block of response.content) {
        // Only handle our custom tools — server tools (web_search) are
        // executed by Anthropic and their results are already in the response.
        if (block.type === 'tool_use' && CUSTOM_TOOL_NAMES.has(block.name)) {
          let result;
          try {
            result = runTool(db, userId, block.name);
          } catch (e) {
            result = { error: e.message };
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }
      if (toolResults.length === 0) break;   // nothing more we can do
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // End of turn — extract text
    finalText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    break;
  }

  if (!finalText) {
    finalText = 'Извинявай, нещо не се получи. Опитай да преформулираш въпроса.';
  }

  // 4. Persist the user turn + final assistant text only (tool internals are ephemeral)
  saveMessage(db, userId, 'user', userMessage);
  saveMessage(db, userId, 'assistant', finalText);

  return finalText;
}

module.exports = { askAgent, loadHistory };
