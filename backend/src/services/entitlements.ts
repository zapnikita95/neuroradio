import { isUnlimitedInstall } from '../config/security.js';
import { getEntitlementForInstall, type AccountPlan } from './account-store.js';

export type UserTier = 'free' | 'premium' | 'unlimited';

export const PREMIUM_PRODUCT_MONTHLY = 'premium_voice_monthly';
export const PREMIUM_PRICE_RUB_MONTHLY = 199;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getPremiumInstallIds(): ReadonlySet<string> {
  const ids = new Set<string>();
  const raw = process.env.PREMIUM_INSTALL_IDS?.trim();
  if (!raw) return ids;
  for (const part of raw.split(',')) {
    const id = part.trim().toLowerCase();
    if (UUID_RE.test(id)) ids.add(id);
  }
  return ids;
}

export function isPremiumInstallWhitelisted(installId: string): boolean {
  const normalized = installId.trim().toLowerCase();
  return getPremiumInstallIds().has(normalized);
}

export function isPremiumActive(plan: AccountPlan, premiumUntil: number): boolean {
  return plan === 'premium' && premiumUntil > Date.now();
}

export function resolveUserTier(installId: string): UserTier {
  if (isUnlimitedInstall(installId)) return 'unlimited';
  if (isPremiumInstallWhitelisted(installId)) return 'premium';

  const ent = getEntitlementForInstall(installId);
  if (isPremiumActive(ent.plan, ent.premiumUntil)) return 'premium';
  return 'free';
}

export function hasPremiumEntitlement(installId: string): boolean {
  const tier = resolveUserTier(installId);
  return tier === 'premium' || tier === 'unlimited';
}

export function isElevenLabsEnabled(): boolean {
  const flag = process.env.ELEVENLABS_ENABLED?.trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'on';
}

/** Azure ru-RU Neural — default premium TTS when configured. */
export function isAzureSpeechEnabled(): boolean {
  const flag = process.env.AZURE_SPEECH_ENABLED?.trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  if (flag === 'true' || flag === '1' || flag === 'on') return true;
  return Boolean(
    process.env.AZURE_SPEECH_KEY?.trim() && process.env.AZURE_SPEECH_REGION?.trim(),
  );
}

/** SaluteSpeech (Сбер) — рекомендуемый premium TTS для РФ. */
export function isSaluteSpeechEnabled(): boolean {
  const flag = process.env.SALUTE_SPEECH_ENABLED?.trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  if (flag === 'true' || flag === '1' || flag === 'on') return true;
  const authKey = process.env.SALUTE_SPEECH_AUTH_KEY?.trim();
  const id = process.env.SALUTE_SPEECH_CLIENT_ID?.trim();
  const secret = process.env.SALUTE_SPEECH_CLIENT_SECRET?.trim();
  return Boolean(authKey || (id && secret));
}

export function premiumUpsellHintRu(tier: UserTier): string {
  if (tier === 'premium' || tier === 'unlimited') {
    return 'Премиум-голос (SaluteSpeech, Сбер) активен.';
  }
  return `Профессиональный голос радиоведущего (SaluteSpeech, чистый русский) — ${PREMIUM_PRICE_RUB_MONTHLY} ₽/мес (${PREMIUM_PRODUCT_MONTHLY}).`;
}

