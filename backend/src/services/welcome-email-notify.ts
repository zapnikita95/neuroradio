import type { BillingProvider } from './account-store.js';
import {
  getAccountByEmailForBilling,
  getAccountProfile,
  markWelcomeEmailSent,
  resolveAccountSettingsForInstall,
  shouldSendWelcomeEmail,
} from './account-store.js';
import { isEmailConfigured, sendWelcomeEmail } from './email-sender.js';
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PLANS_USD,
  type SubscriptionPlan,
} from './yookassa.js';
import type { WelcomeEmailLang } from './welcome-email-template.js';

export type { WelcomeEmailLang };

export function parseWelcomeLang(raw: unknown, fallback: WelcomeEmailLang = 'ru'): WelcomeEmailLang {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'en') return 'en';
  if (v === 'ru') return 'ru';
  return fallback;
}

export function resolveWelcomeLang(options: {
  explicit?: unknown;
  billingProvider?: BillingProvider | null;
  installId?: string;
}): WelcomeEmailLang {
  if (typeof options.explicit === 'string' && options.explicit.trim()) {
    return parseWelcomeLang(options.explicit);
  }
  if (options.installId) {
    const settings = resolveAccountSettingsForInstall(options.installId);
    if (settings?.appLanguage) {
      return parseWelcomeLang(settings.appLanguage);
    }
  }
  if (options.billingProvider === 'app_store' || options.billingProvider === 'google_play') {
    return 'en';
  }
  return 'ru';
}

function planPresentation(
  plan: SubscriptionPlan,
  billingProvider?: BillingProvider | null,
): { label: string; amount: number; currency: 'RUB' | 'USD' } {
  if (billingProvider === 'app_store' || billingProvider === 'google_play') {
    const meta = SUBSCRIPTION_PLANS_USD[plan];
    return { label: meta.labelEn, amount: meta.amountUsd, currency: 'USD' };
  }
  const meta = SUBSCRIPTION_PLANS[plan];
  return { label: meta.labelRu, amount: meta.amountRub, currency: 'RUB' };
}

export async function notifyWelcomeEmailAfterPurchase(options: {
  email: string;
  purchaseKey: string;
  plan: SubscriptionPlan;
  premiumUntilMs: number;
  billingProvider?: BillingProvider | null;
  lang?: WelcomeEmailLang;
  installId?: string;
  explicitLang?: unknown;
}): Promise<void> {
  const email = options.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  if (!isEmailConfigured()) return;
  if (!shouldSendWelcomeEmail(email, options.purchaseKey)) return;

  const billingProvider = options.billingProvider ?? getAccountByEmailForBilling(email)?.billingProvider ?? null;
  const lang =
    options.lang ??
    resolveWelcomeLang({
      explicit: options.explicitLang,
      billingProvider,
      installId: options.installId,
    });
  const { label, amount, currency } = planPresentation(options.plan, billingProvider);

  try {
    await sendWelcomeEmail({
      to: email,
      lang,
      plan: label,
      amount,
      currency,
      premiumUntilIso: new Date(options.premiumUntilMs).toISOString(),
    });
    markWelcomeEmailSent(email, options.purchaseKey);
  } catch (err) {
    console.warn(
      '[welcome-email] failed:',
      err instanceof Error ? err.message : err,
      `email=${email} key=${options.purchaseKey.slice(0, 12)}`,
    );
  }
}

export async function notifyWelcomeEmailForInstall(options: {
  installId: string;
  purchaseKey: string;
  plan: SubscriptionPlan;
  premiumUntilMs: number;
  billingProvider: BillingProvider;
  explicitLang?: unknown;
}): Promise<void> {
  const profile = getAccountProfile(options.installId);
  const email = profile.email?.trim().toLowerCase();
  if (!email) return;
  await notifyWelcomeEmailAfterPurchase({
    email,
    purchaseKey: options.purchaseKey,
    plan: options.plan,
    premiumUntilMs: options.premiumUntilMs,
    billingProvider: options.billingProvider,
    installId: options.installId,
    explicitLang: options.explicitLang,
  });
}
