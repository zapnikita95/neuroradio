import { Router, Request, Response } from 'express';
import { requireAppAuth } from '../middleware/app-auth.js';
import {
  getEntitlementForInstall,
  grantPremiumSubscription,
  grantTrialSubscription,
  cancelAutoRenewByInstall,
} from '../services/account-store.js';
import {
  hasPremiumEntitlement,
  PREMIUM_PRICE_RUB_MONTHLY,
  PREMIUM_PRODUCT_MONTHLY,
  premiumUpsellHintRu,
  resolveUserTier,
} from '../services/entitlements.js';
import {
  getStoryLimitsForTier,
  TRIAL_PRICE_RUB_MONTHLY,
  TRIAL_PRODUCT_MONTHLY,
  tierQuotaHintRu,
} from '../services/tier-policy.js';
import { getDailyStoryLimit, getDailyStoryQuota, resetStoryQuotaForInstall } from '../middleware/rate-limit.js';
import {
  getDevTierOverride,
  setDevTierOverride,
} from '../services/dev-tier-store.js';
import { canUseDevTierSwitch } from '../services/admin-users.js';
import type { UserTier } from '../services/entitlements.js';
import { isEmailConfigured, sendReceiptToUserEmail } from '../services/email-sender.js';
import { verifyApplePurchaseInput } from '../services/apple-iap.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const effectiveDaily = getDailyStoryLimit(installId);

  res.json({
    tier,
    premium: hasPremiumEntitlement(installId),
    entitlement,
    quota,
    limits: {
      dailyStories: effectiveDaily,
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
    premiumTtsProvider: 'yandex',
    premiumTtsReady: true,
    saluteSpeech: false,
    yookassaConfigured: Boolean(process.env.YOOKASSA_SHOP_ID?.trim() && process.env.YOOKASSA_SECRET_KEY?.trim()),
    devTierSwitchEnabled: canUseDevTierSwitch(installId),
    devTierOverride: canUseDevTierSwitch(installId) ? getDevTierOverride(installId) : null,
  });
});

/** Verify App Store purchase from iOS (StoreKit 2). */
router.post('/apple/verify', (req: Request, res: Response) => {
  const installId = req.installId ?? '';
  if (!installId) {
    res.status(400).json({ error: 'Missing install id' });
    return;
  }

  const verified = verifyApplePurchaseInput({
    signedTransactionInfo:
      typeof req.body?.signedTransactionInfo === 'string'
        ? req.body.signedTransactionInfo
        : undefined,
    transactionId:
      typeof req.body?.transactionId === 'string' ? req.body.transactionId : undefined,
    productId: typeof req.body?.productId === 'string' ? req.body.productId : undefined,
    originalTransactionId:
      typeof req.body?.originalTransactionId === 'string'
        ? req.body.originalTransactionId
        : undefined,
    expiresDateMs:
      typeof req.body?.expiresDateMs === 'number' ? req.body.expiresDateMs : undefined,
    bundleId: typeof req.body?.bundleId === 'string' ? req.body.bundleId : undefined,
    environment:
      typeof req.body?.environment === 'string' ? req.body.environment : undefined,
  });

  if (!verified.ok || !verified.productId) {
    res.status(400).json({
      ok: false,
      error: verified.error ?? 'Invalid Apple purchase',
      code: verified.code ?? 'APPLE_VERIFY_FAILED',
    });
    return;
  }

  const entitlement = grantPremiumSubscription(installId, {
    months: verified.months,
    productId: verified.productId,
    purchaseToken: verified.transactionId,
    premiumUntilMs: verified.premiumUntilMs,
    autoRenew: verified.autoRenew,
  });

  res.json({
    ok: true,
    tier: 'premium',
    premium: true,
    entitlement,
    limits: getStoryLimitsForTier('premium'),
    hint: tierQuotaHintRu('premium'),
  });
});

/** Отвязать карту и отключить автопродление (данные привязки удаляются у нас). */
router.post('/unlink-card', (req: Request, res: Response) => {
  const installId = req.installId ?? '';
  if (!installId) {
    res.status(400).json({ error: 'Missing install id' });
    return;
  }
  const result = cancelAutoRenewByInstall(installId);
  if (!result.ok) {
    const code = result.error ?? 'UNKNOWN';
    const message =
      code === 'NOT_LINKED'
        ? 'Войдите в аккаунт по email в приложении'
        : code === 'NO_EMAIL'
          ? 'Сначала войдите с email, которым оплачивали подписку'
          : code === 'NO_SAVED_CARD'
            ? 'Карта не привязана — автопродление уже отключено'
            : 'Не удалось отвязать карту';
    res.status(400).json({ ok: false, code, error: message });
    return;
  }
  const entitlement = getEntitlementForInstall(installId);
  res.json({
    ok: true,
    entitlement,
    message: 'Карта отвязана. Автопродление отключено. Доступ сохранится до конца оплаченного периода.',
  });
});

/**
 * Тестовый переключатель тарифа (без Play Billing).
 * POST /v1/billing/dev-tier  { "tier": "free" | "trial" | "premium" | null }
 * Railway: ALLOW_DEV_TIER_SWITCH=true
 */
router.post('/dev-tier', (req: Request, res: Response) => {
  const installId = req.installId ?? '';
  if (!installId) {
    res.status(400).json({ error: 'Missing install id' });
    return;
  }
  if (!canUseDevTierSwitch(installId)) {
    res.status(403).json({
      error: 'Admin only',
      code: 'DEV_TIER_FORBIDDEN',
      hint: 'Переключатель тарифа доступен только администратору.',
    });
    return;
  }

  const raw = req.body?.tier;
  let tier: UserTier | null = null;
  if (raw === null || raw === 'null' || raw === '') {
    tier = null;
  } else if (raw === 'free' || raw === 'trial' || raw === 'premium') {
    tier = raw;
  } else {
    res.status(400).json({ error: 'tier must be free, trial, premium, or null' });
    return;
  }

  setDevTierOverride(installId, tier);
  resetStoryQuotaForInstall(installId);
  const effective = resolveUserTier(installId);
  const limits = getStoryLimitsForTier(effective);

  res.json({
    ok: true,
    devTierOverride: getDevTierOverride(installId),
    tier: effective,
    limits,
    quota: getDailyStoryQuota(installId),
    hint: `${tierQuotaHintRu(effective)} Квота историй сброшена.`,
    serverLlmKeys: 'Запросы без своего API-ключа идут на ключи Railway (OPEN_ROUTER_API_KEY и др.)',
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

/**
 * Admin: отправить чек пользователю после оплаты.
 * POST /v1/billing/admin/receipt  { "to", "text", "subject?", "paymentId?" }
 * Header: x-billing-admin-secret
 */
router.post('/admin/receipt', async (req: Request, res: Response) => {
  if (!billingAdminAuthorized(req)) {
    res.status(403).json({ error: 'Forbidden', code: 'BILLING_ADMIN_FORBIDDEN' });
    return;
  }
  if (!isEmailConfigured()) {
    res.status(503).json({ error: 'Email not configured (RESEND_API_KEY, RESEND_FROM)' });
    return;
  }

  const to = typeof req.body?.to === 'string' ? req.body.to.trim().toLowerCase() : '';
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : undefined;
  const paymentId = typeof req.body?.paymentId === 'string' ? req.body.paymentId.trim() : undefined;

  if (!EMAIL_RE.test(to) || !text) {
    res.status(400).json({ error: 'Нужны to (email) и text (текст чека)' });
    return;
  }

  try {
    await sendReceiptToUserEmail({ to, text, subject, paymentId });
    res.json({ ok: true, to });
  } catch (err) {
    console.error('[billing/admin/receipt]', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Не удалось отправить чек' });
  }
});

export default router;
