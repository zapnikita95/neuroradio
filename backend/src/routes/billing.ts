import { Router, Request, Response } from 'express';
import { requireAppAuth } from '../middleware/app-auth.js';
import {
  getEntitlementForInstall,
  grantPremiumSubscription,
  grantTrialSubscription,
} from '../services/account-store.js';
import {
  hasPremiumEntitlement,
  PREMIUM_PRICE_RUB_MONTHLY,
  PREMIUM_PRODUCT_MONTHLY,
  premiumUpsellHintRu,
  resolveUserTier,
} from '../services/entitlements.js';
import { canUseSaluteSpeechProduction, hasSaluteSpeechCredentials } from '../services/tts-router.js';
import { isSaluteSpeechEnabled } from '../services/entitlements.js';
import {
  getStoryLimitsForTier,
  TRIAL_PRICE_RUB_MONTHLY,
  TRIAL_PRODUCT_MONTHLY,
  tierQuotaHintRu,
} from '../services/tier-policy.js';
import { getDailyStoryQuota } from '../middleware/rate-limit.js';

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
  const limits = getStoryLimitsForTier(tier);
  const quota = getDailyStoryQuota(installId);

  res.json({
    tier,
    premium: hasPremiumEntitlement(installId),
    entitlement,
    quota,
    limits: {
      dailyStories: limits.dailyStories,
      monthlyStories: limits.monthlyStories,
      labelRu: limits.labelRu,
    },
    products: {
      trial: {
        productId: TRIAL_PRODUCT_MONTHLY,
        priceRubMonthly: TRIAL_PRICE_RUB_MONTHLY,
        monthlyStories: getStoryLimitsForTier('trial').monthlyStories,
        dailyStories: getStoryLimitsForTier('trial').dailyStories,
        llmModel: 'deepseek/deepseek-chat-v3-0324',
      },
      premium: {
        productId: PREMIUM_PRODUCT_MONTHLY,
        priceRubMonthly: PREMIUM_PRICE_RUB_MONTHLY,
        dailyStories: getStoryLimitsForTier('premium').dailyStories,
        llmModel: 'deepseek/deepseek-chat-v3-0324',
      },
    },
    hint: tierQuotaHintRu(tier),
    premiumVoiceHint: premiumUpsellHintRu(tier),
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
    limits: getStoryLimitsForTier('premium'),
    hint: tierQuotaHintRu('premium'),
  });
});

/**
 * Dev/ops: activate trial (1 ₽ product scaffold).
 * POST /v1/billing/activate-trial-admin  { "months": 1 }
 */
router.post('/activate-trial-admin', (req: Request, res: Response) => {
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
      ? Math.min(3, Math.floor(req.body.months))
      : 1;

  const entitlement = grantTrialSubscription(installId, {
    months,
    productId: TRIAL_PRODUCT_MONTHLY,
  });

  res.json({
    ok: true,
    tier: 'trial',
    entitlement,
    limits: getStoryLimitsForTier('trial'),
    hint: tierQuotaHintRu('trial'),
  });
});

export default router;
