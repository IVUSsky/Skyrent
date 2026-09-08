// Споделена дефиниция на менютата (ползва се от App.jsx и Settings.jsx).
// tier: 'core' (винаги, Лесен режим) | 'standard' | 'advanced' | 'system' (винаги)
//
// `label` е историческото име с емоджи — ползва се от хоризонталния хедър и от
// Настройки, затова остава непроменено. Skyrent сайдбарът ползва `name` (чисто
// име, без емоджи), `icon` (тънък геометричен знак) и `group`.
export const ALL_TABS = [
  { id: 'dashboard', label: '🏠 Табло',       roles: ['admin'],            tier: 'core',     group: 'income',  icon: '▦', name: 'Табло' },
  { id: 'tenants',   label: '👥 Наематели',   roles: ['admin'],            tier: 'core',     group: 'assets',  icon: '◉', name: 'Наематели' },
  { id: 'invoices',  label: '🧾 Фактури',     roles: ['admin'],            tier: 'core',     group: 'income',  icon: '▤', name: 'Фактури' },
  { id: 'contracts', label: '📋 Договори',    roles: ['admin', 'broker'],  tier: 'core',     group: 'assets',  icon: '▢', name: 'Договори' },
  { id: 'expenses',  label: '💸 Разходи',     roles: ['admin'],            tier: 'core',     group: 'income',  icon: '◇', name: 'Разходи' },
  { id: 'portfolio', label: '🏢 Имоти',       roles: ['admin', 'broker'],  tier: 'standard', group: 'assets',  icon: '▣', name: 'Портфейл' },
  { id: 'deeds',     label: '📜 Актове',      roles: ['admin'],            tier: 'standard', group: 'assets',  icon: '▥', name: 'Актове' },
  { id: 'list',      label: 'Таблица',        roles: ['admin'],            tier: 'standard', group: 'assets',  icon: '⊞', name: 'Таблица' },
  { id: 'owners',    label: '👤 Собственици', roles: ['admin'],            tier: 'standard', group: 'assets',  icon: '◎', name: 'Собственици', capability: 'multi_owner' },
  { id: 'addons',    label: '🛍️ Услуги',      roles: ['admin'],            tier: 'standard', group: 'assets',  icon: '⬡', name: 'Услуги' },
  { id: 'internet',  label: '🌐 Интернет',    roles: ['admin'],            tier: 'standard', group: 'assets',  icon: '⊕', name: 'Интернет', capability: 'internet' },
  { id: 'support',   label: '💬 Разговори',   roles: ['admin'],            tier: 'standard', group: 'system',  icon: '▧', name: 'Разговори' },
  { id: 'contacts',  label: '📇 Контакти',    roles: ['admin'],            tier: 'standard', group: 'system',  icon: '▨', name: 'Контакти' },
  { id: 'import',    label: '📥 Банка',       roles: ['admin'],            tier: 'standard', group: 'income',  icon: '⇄', name: 'Банков импорт', capability: 'bank_import' },
  { id: 'investor',  label: '📊 Анализ',      roles: ['admin'],            tier: 'advanced', group: 'finance', icon: '◧', name: 'Анализ' },
  { id: 'history',   label: '📈 История',     roles: ['admin'],            tier: 'advanced', group: 'finance', icon: '↗', name: 'История' },
  { id: 'loans',     label: 'Кредити',        roles: ['admin'],            tier: 'advanced', group: 'finance', icon: '⊖', name: 'Кредити' },
  { id: 'integrity', label: '🩺 Интегритет',  roles: ['admin'],            tier: 'advanced', group: 'finance', icon: '◕', name: 'Интегритет' },
  { id: 'investments', label: '📈 Инвестиции',   roles: ['admin'],         tier: 'advanced', group: 'finance', icon: '✦', name: 'Инвестиции' },
  { id: 'personal',    label: '💰 Личен бюджет', roles: ['admin'],         tier: 'advanced', group: 'finance', icon: '⬦', name: 'Личен бюджет' },
  { id: 'smart',       label: '⚡ Смарт',        roles: ['admin'],         tier: 'advanced', group: 'system',  icon: '✧', name: 'Смарт' },
  { id: 'access_chips', label: '🔑 Чипове',      roles: ['admin'],         tier: 'advanced', group: 'system',  icon: '⊠', name: 'Чипове' },
  { id: 'billing',     label: '💳 Абонамент',  roles: ['admin'],           tier: 'system',   group: 'system',  icon: '⊟', name: 'Абонамент' },
  { id: 'settings',    label: '⚙️ Настройки',  roles: ['admin'],           tier: 'system',   group: 'system',  icon: '◩', name: 'Настройки' },
]

// Групите на Skyrent сайдбара, в реда на показване. Табовете без `group`
// (или с непозната група) падат в 'system', за да не изчезнат никога.
export const TAB_GROUPS = [
  { id: 'income',  title: 'Приходи' },
  { id: 'assets',  title: 'Имоти' },
  { id: 'finance', title: 'Финанси' },
  { id: 'system',  title: 'Система' },
]

// Групира подадения (вече филтриран) списък табове по TAB_GROUPS.
// Празните групи отпадат — Лесен режим показва само две-три.
export function groupTabs(tabs) {
  const known = new Set(TAB_GROUPS.map(g => g.id))
  return TAB_GROUPS
    .map(g => ({
      ...g,
      items: tabs.filter(t => (known.has(t.group) ? t.group : 'system') === g.id),
    }))
    .filter(g => g.items.length > 0)
}

// Org-1-only табове: интеграции с лични env ключове (T212, Tuya, личен бюджет)
export const ORG1_ONLY_TABS = new Set(['investments', 'smart', 'personal', 'access_chips'])

// Лесен режим показва само 'core' + 'system'. Разширен показва всичко.
export const SIMPLE_TIERS = new Set(['core', 'system'])

// Системните менюта не могат да се скриват (иначе собственикът се самозаключва)
export const HIDEABLE = ALL_TABS.filter(t => t.tier !== 'system')

// План-гейтинг: 'starter' не вижда 'advanced' менюта (мек ъпгрейд стимул);
// trial/pro/business виждат всичко. Платформата (org 1) — без ограничение.
export function planAllowsTier(plan, platform, tier) {
  if (platform) return true
  if (tier !== 'advanced') return true
  return plan !== 'starter'
}

// Capability-гейтинг: таб с `capability` се показва само ако планът го включва.
// platform (org 1) винаги; ако caps още не са заредени (null) — не крий (без мигане).
export function planAllowsCapability(capabilities, platform, tab) {
  if (platform || !tab.capability || capabilities == null) return true
  return capabilities.includes(tab.capability)
}
