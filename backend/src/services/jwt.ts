import crypto from 'node:crypto';
import { SECURITY } from '../config/security.js';

interface JwtPayload {
  sub: string;
  pkg?: string;
  cert?: string;
  [key: string]: unknown;
}

/** Android debug keystore (project / local dev) — only when ALLOW_DEBUG_CERT is not false. */
const DEBUG_CERT_SHA256 = 'a0105c5f4b340597d107f440356ffc9fcfa8c3fbdf002646a67d0a4ed733a8fc';

/** GitHub Actions ubuntu-latest default debug.keystore (mobile-latest APK before shared keystore). */
const CI_DEBUG_CERT_SHA256 = 'c5b7363ebcaf8808b02e1bb766c8d688c7a542fc60d840bc6d3651452c537d48';

/** Play upload keystore (efir-upload) — release AAB/APK before Google Play re-signing. */
const UPLOAD_RELEASE_CERT_SHA256 =
  '6c2a59abfbacc6b828d4c0c321be5f848056988558677e4123d216200c531b09';

/** Google Play App signing key (Store installs) — from deployment_cert.der / Play Console. */
const PLAY_APP_SIGNING_CERT_SHA256 =
  '5f454350d54e048ef7edc7b61808337dd1bf91d94b3ccfe75043a7a5afa7f0b5';

function base64UrlEncode(input: Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buffer.toString('base64url');
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

export function signJwt(payload: JwtPayload, secret: string, expiresInSec: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSec };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const sigBuffer = base64UrlDecode(encodedSignature);
  const expectedBuffer = base64UrlDecode(expected);
  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as JwtPayload & {
      exp?: number;
    };
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;
    if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) return null;

    if (payload.client === EXTENSION_CLIENT_ID) {
      if (!isExtensionAuthEnabled()) return null;
      return payload;
    }
    if (payload.client === DESKTOP_CLIENT_ID) {
      if (!isDesktopAuthEnabled()) return null;
      return payload;
    }

    if (payload.pkg && !isAllowedPackageName(String(payload.pkg))) return null;
    if (payload.cert) {
      const allowed = getAllowedCertFingerprints();
      if (!allowed.has(normalizeCertSha256(String(payload.cert)))) return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function normalizeCertSha256(value: string): string {
  return value.trim().replace(/:/g, '').toLowerCase();
}

/** Явный AUTH_JWT_SECRET или автоматически из GROQ_API_KEY (уже есть на Railway). */
export function getAuthJwtSecret(): string | null {
  const explicit = process.env.AUTH_JWT_SECRET?.trim();
  if (explicit && explicit.length >= 32) return explicit;

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) return null;

  return crypto.createHmac('sha256', 'music-story-app-jwt-v1').update(groqKey).digest('hex');
}

const DEFAULT_PACKAGE_NAMES = ['com.efirai.appname', 'com.efirai.myapp', 'com.musicstory.app'];

/** TestFlight / App Store — без Railway ALLOWED_IOS_TEAM_ID. */
const DEFAULT_IOS_TEAM_IDS = ['Y52BT2N4L8'];

export function getAllowedPackageNames(): Set<string> {
  const allowed = new Set<string>();
  const raw = process.env.ALLOWED_PACKAGE_NAME?.trim();
  if (raw) {
    for (const part of raw.split(',')) {
      const name = part.trim();
      if (name) allowed.add(name);
    }
  } else {
    for (const name of DEFAULT_PACKAGE_NAMES) allowed.add(name);
  }
  return allowed;
}

export function getAllowedPackageName(): string {
  return [...getAllowedPackageNames()][0] ?? 'com.efirai.myapp';
}

export function isAllowedPackageName(packageName: string | undefined | null): boolean {
  const normalized = packageName?.trim();
  if (!normalized) return false;
  return getAllowedPackageNames().has(normalized);
}

export function getAllowedIosTeamIds(): Set<string> {
  const allowed = new Set<string>();
  const raw = process.env.ALLOWED_IOS_TEAM_ID?.trim();
  if (raw) {
    for (const part of raw.split(',')) {
      const id = part.trim().toUpperCase();
      if (id.length >= 6) allowed.add(id);
    }
  }
  return allowed;
}

/** SHA256("ios:{bundleId}:{teamId}") — attestation sent by iOS app as cert_sha256. */
export function iosAttestationHash(bundleId: string, teamId: string): string {
  return crypto
    .createHash('sha256')
    .update(`ios:${bundleId}:${teamId}`)
    .digest('hex');
}

export function getAllowedCertFingerprints(): Set<string> {
  const allowed = new Set<string>();
  /** Public mobile-latest APK from GitHub Actions (ubuntu debug.keystore). */
  allowed.add(normalizeCertSha256(CI_DEBUG_CERT_SHA256));
  /** Release upload keystore — sideload / local release testing. */
  allowed.add(normalizeCertSha256(UPLOAD_RELEASE_CERT_SHA256));
  /** Google Play re-signs Store builds with this key. */
  allowed.add(normalizeCertSha256(PLAY_APP_SIGNING_CERT_SHA256));

  if (SECURITY.allowDebugCert) {
    allowed.add(normalizeCertSha256(DEBUG_CERT_SHA256));
    allowed.add(normalizeCertSha256(iosAttestationHash('com.musicstory.app', 'DEVELOPMENT')));
    allowed.add(normalizeCertSha256(iosAttestationHash('com.efirai.appname', 'DEVELOPMENT')));
    allowed.add(normalizeCertSha256(iosAttestationHash('com.efirai.myapp', 'DEVELOPMENT')));
  }

  const raw = process.env.ALLOWED_CERT_SHA256?.trim();
  if (raw) {
    for (const part of raw.split(',')) {
      const normalized = normalizeCertSha256(part);
      if (normalized.length === 64) allowed.add(normalized);
    }
  }

  const teamIds = new Set([...getAllowedIosTeamIds(), ...DEFAULT_IOS_TEAM_IDS]);
  for (const bundleId of getAllowedPackageNames()) {
    for (const teamId of teamIds) {
      allowed.add(normalizeCertSha256(iosAttestationHash(bundleId, teamId)));
    }
  }
  return allowed;
}

export function isValidCertFingerprint(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(normalizeCertSha256(value));
}

/** 90 дней по умолчанию — приложение само обновляет токен в фоне. */
export function getTokenTtlSeconds(): number {
  const parsed = parseInt(process.env.AUTH_TOKEN_TTL_SECONDS ?? '7776000', 10);
  if (Number.isNaN(parsed) || parsed < 3600) return 7776000;
  return Math.min(parsed, 90 * 24 * 3600);
}

export function isAppAuthEnabled(): boolean {
  return Boolean(getAuthJwtSecret());
}

export const DESKTOP_CLIENT_ID = 'desktop';
export const EXTENSION_CLIENT_ID = 'extension';

export function isDesktopLikeClient(client: unknown): boolean {
  return client === DESKTOP_CLIENT_ID || client === EXTENSION_CLIENT_ID;
}

/** Shared secret for desktop app token exchange (DESKTOP_AUTH_SECRET env). */
export function getDesktopAuthSecret(): string | null {
  const secret = process.env.DESKTOP_AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) return null;
  return secret;
}

export function isDesktopAuthEnabled(): boolean {
  if (getDesktopAuthSecret()) return true;
  return process.env.ALLOW_DESKTOP_AUTH?.trim().toLowerCase() === 'true';
}

/** Browser extension — JWT by install_id, no shared secret (public client). */
export function isExtensionAuthEnabled(): boolean {
  if (process.env.ALLOW_EXTENSION_AUTH?.trim().toLowerCase() === 'false') return false;
  return Boolean(getAuthJwtSecret());
}

export function verifyDesktopAuthSecret(provided: string): boolean {
  const expected = getDesktopAuthSecret();
  if (!expected) return process.env.ALLOW_DESKTOP_AUTH?.trim().toLowerCase() === 'true';
  const a = Buffer.from(provided.trim(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
