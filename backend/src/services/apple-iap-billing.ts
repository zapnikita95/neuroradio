import {
  linkAppleOriginalTransaction,
  applyAppleSubscriptionUpdate,
  getAccountIdByAppleOriginalTransaction,
} from './account-store.js';
import {
  decodeNotificationPayload,
  parseSignedTransaction,
  type ParsedAppleTransaction,
} from './app-store-server-api.js';
import {
  monthsForAppleProductId,
  isKnownAppleProductId,
  planForAppleProductId,
} from './apple-iap.js';
import { hashAppStorePurchaseKey } from './app-store-billing.js';
import { resetStoryQuotaForInstall } from '../middleware/rate-limit.js';
import { notifyWelcomeEmailForInstall } from './welcome-email-notify.js';

export function parsedToGrantOptions(tx: ParsedAppleTransaction) {
  if (!isKnownAppleProductId(tx.productId)) {
    throw new Error(`UNKNOWN_PRODUCT_ID:${tx.productId}`);
  }
  if (tx.revoked) {
    throw new Error('TRANSACTION_REVOKED');
  }
  const months = monthsForAppleProductId(tx.productId);
  const plan = planForAppleProductId(tx.productId);
  const premiumUntilMs =
    tx.expiresDateMs && tx.expiresDateMs > Date.now()
      ? tx.expiresDateMs
      : Date.now() + months * 31 * 24 * 60 * 60 * 1000;
  const purchaseKey = hashAppStorePurchaseKey(tx.originalTransactionId);
  return { months, plan, premiumUntilMs, purchaseKey, productId: tx.productId };
}

export function grantApplePremiumForInstall(installId: string, tx: ParsedAppleTransaction) {
  const opts = parsedToGrantOptions(tx);
  const entitlement = applyAppleSubscriptionUpdate({
    installId,
    originalTransactionId: tx.originalTransactionId,
    productId: opts.productId,
    months: opts.months,
    premiumUntilMs: opts.premiumUntilMs,
    subscriptionPlan: opts.plan,
    purchaseToken: opts.purchaseKey,
    revoke: false,
  });
  resetStoryQuotaForInstall(installId);
  return { entitlement, ...opts };
}

export function handleAppStoreServerNotification(signedPayload: string) {
  const { notificationType, signedTransactionInfo } = decodeNotificationPayload(signedPayload);
  if (!signedTransactionInfo) {
    return { handled: false, reason: 'no_transaction', notificationType };
  }

  const tx = parseSignedTransaction(signedTransactionInfo);
  const accountId = getAccountIdByAppleOriginalTransaction(tx.originalTransactionId);

  const deactivate = new Set([
    'EXPIRED',
    'GRACE_PERIOD_EXPIRED',
    'REVOKE',
    'REFUND',
    'REFUND_DECLINED',
  ]);
  const renew = new Set(['SUBSCRIBED', 'DID_RENEW', 'OFFER_REDEEMED', 'RENEWAL_EXTENDED']);

  if (!accountId) {
    console.info(
      '[app-store/webhook] no account for orig=%s type=%s',
      tx.originalTransactionId,
      notificationType,
    );
    return { handled: false, reason: 'unknown_entitlement', notificationType };
  }

  if (tx.revoked || deactivate.has(notificationType)) {
    applyAppleSubscriptionUpdate({
      installId: '',
      originalTransactionId: tx.originalTransactionId,
      productId: tx.productId,
      revoke: true,
    });
    return {
      handled: true,
      action: 'deactivated',
      notificationType,
      originalTransactionId: tx.originalTransactionId,
    };
  }

  if (renew.has(notificationType)) {
    const opts = parsedToGrantOptions(tx);
    applyAppleSubscriptionUpdate({
      installId: '',
      originalTransactionId: tx.originalTransactionId,
      productId: opts.productId,
      months: opts.months,
      premiumUntilMs: opts.premiumUntilMs,
      subscriptionPlan: opts.plan,
      purchaseToken: opts.purchaseKey,
      revoke: false,
    });
    return {
      handled: true,
      action: 'renewed',
      notificationType,
      originalTransactionId: tx.originalTransactionId,
    };
  }

  return {
    handled: true,
    action: 'ignored',
    notificationType,
    originalTransactionId: tx.originalTransactionId,
  };
}

export async function afterApplePurchaseGranted(
  installId: string,
  tx: ParsedAppleTransaction,
  opts: ReturnType<typeof parsedToGrantOptions>,
): Promise<void> {
  linkAppleOriginalTransaction(installId, tx.originalTransactionId);
  await notifyWelcomeEmailForInstall({
    installId,
    purchaseKey: opts.purchaseKey,
    plan: opts.plan,
    premiumUntilMs: opts.premiumUntilMs,
    billingProvider: 'app_store',
  });
}
