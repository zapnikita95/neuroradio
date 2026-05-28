import { Router, Request, Response } from 'express';
import { requireAppAuth } from '../middleware/app-auth.js';
import { getEntitlementForInstall, grantPremiumSubscription } from '../services/account-store.js';
import {
  hasPremiumEntitlement,
  isSaluteSpeechEnabled,
  PREMIUM_PRICE_RUB_MONTHLY,
  PREMIUM_PRODUCT_MONTHLY,
  premiumUpsellHintRu,
  resolveUserTier,
} from '../services/entitlements.js';
import { canUseSaluteSpeechProduction, hasSaluteSpeechCredentials } from '../services/tts-router.js';

const router = Router();

router.use(requireAppAuth);

function billingAdminAuthorized(req: Request): boolean {
  const secret = process.env.BILLING_ADMIN_SECRET?.trim();
  if (!secret) return false;
  const header = req.get('x-billing-admin-secret')?.trim();
  return Boolean(header && header === secret);
}

/** Subscription status for the authenticated install (Play verify — later). */
router.get('/status', (req: Request, res: Response) => {
  const installId = req.installId ?? 'unknown';
  const tier = resolveUserTier(installId);
  const entitlement = getEntitlementForInstall(installId);

  res.json({
    tier,
    premium: hasPremiumEntitlement(installId),
    entitlement,
    productId: PREMIUM_PRODUCT_MONTHLY,
    priceRubMonthly: PREMIUM_PRICE_RUB_MONTHLY,
    hint: premiumUpsellHintRu(tier),
    premiumTtsProvider: 'sber',
    premiumTtsReady: canUseSaluteSpeechProduction(),
    saluteSpeech: hasSaluteSpeechCredentials() && isSaluteSpeechEnabled(),
  });
});

/**
 * Dev/ops: activate premium without Play Billing (secret header).
 * POST /v1/billing/activate-admin  { "months": 1 }
 */
router.post('/activate-admin', (req: Request, res: Response) => {
  if (!billingAdminAuthorized(req)) {
    res.status(403).json({ error: 'Forbidden', code: 'BILLING_ADMIN_FORBIDDEN' });
    return;
  }

  const installId = req.installId ?? '';
  if (!installId) {
    res.status(400).json({ error: 'Missing install id' });
    return;
  }

  const months =
    typeof req.body?.months === 'number' && req.body.months > 0
      ? Math.min(24, Math.floor(req.body.months))
      : 1;

  const entitlement = grantPremiumSubscription(installId, {
    months,
    productId: PREMIUM_PRODUCT_MONTHLY,
  });

  res.json({
    ok: true,
    tier: 'premium',
    entitlement,
    hint: premiumUpsellHintRu('premium'),
  });
});

export default router;
