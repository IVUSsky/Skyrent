// SaaS billing (Phase 3) — Stripe абонаменти за организациите.
// Различно от tenant-rent плащанията (payments.js): тук ПЛАТФОРМАТА таксува
// организациите-клиенти. Org 1 (Sky Capital) е exempt завинаги.
const { getStripe } = require('../routes/payments');

// Планове: цена (цента EUR/месец) + лимит имоти (null = без лимит)
const PLANS = {
  starter:  { label: 'Starter',  amount: 700,  limit: 5 },
  pro:      { label: 'Pro',      amount: 2900, limit: 30 },
  business: { label: 'Business', amount: 7900, limit: null },
};
const LOOKUP = (plan) => `skyrent_${plan}_monthly`;

let priceCache = null; // plan → stripe price id

/** Idempotent: създава Stripe product+price per план (lookup keys). */
async function ensurePlans() {
  const s = getStripe();
  if (!s) throw Object.assign(new Error('Stripe не е конфигуриран'), { status: 503 });
  if (priceCache) return priceCache;
  const keys = Object.keys(PLANS).map(LOOKUP);
  const existing = await s.prices.list({ lookup_keys: keys, limit: 10 });
  const map = {};
  for (const p of existing.data) {
    const plan = Object.keys(PLANS).find(k => LOOKUP(k) === p.lookup_key);
    if (plan) map[plan] = p.id;
  }
  for (const [plan, cfg] of Object.entries(PLANS)) {
    if (map[plan]) continue;
    const product = await s.products.create({ name: `Skyrent ${cfg.label}` });
    const price = await s.prices.create({
      product: product.id, currency: 'eur', unit_amount: cfg.amount,
      recurring: { interval: 'month' }, lookup_key: LOOKUP(plan), transfer_lookup_key: true,
    });
    map[plan] = price.id;
    console.log(`[billing] Stripe price създаден: ${plan} → ${price.id}`);
  }
  priceCache = map;
  return map;
}

async function ensureCustomer(controlDb, org, email) {
  const s = getStripe();
  if (org.stripe_customer_id) return org.stripe_customer_id;
  const customer = await s.customers.create({
    name: org.name, email: email || undefined,
    metadata: { skyrent_organization_id: String(org.id) },
  });
  controlDb.prepare('UPDATE organizations SET stripe_customer_id=? WHERE id=?').run(customer.id, org.id);
  return customer.id;
}

async function createCheckout(controlDb, org, plan, { success_url, cancel_url, email }) {
  if (!PLANS[plan]) throw Object.assign(new Error('Невалиден план'), { status: 400 });
  const s = getStripe();
  const prices = await ensurePlans();
  const customer = await ensureCustomer(controlDb, org, email);
  const session = await s.checkout.sessions.create({
    mode: 'subscription', customer,
    line_items: [{ price: prices[plan], quantity: 1 }],
    success_url, cancel_url,
    metadata: { kind: 'saas_subscription', organization_id: String(org.id), plan },
    subscription_data: { metadata: { organization_id: String(org.id), plan } },
  });
  return session.url;
}

async function createPortal(org, return_url) {
  const s = getStripe();
  if (!org.stripe_customer_id) throw Object.assign(new Error('Няма Stripe клиент за организацията'), { status: 400 });
  const session = await s.billingPortal.sessions.create({ customer: org.stripe_customer_id, return_url });
  return session.url;
}

/**
 * Обработва SaaS billing webhook събития. Връща true ако е обработено
 * (payments.js спира дотук); false → продължава към tenant-rent switch-а.
 */
function handleBillingEvent(controlDb, event) {
  const obj = event.data?.object || {};
  const byOrgId = (id) => controlDb.prepare('SELECT * FROM organizations WHERE id=?').get(Number(id));
  const byCustomer = (cid) => controlDb.prepare('SELECT * FROM organizations WHERE stripe_customer_id=?').get(cid);

  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.metadata?.kind !== 'saas_subscription') return false;
      const org = byOrgId(obj.metadata.organization_id);
      if (!org) { console.warn('[billing] checkout за непозната org', obj.metadata.organization_id); return true; }
      controlDb.prepare("UPDATE organizations SET plan=?, status='active', stripe_subscription_id=? WHERE id=?")
        .run(obj.metadata.plan, obj.subscription || null, org.id);
      console.log(`[billing] org ${org.id} → план ${obj.metadata.plan} (subscription ${obj.subscription})`);
      return true;
    }
    case 'customer.subscription.updated': {
      const org = (obj.metadata?.organization_id && byOrgId(obj.metadata.organization_id)) || byCustomer(obj.customer);
      if (!org) return false; // не е SaaS subscription (напр. друг продукт)
      if (['active', 'trialing'].includes(obj.status)) {
        const plan = obj.metadata?.plan || org.plan;
        controlDb.prepare("UPDATE organizations SET plan=?, status='active', stripe_subscription_id=? WHERE id=?")
          .run(plan, obj.id, org.id);
      } else if (['past_due', 'unpaid', 'canceled', 'incomplete_expired'].includes(obj.status)) {
        controlDb.prepare("UPDATE organizations SET status='suspended' WHERE id=?").run(org.id);
        console.log(`[billing] org ${org.id} suspended (subscription ${obj.status})`);
      }
      return true;
    }
    case 'customer.subscription.deleted': {
      const org = (obj.metadata?.organization_id && byOrgId(obj.metadata.organization_id)) || byCustomer(obj.customer);
      if (!org) return false;
      controlDb.prepare("UPDATE organizations SET status='suspended', stripe_subscription_id=NULL WHERE id=?").run(org.id);
      console.log(`[billing] org ${org.id} subscription deleted → suspended`);
      return true;
    }
    default:
      return false;
  }
}

module.exports = { PLANS, ensurePlans, createCheckout, createPortal, handleBillingEvent };
