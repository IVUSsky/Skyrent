// SaaS billing route-ове (Phase 3). Org-scoped: всеки org admin управлява
// собствения си абонамент. Org 1 = платформен акаунт (без абонамент).
const express = require('express');
const { PLANS, createCheckout, createPortal } = require('../lib/saasBilling');
const { planCapabilities, ALL_CAPABILITIES } = require('../lib/plans');

module.exports = function (db, controlDb) {
  const router = express.Router();

  const orgRow = (req) => controlDb.prepare('SELECT * FROM organizations WHERE id=?').get(req.user.organization_id);
  const adminOnly = (req, res, next) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Само за администратори' });
    next();
  };

  // GET /api/billing — статус на абонамента (за банера/страницата)
  router.get('/', (req, res) => {
    try {
      const org = orgRow(req);
      if (!org) return res.status(404).json({ error: 'Org missing' });
      const platform = org.id === 1;
      const today = new Date().toISOString().slice(0, 10);
      const trialDaysLeft = org.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(org.trial_ends_at) - new Date(today)) / 86400000))
        : null;
      const propCount = db.prepare('SELECT COUNT(*) AS n FROM properties').get().n;
      const planCfg = PLANS[org.plan] || null;
      res.json({
        platform,
        plan: org.plan, status: org.status,
        trial_ends_at: org.trial_ends_at, trial_days_left: org.plan === 'trial' ? trialDaysLeft : null,
        expired: !platform && org.plan === 'trial' && trialDaysLeft === 0,
        suspended: org.status === 'suspended',
        property_count: propCount,
        property_limit: planCfg ? planCfg.limit : null,
        plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { label: v.label, eur: v.amount / 100, limit: v.limit }])),
        has_subscription: !!org.stripe_subscription_id,
        // Възможности на текущия план (платформата има всички). Frontend заключва
        // UI по тях; backend enforcement идва в следващ инкремент.
        capabilities: platform ? ALL_CAPABILITIES : planCapabilities(org.plan),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/billing/checkout {plan} → Stripe Checkout URL
  router.post('/checkout', adminOnly, async (req, res) => {
    try {
      const org = orgRow(req);
      if (org.id === 1) return res.status(400).json({ error: 'Платформеният акаунт няма абонамент' });
      const base = process.env.FRONTEND_URL || 'http://localhost:5173';
      const email = controlDb.prepare('SELECT email FROM users WHERE id=?').get(req.user.id)?.email;
      const url = await createCheckout(controlDb, org, req.body?.plan, {
        success_url: base + '/?billing=success',
        cancel_url: base + '/?billing=cancel',
        email,
      });
      res.json({ url });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  // POST /api/billing/portal → Stripe Customer Portal (смяна карта / отказ)
  router.post('/portal', adminOnly, async (req, res) => {
    try {
      const org = orgRow(req);
      const base = process.env.FRONTEND_URL || 'http://localhost:5173';
      const url = await createPortal(org, base + '/?billing=portal_return');
      res.json({ url });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  return router;
};
