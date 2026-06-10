import type { SubscriptionPlan } from './yookassa.js';
import { fetchYooKassaPayment, SUBSCRIPTION_PLANS } from './yookassa.js';
import {
  getAccountByEmailForBilling,
  grantPremiumByEmail,
  type GrantPremiumOptions,
} from './account-store.js';
import {
  isEmailConfigured,
  sendPaymentSuccessEmail,
  sendReceiptRequestEmail,
} from './email-sender.js';

export async function applyYooKassaPaymentSucceeded(options: {
  paymentId: string;
  email?: string | null;
  plan?: SubscriptionPlan | null;
  metadataRecurring?: boolean;
}): Promise<void> {
  const payment = await fetchYooKassaPayment(options.paymentId);
  const metaEmail = payment?.metadata?.email?.trim().toLowerCase();
  const metaPlan = parseMetaPlan(payment?.metadata?.plan);
  const email = (options.email ?? metaEmail)?.trim().toLowerCase();
  const plan = options.plan ?? metaPlan;
  const isRecurring =
    options.metadataRecurring ||
    payment?.metadata?.recurring === 'true' ||
    payment?.metadata?.recurring === true;

  if (!email || !plan) {
    console.warn(
      `[yookassa/billing] payment.succeeded missing email/plan paymentId=${options.paymentId}`,
    );
    return;
  }

  if (isRecurring) {
    const existing = getAccountByEmailForBilling(email);
    if (existing?.autoRenew === false || !existing?.yookassaPaymentMethodId?.trim()) {
      console.warn(
        `[yookassa/billing] recurring ignored — autopay cancelled email=${email} paymentId=${options.paymentId}`,
      );
      return;
    }
  }

  const planMeta = SUBSCRIPTION_PLANS[plan];
  let paymentMethodId: string | null = null;
  if (payment?.paymentMethodSaved && payment.paymentMethodId) {
    paymentMethodId = payment.paymentMethodId;
    console.log(
      `[yookassa/billing] saved card payment_method_id=${paymentMethodId.slice(0, 8)}… email=${email}`,
    );
  } else if (!isRecurring) {
    console.warn(`[yookassa/billing] card not saved — autopay disabled email=${email}`);
  }

  const grantOpts: GrantPremiumOptions = {
    months: planMeta.months,
    productId: planMeta.productId,
    subscriptionPlan: plan,
    subscriptionMarket: 'ru',
    billingProvider: 'yookassa',
  };
  if (paymentMethodId) {
    grantOpts.paymentMethodId = paymentMethodId;
    grantOpts.autoRenew = true;
  } else if (!isRecurring) {
    grantOpts.autoRenew = false;
  }

  const entitlement = grantPremiumByEmail(email, grantOpts);
  const premiumUntilIso = new Date(entitlement.premiumUntil).toISOString();

  if (isEmailConfigured()) {
    void sendPaymentSuccessEmail({
      to: email,
      plan: planMeta.labelRu,
      amountRub: planMeta.amountRub,
      premiumUntilIso,
    }).catch((err) => {
      console.warn('[yookassa/billing] user success email failed:', err instanceof Error ? err.message : err);
    });
    void sendReceiptRequestEmail({
      userEmail: email,
      plan: planMeta.labelRu,
      amountRub: planMeta.amountRub,
      paymentId: options.paymentId,
      premiumUntilIso,
    }).catch((err) => {
      console.warn('[yookassa/billing] receipt email failed:', err instanceof Error ? err.message : err);
    });
  }
}

function parseMetaPlan(raw: unknown): SubscriptionPlan | null {
  if (raw === 'month' || raw === 'quarter' || raw === 'year') return raw;
  return null;
}
