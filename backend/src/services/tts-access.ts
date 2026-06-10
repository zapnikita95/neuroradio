import { hasPaidStoryTier } from './entitlements.js';
import {
  hasUserTtsCredentials,
  type UserTtsCredentials,
} from './user-tts-credentials.js';
import { canUseSileroTts } from './silero-tts.js';

export type StoryTtsProviderId = 'auto' | 'yandex' | 'sber' | 'azure' | 'elevenlabs' | 'silero' | 'edge';

/** Server Yandex SpeechKit — только trial/premium или свой ключ пользователя. */
export function canUseServerSpeechKit(
  installId: string,
  userTtsCredentials: UserTtsCredentials | null | undefined,
): boolean {
  if (hasUserTtsCredentials(userTtsCredentials)) return true;
  return hasPaidStoryTier(installId);
}

export function shouldSkipDailyStoryQuota(options: {
  ownLlmKey: boolean;
  userTtsCredentials: UserTtsCredentials | null | undefined;
}): boolean {
  return options.ownLlmKey || hasUserTtsCredentials(options.userTtsCredentials);
}

/** Принудительный TTS-провайдер с учётом тарифа (не доверяем клиенту на free). */
export function resolveStoryTtsProvider(
  installId: string,
  requested: StoryTtsProviderId | undefined,
  userTtsCredentials: UserTtsCredentials | null | undefined,
): StoryTtsProviderId {
  if (hasUserTtsCredentials(userTtsCredentials)) {
    if (userTtsCredentials?.provider === 'yandex') return 'yandex';
    if (userTtsCredentials?.provider === 'sber') return 'sber';
  }

  if (canUseServerSpeechKit(installId, userTtsCredentials)) {
    return requested ?? 'auto';
  }

  return 'edge';
}

export class SpeechKitSubscriptionRequiredError extends Error {
  readonly code = 'SPEECHKIT_REQUIRES_SUBSCRIPTION';

  constructor(
    message = 'Yandex SpeechKit доступен на пробном и платном тарифе или со своим ключом Yandex Cloud.',
  ) {
    super(message);
    this.name = 'SpeechKitSubscriptionRequiredError';
  }
}

export class FreeTierEdgeTtsError extends Error {
  readonly code = 'EDGE_TTS_FREE_TIER';

  constructor(
    message = 'На бесплатном тарифе озвучка через Edge TTS. Оформите подписку для Yandex SpeechKit или укажите свой ключ.',
  ) {
    super(message);
    this.name = 'FreeTierEdgeTtsError';
  }
}

/** @deprecated use FreeTierEdgeTtsError */
export const SileroRequiredForFreeTierError = FreeTierEdgeTtsError;

export function assertFreeTierTtsAvailable(
  installId: string,
  userTtsCredentials: UserTtsCredentials | null | undefined,
): void {
  if (canUseServerSpeechKit(installId, userTtsCredentials)) return;
  // Edge TTS (Microsoft) — без ключей, всегда доступен на бесплатном тарифе.
}
