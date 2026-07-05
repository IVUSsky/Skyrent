// Stripe Connect (Phase 3+) — наемодателите приемат наеми ДИРЕКТНО в собствената
// си банкова сметка. Различно от saasBilling.js (там ПЛАТФОРМАТА таксува org-ите
// за абонамент). Модел: Express акаунти + direct charges. Парите падат в акаунта
// на наемодателя; платформата по избор удържа application fee (PLATFORM_FEE_BPS).
//
// Org 1 (Sky Capital) НЕ ползва Connect — тя е самата платформа и приема наеми
// централно през основния Stripe акаунт (виж payments.js: isPlatform).
const { getStripe } = require('../routes/payments');

// Създава Express акаунт за org-а, ако няма. Идемпотентно.
async function ensureConnectAccount(controlDb, org, email) {
  const s = getStripe();
  if (!s) throw Object.assign(new Error('Stripe не е конфигуриран'), { status: 503 });
  if (org.connect_account_id) return org.connect_account_id;
  const account = await s.accounts.create({
    type: 'express',
    country: 'BG',
    email: email || undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: { name: org.name || undefined },
    metadata: { skyrent_organization_id: String(org.id) },
  });
  controlDb.prepare('UPDATE organizations SET connect_account_id=? WHERE id=?').run(account.id, org.id);
  console.log(`[connect] org ${org.id} → Express акаунт ${account.id}`);
  return account.id;
}

// Хоствана от Stripe onboarding форма (банкова сметка, лична карта, фирма).
async function createOnboardingLink(acctId, { refresh_url, return_url }) {
  const s = getStripe();
  const link = await s.accountLinks.create({
    account: acctId, refresh_url, return_url, type: 'account_onboarding',
  });
  return link.url;
}

// Express dashboard за наемодателя (справки за плащания/изплащания).
async function createDashboardLink(acctId) {
  const s = getStripe();
  const link = await s.accounts.createLoginLink(acctId);
  return link.url;
}

// Дърпа актуалния статус от Stripe и записва в organizations. Ползва се при
// връщане от onboarding (/connect/refresh) — защита ако webhook-ът закъснее.
async function refreshConnectStatus(controlDb, org) {
  const s = getStripe();
  if (!org.connect_account_id) return { connected: false };
  const acct = await s.accounts.retrieve(org.connect_account_id);
  const charges = acct.charges_enabled ? 1 : 0;
  const payouts = acct.payouts_enabled ? 1 : 0;
  const details = acct.details_submitted ? 1 : 0;
  controlDb.prepare(
    'UPDATE organizations SET connect_charges_enabled=?, connect_payouts_enabled=?, connect_details_submitted=? WHERE id=?'
  ).run(charges, payouts, details, org.id);
  return { connected: true, charges_enabled: !!charges, payouts_enabled: !!payouts, details_submitted: !!details };
}

// Connect webhook (account.updated за свързаните акаунти). Връща true ако обработено.
function handleConnectEvent(controlDb, event) {
  if (event.type !== 'account.updated') return false;
  const acct = event.data.object;
  const org = controlDb.prepare('SELECT id FROM organizations WHERE connect_account_id=?').get(acct.id);
  if (!org) return false;
  controlDb.prepare(
    'UPDATE organizations SET connect_charges_enabled=?, connect_payouts_enabled=?, connect_details_submitted=? WHERE id=?'
  ).run(acct.charges_enabled ? 1 : 0, acct.payouts_enabled ? 1 : 0, acct.details_submitted ? 1 : 0, org.id);
  console.log(`[connect] org ${org.id} account.updated → charges=${acct.charges_enabled} payouts=${acct.payouts_enabled}`);
  return true;
}

// Комисионна на платформата от всеки наем (application fee, в стотинки).
// Default 30 базисни точки = 0.3% на превод. Override през PLATFORM_FEE_BPS
// (напр. 0 = без комисионна, 50 = 0.5%). Удържа се автоматично от direct charge-а
// и влиза в платформения акаунт.
function platformFeeAmount(amountCents) {
  const raw = process.env.PLATFORM_FEE_BPS;
  const bps = raw != null && raw !== '' ? parseInt(raw, 10) : 30;
  if (!bps || bps <= 0) return 0;
  return Math.round(amountCents * bps / 10000);
}

module.exports = {
  ensureConnectAccount, createOnboardingLink, createDashboardLink,
  refreshConnectStatus, handleConnectEvent, platformFeeAmount,
};
