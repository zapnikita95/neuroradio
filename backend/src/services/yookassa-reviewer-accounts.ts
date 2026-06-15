import type { AccountRecord } from './account-store.js';

/** Тестовые учётки App Review / Play Review (фиксированный код 000000, без письма, полный Premium). */
const REVIEWER_ACCOUNTS: Record<string, { code: string }> = {
  'googletester@test.ru': { code: '000000' },
  'appletester@test.ru': { code: '000000' },
  'appletester@test.com': { code: '000000' },
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
  if (code === entry.code) return true;
  // App Review иногда вводит лишний ноль (0000000) — для тестовых учёток принимаем любую строку из нулей ≥6.
  if (/^0+$/.test(code) && code.length >= entry.code.length) return true;
  return false;
}

/** Premium на год, без привязанной карты — полный доступ для App / Play Review. */
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
