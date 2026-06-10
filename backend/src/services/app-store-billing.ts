import crypto from 'node:crypto';
import { SUBSCRIPTION_PLANS_USD, type SubscriptionPlan } from './yookassa.js';

const PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

const USD_PRODUCT_TO_PLAN: Record<string, SubscriptionPlan> = Object.fromEntries(
  Object.entries(SUBSCRIPTION_PLANS_USD).map(([plan, meta]) => [meta.productId, plan as SubscriptionPlan]),
);

export type AppStoreVerifyResult = {
  ok: true;
  productId: string;
  plan: SubscriptionPlan;
  months: number;
  expiryTimeMs: number | null;
  originalTransactionId: string | null;
};

function sharedSecret(): string | null {
  return process.env.APP_STORE_SHARED_SECRET?.trim() || null;
}

export function isAppStoreBillingConfigured(): boolean {
  return Boolean(sharedSecret());
}

type ReceiptInfo = {
  product_id?: string;
  expires_date_ms?: string;
  expires_date?: string;
  original_transaction_id?: string;
};

function pickLatestSubscription(receipts: ReceiptInfo[]): ReceiptInfo | null {
  let best: ReceiptInfo | null = null;
  let bestExpiry = 0;
  for (const row of receipts) {
    const productId = row.product_id?.trim();
    if (!productId || !USD_PRODUCT_TO_PLAN[productId]) continue;
    const expiryMs = row.expires_date_ms
      ? Number(row.expires_date_ms)
      : row.expires_date
        ? Date.parse(row.expires_date)
        : 0;
    if (!Number.isFinite(expiryMs)) continue;
    if (expiryMs >= bestExpiry) {
      bestExpiry = expiryMs;
      best = row;
    }
  }
  return best;
}

async function postVerifyReceipt(
  url: string,
  receiptData: string,
): Promise<{ status: number; latest_receipt_info?: ReceiptInfo[]; receipt?: { in_app?: ReceiptInfo[] } }> {
  const secret = sharedSecret();
  if (!secret) throw new Error('APP_STORE_NOT_CONFIGURED');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receiptData,
      password: secret,
      'exclude-old-transactions': true,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`App Store verify HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  return (await res.json()) as {
    status: number;
    latest_receipt_info?: ReceiptInfo[];
    receipt?: { in_app?: ReceiptInfo[] };
  };
}

export async function verifyAppStoreReceipt(receiptDataBase64: string): Promise<AppStoreVerifyResult> {
  if (!isAppStoreBillingConfigured()) {
    throw new Error('APP_STORE_NOT_CONFIGURED');
  }
  const receiptData = receiptDataBase64.trim();
  if (!receiptData) throw new Error('MISSING_RECEIPT');

  let payload = await postVerifyReceipt(PRODUCTION_URL, receiptData);
  if (payload.status === 21007) {
    payload = await postVerifyReceipt(SANDBOX_URL, receiptData);
  }
  if (payload.status !== 0) {
    throw new Error(`APP_STORE_STATUS_${payload.status}`);
  }

  const rows = payload.latest_receipt_info ?? payload.receipt?.in_app ?? [];
  const latest = pickLatestSubscription(rows);
  if (!latest?.product_id) {
    throw new Error('NO_ACTIVE_SUBSCRIPTION');
  }

  const productId = latest.product_id.trim();
  const plan = USD_PRODUCT_TO_PLAN[productId];
  if (!plan) {
    throw new Error(`UNKNOWN_PRODUCT_ID:${productId}`);
  }

  const expiryTimeMs = latest.expires_date_ms
    ? Number(latest.expires_date_ms)
    : latest.expires_date
      ? Date.parse(latest.expires_date)
      : null;

  if (expiryTimeMs != null && Number.isFinite(expiryTimeMs) && expiryTimeMs <= Date.now()) {
    throw new Error('SUBSCRIPTION_EXPIRED');
  }

  const meta = SUBSCRIPTION_PLANS_USD[plan];
  return {
    ok: true,
    productId,
    plan,
    months: meta.months,
    expiryTimeMs: expiryTimeMs && Number.isFinite(expiryTimeMs) ? expiryTimeMs : null,
    originalTransactionId: latest.original_transaction_id?.trim() ?? null,
  };
}

/** Hash for deduplication / linking (no raw receipt stored). */
export function hashAppStorePurchaseKey(originalTransactionId: string): string {
  return crypto.createHash('sha256').update(`appstore:${originalTransactionId}`).digest('hex');
}
