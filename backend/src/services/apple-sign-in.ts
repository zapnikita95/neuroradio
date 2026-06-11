import crypto from 'node:crypto';

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';

const ALLOWED_BUNDLE_IDS = new Set(['com.efirai.appname', 'com.efirai.myapp']);

type JwkKey = {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
};

let jwksCache: { keys: JwkKey[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

function decodeJwtPart<T extends Record<string, unknown>>(part: string): T | null {
  try {
    const json = base64UrlDecode(part).toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

async function fetchAppleJwks(): Promise<JwkKey[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const response = await fetch(APPLE_JWKS_URL);
  if (!response.ok) {
    throw new Error(`Apple JWKS HTTP ${response.status}`);
  }
  const body = (await response.json()) as { keys?: JwkKey[] };
  const keys = body.keys ?? [];
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

function jwkToPem(jwk: JwkKey): string | null {
  if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) return null;
  const keyObject = crypto.createPublicKey({
    key: { kty: 'RSA', n: jwk.n, e: jwk.e },
    format: 'jwk',
  });
  return keyObject.export({ type: 'spki', format: 'pem' }).toString();
}

export interface AppleIdentityClaims {
  sub: string;
  email?: string;
  aud: string;
}

export async function verifyAppleIdentityToken(
  identityToken: string,
): Promise<{ ok: true; claims: AppleIdentityClaims } | { ok: false; error: string }> {
  const token = identityToken.trim();
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'Invalid Apple identity token' };
  }

  const header = decodeJwtPart<{ alg?: string; kid?: string }>(parts[0]);
  const payload = decodeJwtPart<{
    iss?: string;
    aud?: string;
    exp?: number;
    sub?: string;
    email?: string;
  }>(parts[1]);

  if (!header?.kid || header.alg !== 'RS256' || !payload?.sub || !payload.aud || !payload.exp) {
    return { ok: false, error: 'Invalid Apple token payload' };
  }
  if (payload.iss !== APPLE_ISSUER) {
    return { ok: false, error: 'Invalid Apple token issuer' };
  }
  if (!ALLOWED_BUNDLE_IDS.has(payload.aud)) {
    return { ok: false, error: 'Bundle id mismatch' };
  }
  if (payload.exp * 1000 < Date.now()) {
    return { ok: false, error: 'Apple token expired' };
  }

  const keys = await fetchAppleJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    return { ok: false, error: 'Apple signing key not found' };
  }
  const pem = jwkToPem(jwk);
  if (!pem) {
    return { ok: false, error: 'Apple signing key invalid' };
  }

  const signed = `${parts[0]}.${parts[1]}`;
  const signature = base64UrlDecode(parts[2]);
  const valid = crypto.verify('RSA-SHA256', Buffer.from(signed), pem, signature);
  if (!valid) {
    return { ok: false, error: 'Apple token signature invalid' };
  }

  return {
    ok: true,
    claims: {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      aud: payload.aud,
    },
  };
}
