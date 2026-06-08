import type { AccountRecord } from './account-store.js';

/** Тестовые учётки (фиксированный код 000000, без письма). */
const REVIEWER_ACCOUNTS: Record<string, { code: string; dailyStories: number }> = {
  'googletester@test.ru': { code: '000000', dailyStories: 10 },
  'appletester@test.ru': { code: '000000', dailyStories: 10 },
};

const REVIEWER_PREMIUM_MS = 365 * 24 * 60 * 60 * 1000;

function normalizeReviewerEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isYookassaReviewerEmail(emailRaw: string): boolean {
  return Boolean(REVIEWER_ACCOUNTS[normalizeReviewerEmail(emailRaw)]);
}

export function isYookassaReviewerLoginCode(emailRaw: string, codeRaw: string): boolean {
  const email = normalizeReviewerEmail(emailRaw);
  const entry = REVIEWER_ACCOUNTS[email];
  if (!entry) return false;
  const code = codeRaw.replace(/\D/g, '').trim();
  return code === entry.code;
}

export function getYookassaReviewerDailyLimit(emailRaw: string): number | null {
  const entry = REVIEWER_ACCOUNTS[normalizeReviewerEmail(emailRaw)];
  return entry?.dailyStories ?? null;
}

/** Premium на год, без привязанной карты — чтобы проверяющие могли пройти оплату с нуля. */
export function provisionYookassaReviewerAccount(account: AccountRecord): void {
  const now = Date.now();
  account.plan = 'premium';
  account.premiumUntil = Math.max(account.premiumUntil ?? 0, now + REVIEWER_PREMIUM_MS);
  account.trialUntil = 0;
  account.trialStoriesUsed = 0;
  account.premiumProductId = 'premium_voice_monthly';
  account.subscriptionPlan = account.subscriptionPlan ?? 'month';
  account.autoRenew = false;
  account.yookassaPaymentMethodId = null;
  account.nextPaymentAt = null;
  account.lastRecurringAttemptAt = null;
}
