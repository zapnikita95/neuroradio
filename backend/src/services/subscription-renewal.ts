import {
  listAccountsDueForRenewal,
  markRecurringAttempt,
} from './account-store.js';
import {
  createRecurringYooKassaPayment,
  isYooKassaConfigured,
  SUBSCRIPTION_PLANS,
} from './yookassa.js';

const RENEWAL_INTERVAL_MS = 60 * 60_000;
const RETRY_COOLDOWN_MS = 20 * 60 * 60_000;

let renewalRunning = false;

export async function processRecurringPayments(): Promise<void> {
  if (!isYooKassaConfigured() || renewalRunning) return;
  renewalRunning = true;
  try {
    const due = listAccountsDueForRenewal(RETRY_COOLDOWN_MS);
    if (due.length === 0) return;

    console.log(`[billing/recurring] due accounts=${due.length}`);
    for (const row of due) {
      const planMeta = SUBSCRIPTION_PLANS[row.plan];
      try {
        markRecurringAttempt(row.email);
        const created = await createRecurringYooKassaPayment({
          email: row.email,
          plan: row.plan,
          paymentMethodId: row.paymentMethodId,
        });
        console.log(
          `[billing/recurring] charged email=${row.email} plan=${row.plan} ` +
            `paymentId=${created.paymentId} status=${created.status}`,
        );
      } catch (err) {
        console.error(
          `[billing/recurring] failed email=${row.email} plan=${row.plan}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } finally {
    renewalRunning = false;
  }
}

export function startSubscriptionRenewalScheduler(): void {
  if (!isYooKassaConfigured()) return;
  void processRecurringPayments();
  setInterval(() => {
    void processRecurringPayments();
  }, RENEWAL_INTERVAL_MS).unref();
  console.log('[billing/recurring] scheduler started (hourly)');
}
