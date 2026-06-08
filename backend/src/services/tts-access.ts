import { hasPaidStoryTier } from './entitlements.js';
import {
  hasUserTtsCredentials,
  type UserTtsCredentials,
} from './user-tts-credentials.js';
import { canUseSileroTts } from './silero-tts.js';

export type StoryTtsProviderId = 'auto' | 'yandex' | 'sber' | 'azure' | 'elevenlabs' | 'silero';

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

  return 'silero';
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

export class SileroRequiredForFreeTierError extends Error {
  readonly code = 'SILERO_REQUIRED_FOR_FREE';

  constructor(
    message = 'На бесплатном тарифе озвучка только через Silero. Оформите подписку для SpeechKit или укажите свой ключ Yandex.',
  ) {
    super(message);
    this.name = 'SileroRequiredForFreeTierError';
  }
}

export function assertFreeTierTtsAvailable(
  installId: string,
  userTtsCredentials: UserTtsCredentials | null | undefined,
): void {
  if (canUseServerSpeechKit(installId, userTtsCredentials)) return;
  if (!canUseSileroTts()) {
    throw new SileroRequiredForFreeTierError();
  }
}
