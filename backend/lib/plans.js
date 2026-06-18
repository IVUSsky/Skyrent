// Единен източник на абонаментни планове + ВЪЗМОЖНОСТИ (capabilities).
// Гейтването на функции е по възможност, не само по брой имоти.
//
// Канонични планове: basic (free) / pro / agency.
// Legacy ключове (starter/business) се мапват към каноничните за обратна
// съвместимост със съществуващи org.plan стойности и Stripe lookup keys.
// 'trial' = пълен Pro достъп по време на пробния период (за да изпита клиентът
// автоматизацията).

const PLANS = {
  basic:  { label: 'Basic',  amount: 0,    properties: 5,    seats: 1 },
  pro:    { label: 'Pro',    amount: 2400, properties: null, seats: 3 },
  // Agency се таксува по обект (Stripe quantity) — minAmount е минималната месечна такса
  agency: { label: 'Agency', amount: 4900, properties: null, seats: null, perUnit: true, unitAmount: 180, minAmount: 4900 },
};

// Възможности по канонически план. Ключовете се ползват и в backend gating,
// и в frontend заключването на UI.
const CAPABILITIES = {
  basic:  ['core'],
  pro:    ['core', 'payments', 'tenant_portal', 'bank_import', 'internet'],
  agency: ['core', 'payments', 'tenant_portal', 'bank_import', 'internet', 'multi_owner', 'white_label', 'priority_support'],
};

const ALL_CAPABILITIES = [
  'core', 'payments', 'tenant_portal', 'bank_import', 'internet',
  'multi_owner', 'white_label', 'priority_support',
];

const LEGACY_ALIAS = { starter: 'basic', business: 'agency' }; // pro → pro

function canonicalPlan(plan) {
  if (!plan || plan === 'trial') return 'pro'; // trial = Pro възможности
  return LEGACY_ALIAS[plan] || plan;
}
function planConfig(plan) { return PLANS[canonicalPlan(plan)] || PLANS.basic; }
function planCapabilities(plan) { return CAPABILITIES[canonicalPlan(plan)] || CAPABILITIES.basic; }
function hasCapability(plan, cap) { return planCapabilities(plan).includes(cap); }

module.exports = {
  PLANS, CAPABILITIES, ALL_CAPABILITIES, LEGACY_ALIAS,
  canonicalPlan, planConfig, planCapabilities, hasCapability,
};
