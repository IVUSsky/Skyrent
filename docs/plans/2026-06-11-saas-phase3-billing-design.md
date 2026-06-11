# SaaS Phase 3 — Stripe Billing — Design (as built)

**Date:** 2026-06-11 · **Builds on:** Phase 2 (signup, PR #42)

## Планове (месечно, EUR, без ДДС)
Starter €7 (≤5 имота) · Pro €29 (≤30) · Business €79 (∞). Trial 30 дни от signup.

## Backend
- lib/saasBilling.js: PLANS конфиг; ensurePlans() — idempotent Stripe products/prices
  (lookup keys skyrent_<plan>_monthly, НУЛА ръчна работа в Dashboard); ensureCustomer
  (organizations.stripe_customer_id); createCheckout (subscription mode, metadata
  kind=saas_subscription + organization_id); createPortal; handleBillingEvent.
- routes/billing.js: GET / (план/trial дни/лимити/планове), POST /checkout {plan},
  POST /portal (Stripe Customer Portal — карта/фактури/отказ). Admin only за мутации.
- Webhook: payments.js webhookHandler ДЕЛЕГИРА към handleBillingEvent(db.control,event)
  преди tenant-rent switch-а: checkout.session.completed (kind guard) → plan/status/
  subscription_id; subscription.updated (active→active, past_due/unpaid/canceled→
  suspended); subscription.deleted → suspended.
- Enforcement (server.js, след tenant containment): org≠1, не-superadmin: suspended
  ИЛИ изтекъл trial → 402 {billing:true} за всичко освен /api/billing+/api/auth.
  POST /api/properties → лимит по план (Starter 5/Pro 30).
- Миграция: organizations.stripe_customer_id + stripe_subscription_id.

## Frontend
- Billing.jsx (таб 💳 Абонамент, admin): статус банер (trial дни/изтекъл/активен),
  3 план карти → Checkout redirect; Customer Portal линк; org 1 → "платформен акаунт".
- api.js: 402 → CustomEvent skyrent:billing-required → App.jsx превключва на billing таб.

## Тествано локално
E2E пълен + billing GET (org1 platform, org3 trial) + 402 при изтекъл trial +
/api/billing достъпен при 402 + org 1 exempt.

## Production изисквания
STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET вече са в Railway (от tenant-rent).
Stripe products се създават сами при първия checkout. В Stripe Dashboard webhook
config добави subscription events: customer.subscription.updated,
customer.subscription.deleted (checkout.session.completed вече е там).
