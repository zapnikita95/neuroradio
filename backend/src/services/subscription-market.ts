import { hasPremiumEntitlement } from './entitlements.js';
import { getEntitlementForInstall } from './account-store.js';
import { isPremiumActive } from './entitlements.js';
import type { AccountPlan } from './account-store.js';
import { SUBSCRIPTION_PLANS_USD } from './yookassa.js';

/** RU = YooKassa (₽). intl = App Store / Google Play ($). */
export type SubscriptionMarket = 'ru' | 'intl';

export type BillingProvider = 'yookassa' | 'google_play' | 'app_store';

export type AppLanguageCode = 'ru' | 'en';

export type LanguageSwitchBlockReason = 'ru_sub_needs_intl_upgrade';

export type LanguageSwitchPolicy =
  | { allowed: true; note?: string }
  | {
      allowed: false;
      reason: LanguageSwitchBlockReason;
      hintRu: string;
      hintEn: string;
    };

const INTL_PRODUCT_IDS = new Set(
  Object.values(SUBSCRIPTION_PLANS_USD).map((p) => p.productId),
);

export function inferSubscriptionMarket(account: {
  subscriptionMarket?: SubscriptionMarket | null;
  billingProvider?: BillingProvider | null;
  premiumProductId?: string | null;
  yookassaPaymentMethodId?: string | null;
  cardSaved?: boolean;
}): SubscriptionMarket | null {
  if (account.subscriptionMarket === 'ru' || account.subscriptionMarket === 'intl') {
    return account.subscriptionMarket;
  }
  if (account.billingProvider === 'google_play' || account.billingProvider === 'app_store') {
    return 'intl';
  }
  if (account.billingProvider === 'yookassa') return 'ru';
  const productId = account.premiumProductId?.trim();
  if (productId && INTL_PRODUCT_IDS.has(productId)) return 'intl';
  if (account.yookassaPaymentMethodId?.trim() || account.cardSaved) return 'ru';
  return null;
}

export function resolveLanguageSwitchPolicy(
  installId: string,
  targetLang: AppLanguageCode,
  market: SubscriptionMarket | null,
): LanguageSwitchPolicy {
  const ent = getEntitlementForInstall(installId);
  const premiumActive = isPremiumActive(ent.plan as AccountPlan, ent.premiumUntil);

  if (!premiumActive || !market) {
    return { allowed: true };
  }

  if (market === 'ru' && targetLang === 'en') {
    return {
      allowed: false,
      reason: 'ru_sub_needs_intl_upgrade',
      hintRu:
        'У вас активна подписка в рублях. Английский интерфейс использует более дорогие модели — ' +
        'оформите международную подписку через Google Play или App Store.',
      hintEn:
        'Your subscription is tied to the Russian (RUB) plan. English uses costlier models — ' +
        'upgrade to the international plan via Google Play or the App Store.',
    };
  }

  if (market === 'intl' && targetLang === 'ru') {
    return {
      allowed: true,
      note: 'Limits stay on your international subscription tier.',
    };
  }

  return { allowed: true };
}

/** Billing channel for new purchases on this device locale. */
export function resolveBillingChannel(appLanguage: AppLanguageCode): 'yookassa' | 'in_app' {
  return appLanguage === 'en' ? 'in_app' : 'yookassa';
}

export function hasActivePremiumForInstall(installId: string): boolean {
  return hasPremiumEntitlement(installId);
}
