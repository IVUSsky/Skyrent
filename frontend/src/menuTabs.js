// Споделена дефиниция на менютата (ползва се от App.jsx и Settings.jsx).
// tier: 'core' (винаги, Лесен режим) | 'standard' | 'advanced' | 'system' (винаги)
export const ALL_TABS = [
  { id: 'dashboard', label: '🏠 Табло',       roles: ['admin'],            tier: 'core' },
  { id: 'tenants',   label: '👥 Наематели',   roles: ['admin'],            tier: 'core' },
  { id: 'invoices',  label: '🧾 Фактури',     roles: ['admin', 'broker'],  tier: 'core' },
  { id: 'contracts', label: '📋 Договори',    roles: ['admin', 'broker'],  tier: 'core' },
  { id: 'expenses',  label: '💸 Разходи',     roles: ['admin'],            tier: 'core' },
  { id: 'portfolio', label: '🏢 Имоти',       roles: ['admin'],            tier: 'standard' },
  { id: 'list',      label: 'Таблица',        roles: ['admin'],            tier: 'standard' },
  { id: 'owners',    label: '👤 Собственици', roles: ['admin'],            tier: 'standard', capability: 'multi_owner' },
  { id: 'addons',    label: '🛍️ Услуги',      roles: ['admin'],            tier: 'standard' },
  { id: 'internet',  label: '🌐 Интернет',    roles: ['admin'],            tier: 'standard', capability: 'internet' },
  { id: 'support',   label: '🛟 Поддръжка',   roles: ['admin'],            tier: 'standard' },
  { id: 'import',    label: '📥 Банка',       roles: ['admin'],            tier: 'standard', capability: 'bank_import' },
  { id: 'investor',  label: '📊 Анализ',      roles: ['admin'],            tier: 'advanced' },
  { id: 'history',   label: '📈 История',     roles: ['admin'],            tier: 'advanced' },
  { id: 'loans',     label: 'Кредити',        roles: ['admin'],            tier: 'advanced' },
  { id: 'integrity', label: '🩺 Интегритет',  roles: ['admin'],            tier: 'advanced' },
  { id: 'investments', label: '📈 Инвестиции',   roles: ['admin'],         tier: 'advanced' },
  { id: 'personal',    label: '💰 Личен бюджет', roles: ['admin'],         tier: 'advanced' },
  { id: 'smart',       label: '⚡ Смарт',        roles: ['admin'],         tier: 'advanced' },
  { id: 'billing',     label: '💳 Абонамент',  roles: ['admin'],           tier: 'system' },
  { id: 'settings',    label: '⚙️ Настройки',  roles: ['admin'],           tier: 'system' },
]

// Org-1-only табове: интеграции с лични env ключове (T212, Tuya, личен бюджет)
export const ORG1_ONLY_TABS = new Set(['investments', 'smart', 'personal'])

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
