const EXPECTED_BUNDLE_IDS = new Set(['com.efirai.appname', 'com.efirai.myapp']);

/** Must match App Store Connect + ios/MusicStory/Billing/StoreKitManager.swift */
export const APPLE_IAP_PRODUCT_IDS = [
  'premium_month_usd',
  'efir_premium_quarter_usd',
  'efir_premium_year_usd',
] as const;

export type AppleIapProductId = (typeof APPLE_IAP_PRODUCT_IDS)[number];

export interface ApplePurchaseVerifyInput {
  signedTransactionInfo?: string;
  transactionId?: string;
  productId?: string;
  originalTransactionId?: string;
  expiresDateMs?: number;
  bundleId?: string;
  environment?: string;
}

export interface ApplePurchaseVerifyResult {
  ok: boolean;
  productId?: string;
  transactionId?: string;
  months?: number;
  premiumUntilMs?: number;
  autoRenew?: boolean;
  error?: string;
  code?: string;
}

function decodeJwsPayload(jws: string): Record<string, unknown> | null {
  const parts = jws.trim().split('.');
  if (parts.length < 2) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const json = Buffer.from(padded + pad, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const value = obj[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function monthsForAppleProductId(productId: string): number {
  const id = productId.toLowerCase();
  if (id.includes('year')) return 12;
  if (id.includes('quarter')) return 3;
  return 1;
}

function isKnownProductId(productId: string): boolean {
  return APPLE_IAP_PRODUCT_IDS.includes(productId as AppleIapProductId);
}

/**
 * Validates an App Store purchase payload from StoreKit 2 on device.
 * Signature chain verification can be added later via App Store Server API.
 */
export function verifyApplePurchaseInput(
  input: ApplePurchaseVerifyInput,
): ApplePurchaseVerifyResult {
  let productId = input.productId?.trim();
  let transactionId = input.transactionId?.trim();
  let bundleId = input.bundleId?.trim();
  let expiresDateMs = input.expiresDateMs;

  if (input.signedTransactionInfo?.trim()) {
    const payload = decodeJwsPayload(input.signedTransactionInfo);
    if (!payload) {
      return { ok: false, error: 'Invalid signed transaction', code: 'APPLE_JWS_INVALID' };
    }
    productId = productId ?? readString(payload, 'productId');
    transactionId =
      transactionId ??
      readString(payload, 'transactionId') ??
      readString(payload, 'originalTransactionId');
    bundleId = bundleId ?? readString(payload, 'bundleId');
    const expires =
      readNumber(payload, 'expiresDate') ??
      readNumber(payload, 'expiresDateMs') ??
      readNumber(payload, 'expirationDate');
    if (expires != null) {
      expiresDateMs = expires > 1_000_000_000_000 ? Math.floor(expires) : Math.floor(expires * 1000);
    }
  }

  if (!productId) {
    return { ok: false, error: 'Missing product id', code: 'APPLE_PRODUCT_MISSING' };
  }
  if (!isKnownProductId(productId)) {
    return { ok: false, error: 'Unknown product id', code: 'APPLE_PRODUCT_UNKNOWN' };
  }
  if (bundleId && !EXPECTED_BUNDLE_IDS.has(bundleId)) {
    return { ok: false, error: 'Bundle id mismatch', code: 'APPLE_BUNDLE_MISMATCH' };
  }

  const months = monthsForAppleProductId(productId);
  const premiumUntilMs =
    expiresDateMs && expiresDateMs > Date.now()
      ? expiresDateMs
      : Date.now() + months * 31 * 24 * 60 * 60 * 1000;

  return {
    ok: true,
    productId,
    transactionId,
    months,
    premiumUntilMs,
    autoRenew: true,
  };
}
