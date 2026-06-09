import { canUseSileroTts } from './silero-tts.js';
import { canUseAzureSpeechProduction } from './azure-tts.js';
import { hasYandexCredentials } from './yandex-tts.js';

export type UserTtsProviderId = 'yandex' | 'sber';

export interface UserYandexTtsCredentials {
  apiKey: string;
  folderId: string;
}

export interface UserSaluteTtsCredentials {
  authKey: string;
}

export interface UserTtsCredentials {
  provider: UserTtsProviderId;
  yandex?: UserYandexTtsCredentials;
  salute?: UserSaluteTtsCredentials;
}

export interface UserTtsBodyFields {
  yandex_api_key?: unknown;
  yandex_folder_id?: unknown;
  salute_auth_key?: unknown;
  salute_client_id?: unknown;
  salute_client_secret?: unknown;
  user_tts_provider?: unknown;
}

function asOptionalSecret(value: unknown, maxLen = 512): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/[\s\n\r]+/g, '').trim();
  if (!trimmed || trimmed.length > maxLen) return undefined;
  return trimmed;
}

function asOptionalFolderId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return undefined;
  return trimmed;
}

function buildSaluteAuthKey(body: UserTtsBodyFields): string | undefined {
  const direct = asOptionalSecret(body.salute_auth_key, 512);
  if (direct) return direct;

  const clientId = asOptionalSecret(body.salute_client_id, 128);
  const clientSecret = asOptionalSecret(body.salute_client_secret, 256);
  if (clientId && clientSecret) {
    return Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  }
  return undefined;
}

/** Client-supplied TTS billing (keys never stored on server). */
export function parseUserTtsCredentials(body: UserTtsBodyFields): UserTtsCredentials | null {
  const requested =
    typeof body.user_tts_provider === 'string' ? body.user_tts_provider.trim().toLowerCase() : '';

  const yandexApiKey = asOptionalSecret(body.yandex_api_key);
  const yandexFolderId = asOptionalFolderId(body.yandex_folder_id);
  const saluteAuthKey = buildSaluteAuthKey(body);

  if (yandexApiKey && yandexFolderId) {
    return {
      provider: 'yandex',
      yandex: { apiKey: yandexApiKey, folderId: yandexFolderId },
    };
  }

  if (saluteAuthKey) {
    return {
      provider: 'sber',
      salute: { authKey: saluteAuthKey },
    };
  }

  if (requested === 'yandex' || requested === 'sber') {
    return null;
  }

  return null;
}

export function hasUserTtsCredentials(creds: UserTtsCredentials | null | undefined): boolean {
  if (!creds) return false;
  if (creds.provider === 'yandex') {
    return Boolean(creds.yandex?.apiKey && creds.yandex.folderId);
  }
  if (creds.provider === 'sber') {
    return Boolean(creds.salute?.authKey);
  }
  return false;
}

export function canSynthesizeServerTts(userCreds: UserTtsCredentials | null): boolean {
  if (hasUserTtsCredentials(userCreds)) return true;
  return true;
}

export function resolveUserTtsProvider(creds: UserTtsCredentials | null): UserTtsProviderId | null {
  if (!hasUserTtsCredentials(creds) || !creds) return null;
  return creds.provider;
}
