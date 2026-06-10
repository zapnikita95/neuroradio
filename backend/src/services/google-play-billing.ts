import crypto from 'node:crypto';
import { SUBSCRIPTION_PLANS_USD, type SubscriptionPlan } from './yookassa.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ANDROID_PUBLISHER = 'https://androidpublisher.googleapis.com/androidpublisher/v3';

const USD_PRODUCT_TO_PLAN: Record<string, SubscriptionPlan> = Object.fromEntries(
  Object.entries(SUBSCRIPTION_PLANS_USD).map(([plan, meta]) => [meta.productId, plan as SubscriptionPlan]),
);

export type GooglePlayVerifyResult = {
  ok: true;
  productId: string;
  plan: SubscriptionPlan;
  months: number;
  expiryTimeMs: number | null;
  orderId: string | null;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function parseServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email?.trim() || !parsed.private_key?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isGooglePlayBillingConfigured(): boolean {
  return Boolean(parseServiceAccount() && process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim());
}

function base64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const sa = parseServiceAccount();
  if (!sa) throw new Error('GOOGLE_PLAY_NOT_CONFIGURED');

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  sign.end();
  const signature = sign.sign(sa.private_key.replace(/\\n/g, '\n'));
  const jwt = `${unsigned}.${base64Url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Google OAuth HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  const token = data.access_token?.trim();
  if (!token) throw new Error('Google OAuth missing access_token');
  cachedToken = {
    value: token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return token;
}

export async function verifyGooglePlaySubscription(options: {
  productId: string;
  purchaseToken: string;
}): Promise<GooglePlayVerifyResult> {
  if (!isGooglePlayBillingConfigured()) {
    throw new Error('GOOGLE_PLAY_NOT_CONFIGURED');
  }
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME!.trim();
  const productId = options.productId.trim();
  const purchaseToken = options.purchaseToken.trim();
  const plan = USD_PRODUCT_TO_PLAN[productId];
  if (!plan) {
    throw new Error(`UNKNOWN_PRODUCT_ID:${productId}`);
  }

  const token = await getAccessToken();
  const url =
    `${ANDROID_PUBLISHER}/applications/${encodeURIComponent(packageName)}` +
    `/purchases/subscriptions/${encodeURIComponent(productId)}` +
    `/tokens/${encodeURIComponent(purchaseToken)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Play verify HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }

  const data = (await res.json()) as {
    expiryTimeMillis?: string;
    orderId?: string;
    paymentState?: number;
    cancelReason?: number;
  };

  const expiryRaw = data.expiryTimeMillis ? Number(data.expiryTimeMillis) : null;
  const expiryTimeMs = expiryRaw && Number.isFinite(expiryRaw) ? expiryRaw : null;
  if (expiryTimeMs != null && expiryTimeMs <= Date.now()) {
    throw new Error('SUBSCRIPTION_EXPIRED');
  }

  const meta = SUBSCRIPTION_PLANS_USD[plan];
  return {
    ok: true,
    productId,
    plan,
    months: meta.months,
    expiryTimeMs,
    orderId: data.orderId?.trim() ?? null,
  };
}
