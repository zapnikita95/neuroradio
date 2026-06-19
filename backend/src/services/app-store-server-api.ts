/**
 * App Store Server API — JWT auth + transaction lookup (StoreKit 2).
 * Env: APPLE_KEY_ID, APPLE_ISSUER_ID, APPLE_IAP_PRIVATE_KEY, optional APPLE_BUNDLE_ID.
 */
import { SignJWT, importPKCS8 } from 'jose';

const BUNDLE_ID_DEFAULT = 'com.efirai.myapp';

export type ParsedAppleTransaction = {
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  expiresDateMs: number | null;
  environment: string | null;
  revoked: boolean;
};

function normalizePrivateKey(raw: string): string {
  const key = raw.trim();
  if (key.includes('\\n')) return key.replace(/\\n/g, '\n');
  return key;
}

export function isAppStoreServerApiConfigured(): boolean {
  return Boolean(
    process.env.APPLE_KEY_ID?.trim() &&
      process.env.APPLE_ISSUER_ID?.trim() &&
      (process.env.APPLE_IAP_PRIVATE_KEY?.trim() || process.env.APPLE_PRIVATE_KEY?.trim()),
  );
}

export function resolveAppleBundleId(): string {
  return process.env.APPLE_BUNDLE_ID?.trim() || BUNDLE_ID_DEFAULT;
}

async function makeAuthToken(): Promise<string> {
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const issuerId = process.env.APPLE_ISSUER_ID?.trim();
  const pem = normalizePrivateKey(
    process.env.APPLE_IAP_PRIVATE_KEY?.trim() || process.env.APPLE_PRIVATE_KEY?.trim() || '',
  );
  if (!keyId || !issuerId || !pem) {
    throw new Error('APP_STORE_SERVER_API_NOT_CONFIGURED');
  }
  const key = await importPKCS8(pem, 'ES256');
  return new SignJWT({ bid: resolveAppleBundleId() })
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setIssuer(issuerId)
    .setAudience('appstoreconnect-v1')
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(key);
}

export function decodeJwsPayload(jws: string): Record<string, unknown> | null {
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

function apiRoot(sandbox: boolean): string {
  return sandbox
    ? 'https://api.storekit-sandbox.itunes.apple.com'
    : 'https://api.storekit.itunes.apple.com';
}

export async function fetchTransactionFromApple(
  transactionId: string,
  sandboxHint?: boolean | null,
): Promise<ParsedAppleTransaction> {
  if (!isAppStoreServerApiConfigured()) {
    throw new Error('APP_STORE_SERVER_API_NOT_CONFIGURED');
  }
  const tid = transactionId.trim();
  if (!tid) throw new Error('MISSING_TRANSACTION_ID');

  const attempts = sandboxHint == null ? [true, false] : [sandboxHint];
  let lastStatus = 0;
  for (const sandbox of attempts) {
    const token = await makeAuthToken();
    const url = `${apiRoot(sandbox)}/inApps/v1/transactions/${encodeURIComponent(tid)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    lastStatus = res.status;
    if (!res.ok) continue;
    const body = (await res.json()) as { signedTransactionInfo?: string };
    const signed = body.signedTransactionInfo?.trim();
    if (!signed) throw new Error('MISSING_SIGNED_TRANSACTION');
    return parseSignedTransaction(signed, sandbox ? 'Sandbox' : 'Production');
  }
  throw new Error(`TRANSACTION_NOT_FOUND:${lastStatus}`);
}

export function parseSignedTransaction(
  signedTransactionInfo: string,
  environmentFallback?: string | null,
): ParsedAppleTransaction {
  const payload = decodeJwsPayload(signedTransactionInfo);
  if (!payload) throw new Error('INVALID_SIGNED_TRANSACTION');

  const productId = readString(payload, 'productId');
  const transactionId = readString(payload, 'transactionId');
  const originalTransactionId =
    readString(payload, 'originalTransactionId') ?? transactionId;
  if (!productId || !transactionId || !originalTransactionId) {
    throw new Error('INCOMPLETE_TRANSACTION');
  }

  const expectedBundle = resolveAppleBundleId();
  const bundleId = readString(payload, 'bundleId');
  if (bundleId && bundleId !== expectedBundle) {
    throw new Error('BUNDLE_MISMATCH');
  }

  const expiresRaw = readNumber(payload, 'expiresDate');
  const expiresDateMs =
    expiresRaw != null
      ? expiresRaw > 1_000_000_000_000
        ? Math.floor(expiresRaw)
        : Math.floor(expiresRaw * 1000)
      : null;

  const revocationDate = readNumber(payload, 'revocationDate');
  const environment =
    readString(payload, 'environment') ?? environmentFallback ?? null;

  return {
    productId,
    transactionId,
    originalTransactionId,
    expiresDateMs,
    environment,
    revoked: revocationDate != null && revocationDate > 0,
  };
}

export async function resolveVerifiedTransaction(input: {
  signedTransactionInfo?: string;
  transactionId?: string;
  environment?: string;
}): Promise<ParsedAppleTransaction> {
  let sandboxHint: boolean | null = null;
  if (input.environment?.toLowerCase() === 'sandbox') sandboxHint = true;
  if (input.environment?.toLowerCase() === 'production') sandboxHint = false;

  let transactionId = input.transactionId?.trim();
  if (input.signedTransactionInfo?.trim()) {
    const preview = decodeJwsPayload(input.signedTransactionInfo);
    if (preview) {
      transactionId =
        transactionId ??
        readString(preview, 'transactionId') ??
        readString(preview, 'originalTransactionId');
      const env = readString(preview, 'environment');
      if (env === 'Sandbox') sandboxHint = true;
      if (env === 'Production') sandboxHint = false;
    }
  }

  if (!transactionId) throw new Error('MISSING_TRANSACTION_ID');

  if (isAppStoreServerApiConfigured()) {
    return fetchTransactionFromApple(transactionId, sandboxHint);
  }

  if (!input.signedTransactionInfo?.trim()) {
    throw new Error('APP_STORE_SERVER_API_NOT_CONFIGURED');
  }
  return parseSignedTransaction(
    input.signedTransactionInfo,
    sandboxHint === true ? 'Sandbox' : sandboxHint === false ? 'Production' : null,
  );
}

export type AppleServerNotificationResult = {
  handled: boolean;
  action?: string;
  notificationType?: string;
  originalTransactionId?: string;
};

export function decodeNotificationPayload(signedPayload: string): {
  notificationType: string;
  subtype?: string;
  signedTransactionInfo?: string;
} {
  const outer = decodeJwsPayload(signedPayload);
  if (!outer) throw new Error('INVALID_NOTIFICATION_PAYLOAD');
  const notificationType = readString(outer, 'notificationType') ?? '';
  const subtype = readString(outer, 'subtype');
  const data = outer.data as Record<string, unknown> | undefined;
  const signedTransactionInfo =
    data && typeof data.signedTransactionInfo === 'string'
      ? data.signedTransactionInfo
      : undefined;
  return { notificationType, subtype, signedTransactionInfo };
}
