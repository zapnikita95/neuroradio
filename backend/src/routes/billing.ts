import { Router, Request, Response } from 'express';
import { requireAppAuth } from '../middleware/app-auth.js';
import {
  getEntitlementForInstall,
  grantPremiumSubscription,
  grantTrialSubscription,
  cancelAutoRenewByInstall,
  linkAppleOriginalTransaction,
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
import {
  inferSubscriptionMarket,
  resolveBillingChannel,
  resolveLanguageSwitchPolicy,
  type AppLanguageCode,
} from '../services/subscription-market.js';
import { SUBSCRIPTION_PLANS_USD, type SubscriptionPlan } from '../services/yookassa.js';
import {
  isGooglePlayBillingConfigured,
  verifyGooglePlaySubscription,
} from '../services/google-play-billing.js';
import {
  hashAppStorePurchaseKey,
  isAppStoreBillingConfigured,
  verifyAppStoreReceipt,
} from '../services/app-store-billing.js';
import {
  isAppStoreServerApiConfigured,
  resolveVerifiedTransaction,
} from '../services/app-store-server-api.js';
import { verifyApplePurchaseInput } from '../services/apple-iap.js';
import type { ParsedAppleTransaction } from '../services/app-store-server-api.js';
import {
  grantApplePremiumForInstall,
  afterApplePurchaseGranted,
  parsedToGrantOptions,
} from '../services/apple-iap-billing.js';
import { notifyWelcomeEmailForInstall } from '../services/welcome-email-notify.js';

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

  const appLangRaw = typeof req.query.appLanguage === 'string' ? req.query.appLanguage.trim() : 'ru';
  const appLanguage: AppLanguageCode = appLangRaw === 'en' ? 'en' : 'ru';
  const subscriptionMarket = inferSubscriptionMarket({
    subscriptionMarket: entitlement.subscriptionMarket,
    billingProvider: entitlement.billingProvider,
    premiumProductId: entitlement.premiumUntil > Date.now() ? entitlement.premiumProductId : null,
    cardSaved: entitlement.cardSaved,
  });
  const billingChannel = resolveBillingChannel(appLanguage);
  const languageSwitch = {
    toRu: resolveLanguageSwitchPolicy(installId, 'ru', subscriptionMarket),
    toEn: resolveLanguageSwitchPolicy(installId, 'en', subscriptionMarket),
  };

  res.json({
    tier,
    premium: hasPremiumEntitlement(installId),
    entitlement: { ...entitlement, subscriptionMarket },
    subscriptionMarket,
    billingChannel,
    languageSwitch,
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
    productsUsd: Object.fromEntries(
      Object.entries(SUBSCRIPTION_PLANS_USD).map(([key, meta]) => [
        key,
        {
          productId: meta.productId,
          amountUsd: meta.amountUsd,
          labelEn: meta.labelEn,
          months: meta.months,
        },
      ]),
    ),
    inAppBilling: {
      googlePlayConfigured: isGooglePlayBillingConfigured(),
      appStoreConfigured:
        isAppStoreBillingConfigured() || isAppStoreServerApiConfigured(),
      appStoreServerApiConfigured: isAppStoreServerApiConfigured(),
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

/** Check if app language can be switched (RU sub → EN blocked until intl upgrade). */
router.get('/language-switch', (req: Request, res: Response) => {
  const installId = req.installId ?? 'unknown';
  const targetRaw = typeof req.query.target === 'string' ? req.query.target.trim() : '';
  const target: AppLanguageCode = targetRaw === 'en' ? 'en' : 'ru';
  const entitlement = getEntitlementForInstall(installId);
  const market = inferSubscriptionMarket({
    subscriptionMarket: entitlement.subscriptionMarket,
    billingProvider: entitlement.billingProvider,
    premiumProductId: entitlement.premiumUntil > Date.now() ? entitlement.premiumProductId : null,
    cardSaved: entitlement.cardSaved,
  });
  const policy = resolveLanguageSwitchPolicy(installId, target, market);
  res.json({ target, subscriptionMarket: market, policy });
});

/** Verify Google Play subscription purchase and grant intl premium. */
router.post('/verify/google-play', async (req: Request, res: Response) => {
  const installId = req.installId ?? '';
  if (!installId) {
    res.status(400).json({ error: 'Missing install id' });
    return;
  }
  const productId = typeof req.body?.productId === 'string' ? req.body.productId.trim() : '';
  const purchaseToken = typeof req.body?.purchaseToken === 'string' ? req.body.purchaseToken.trim() : '';
  if (!productId || !purchaseToken) {
    res.status(400).json({ error: 'productId and purchaseToken required' });
    return;
  }
  if (!isGooglePlayBillingConfigured()) {
    res.status(503).json({
      error: 'Google Play billing not configured on server',
      code: 'GOOGLE_PLAY_NOT_CONFIGURED',
    });
    return;
  }
  try {
    const verified = await verifyGooglePlaySubscription({ productId, purchaseToken });
    const entitlement = grantPremiumSubscription(installId, {
      months: verified.months,
      productId: verified.productId,
      purchaseToken,
      subscriptionMarket: 'intl',
      billingProvider: 'google_play',
      subscriptionPlan: verified.plan,
      premiumUntil: verified.expiryTimeMs ?? undefined,
    });
    resetStoryQuotaForInstall(installId);
    void notifyWelcomeEmailForInstall({
      installId,
      purchaseKey: purchaseToken,
      plan: verified.plan,
      premiumUntilMs: entitlement.premiumUntil,
      billingProvider: 'google_play',
      explicitLang: req.body?.appLanguage,
    });
    res.json({
      ok: true,
      tier: resolveUserTier(installId),
      entitlement,
      subscriptionMarket: 'intl',
      hint: 'International subscription active. You can switch to Russian UI — limits stay the same.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[billing/verify/google-play]', msg);
    res.status(400).json({ ok: false, error: msg, code: 'GOOGLE_PLAY_VERIFY_FAILED' });
  }
});

/** Verify App Store receipt and grant intl premium. */
router.post('/verify/app-store', async (req: Request, res: Response) => {
  const installId = req.installId ?? '';
  if (!installId) {
    res.status(400).json({ error: 'Missing install id' });
    return;
  }
  const receiptData = typeof req.body?.receiptData === 'string' ? req.body.receiptData.trim() : '';
  if (!receiptData) {
    res.status(400).json({ error: 'receiptData required' });
    return;
  }
  if (!isAppStoreBillingConfigured()) {
    res.status(503).json({
      error: 'App Store billing not configured on server',
      code: 'APP_STORE_NOT_CONFIGURED',
    });
    return;
  }
  try {
    const verified = await verifyAppStoreReceipt(receiptData);
    const purchaseKey =
      verified.originalTransactionId != null
        ? hashAppStorePurchaseKey(verified.originalTransactionId)
        : receiptData.slice(0, 64);
    const entitlement = grantPremiumSubscription(installId, {
      months: verified.months,
      productId: verified.productId,
      purchaseToken: purchaseKey,
      subscriptionMarket: 'intl',
      billingProvider: 'app_store',
      subscriptionPlan: verified.plan,
      premiumUntil: verified.expiryTimeMs ?? undefined,
    });
    if (verified.originalTransactionId) {
      linkAppleOriginalTransaction(installId, verified.originalTransactionId);
    }
    resetStoryQuotaForInstall(installId);
    void notifyWelcomeEmailForInstall({
      installId,
      purchaseKey: purchaseKey,
      plan: verified.plan,
      premiumUntilMs: entitlement.premiumUntil,
      billingProvider: 'app_store',
      explicitLang: req.body?.appLanguage,
    });
    res.json({
      ok: true,
      tier: resolveUserTier(installId),
      entitlement,
      subscriptionMarket: 'intl',
      hint: 'International subscription active. You can switch to Russian UI — limits stay the same.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[billing/verify/app-store]', msg);
    res.status(400).json({ ok: false, error: msg, code: 'APP_STORE_VERIFY_FAILED' });
  }
});

/** StoreKit 2 — server-verified when APPLE_* API keys set; else device JWS fields. */
router.post('/apple/verify', async (req: Request, res: Response) => {
  const installId = req.installId ?? '';
  if (!installId) {
    res.status(400).json({ error: 'Missing install id' });
    return;
  }

  if (!isAppStoreBillingConfigured() && !isAppStoreServerApiConfigured()) {
    res.status(503).json({
      error: 'App Store billing not configured on server',
      code: 'APP_STORE_NOT_CONFIGURED',
    });
    return;
  }

  try {
    let tx: ParsedAppleTransaction;
    if (isAppStoreServerApiConfigured()) {
      tx = await resolveVerifiedTransaction({
        signedTransactionInfo:
          typeof req.body?.signedTransactionInfo === 'string'
            ? req.body.signedTransactionInfo
            : undefined,
        transactionId:
          typeof req.body?.transactionId === 'string' ? req.body.transactionId : undefined,
        environment:
          typeof req.body?.environment === 'string' ? req.body.environment : undefined,
      });
    } else {
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
      if (!verified.ok || !verified.productId || !verified.transactionId) {
        res.status(400).json({
          ok: false,
          error: verified.error ?? 'Invalid Apple purchase',
          code: verified.code ?? 'APPLE_VERIFY_FAILED',
        });
        return;
      }
      tx = {
        productId: verified.productId,
        transactionId: verified.transactionId,
        originalTransactionId:
          typeof req.body?.originalTransactionId === 'string'
            ? req.body.originalTransactionId
            : verified.transactionId,
        expiresDateMs: verified.premiumUntilMs ?? null,
        environment: typeof req.body?.environment === 'string' ? req.body.environment : null,
        revoked: false,
      };
    }

    const { entitlement } = grantApplePremiumForInstall(installId, tx);
    const opts = parsedToGrantOptions(tx);
    await afterApplePurchaseGranted(installId, tx, opts);

    res.json({
      ok: true,
      tier: resolveUserTier(installId),
      premium: true,
      entitlement,
      subscriptionMarket: 'intl',
      hint: 'International subscription active. You can switch to Russian UI — limits stay the same.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[billing/apple/verify]', msg);
    res.status(400).json({ ok: false, error: msg, code: 'APPLE_VERIFY_FAILED' });
  }
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
