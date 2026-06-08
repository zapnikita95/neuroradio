import { postprocessOggFile } from './audio-postprocess.js';
import {
  synthesizeSpeechAzure,
  canUseAzureSpeechProduction,
  hasAzureSpeechCredentials,
} from './azure-tts.js';
import { preparePlainSpeechText } from './tts-azure-ssml.js';
import {
  canUseServerSpeechKit,
  SileroRequiredForFreeTierError,
  SpeechKitSubscriptionRequiredError,
} from './tts-access.js';
import { hasPremiumEntitlement, isElevenLabsEnabled } from './entitlements.js';
import { hasElevenLabsCredentials, synthesizeSpeechElevenLabs } from './elevenlabs-tts.js';
import {
  synthesizeSpeechSalute,
  canUseSaluteSpeechProduction,
  hasSaluteSpeechCredentials,
} from './salute-tts.js';
import {
  canUseSileroTts,
  synthesizeSpeechSilero,
} from './silero-tts.js';
import type { SileroVoiceId, SileroVoicePresetId } from './silero-voices.js';
import type { TtsEmotion } from './tts-options.js';
import type { TtsPauseProfile, TtsVoiceStyleId } from './tts-voice-profiles.js';
import {
  synthesizeSpeech as synthesizeYandex,
  type SynthesisResult,
  type YandexTtsLogContext,
} from './yandex-tts.js';
import type { YandexVoiceId } from './voices.js';
import type { StoryNarratorId } from './story-narrator.js';
import type { UserTtsCredentials } from './user-tts-credentials.js';
import {
  hasUserTtsCredentials,
  resolveUserTtsProvider,
} from './user-tts-credentials.js';

export type TtsProviderId = 'auto' | 'yandex' | 'sber' | 'azure' | 'elevenlabs' | 'silero';
export type EffectiveTtsProvider = 'yandex' | 'sber' | 'azure' | 'elevenlabs' | 'silero';
export type VoiceTier = 'default' | 'premium';

export interface TtsRouteRequest {
  installId: string;
  voiceTier: VoiceTier;
  ttsProvider: TtsProviderId;
  script: string;
  voiceId: YandexVoiceId;
  fileName: string;
  speed: number;
  emotion: TtsEmotion;
  pauseProfile: TtsPauseProfile;
  ttsStyle?: TtsVoiceStyleId;
  storyNarrator?: StoryNarratorId;
  artist?: string;
  title?: string;
  logContext?: YandexTtsLogContext;
  userTtsCredentials?: UserTtsCredentials | null;
  sileroVoice?: string;
  sileroVoicePreset?: SileroVoicePresetId;
}

export interface TtsRouteResult extends SynthesisResult {
  provider: EffectiveTtsProvider;
  voiceTier: VoiceTier;
}

export class PremiumTtsAccessError extends Error {
  readonly code = 'PREMIUM_TTS_REQUIRED';

  constructor(message = 'Premium voice requires an active subscription.') {
    super(message);
    this.name = 'PremiumTtsAccessError';
  }
}

function canUseElevenLabs(): boolean {
  return hasElevenLabsCredentials() && isElevenLabsEnabled();
}

/** Premium для РФ: SaluteSpeech → улучшенный Yandex. Azure/ElevenLabs — только явный запрос. */
function pickPremiumAutoProvider(): EffectiveTtsProvider {
  if (canUseSaluteSpeechProduction()) return 'sber';
  return 'yandex';
}

export function resolveEffectiveTtsProvider(
  request: Pick<TtsRouteRequest, 'voiceTier' | 'ttsProvider' | 'installId' | 'userTtsCredentials'>,
): EffectiveTtsProvider {
  const userProvider = resolveUserTtsProvider(request.userTtsCredentials ?? null);
  if (userProvider === 'yandex') return 'yandex';
  if (userProvider === 'sber') return 'sber';

  const serverSpeechKit = canUseServerSpeechKit(request.installId, request.userTtsCredentials);

  const requirePremium = () => {
    if (!hasPremiumEntitlement(request.installId)) {
      throw new PremiumTtsAccessError(
        'Премиум-голос доступен по подписке 199 ₽/мес. Оформите premium_voice_monthly.',
      );
    }
  };

  const requireSileroForFree = () => {
    if (canUseSileroTts()) return 'silero' as const;
    throw new SileroRequiredForFreeTierError();
  };

  if (request.ttsProvider === 'yandex') {
    if (!serverSpeechKit) {
      throw new SpeechKitSubscriptionRequiredError();
    }
    return 'yandex';
  }

  if (request.ttsProvider === 'silero') {
    return requireSileroForFree();
  }

  if (request.ttsProvider === 'sber') {
    requirePremium();
    if (canUseSaluteSpeechProduction()) return 'sber';
    if (!serverSpeechKit) throw new SpeechKitSubscriptionRequiredError();
    console.warn('[tts-router] sber requested but not configured — fallback to Yandex');
    return 'yandex';
  }

  if (request.ttsProvider === 'azure') {
    requirePremium();
    if (canUseAzureSpeechProduction()) return 'azure';
    if (canUseSaluteSpeechProduction()) return 'sber';
    if (!serverSpeechKit) throw new SpeechKitSubscriptionRequiredError();
    return 'yandex';
  }

  if (request.ttsProvider === 'elevenlabs') {
    requirePremium();
    if (canUseElevenLabs()) return 'elevenlabs';
    if (canUseSaluteSpeechProduction()) return 'sber';
    if (canUseAzureSpeechProduction()) return 'azure';
    if (!serverSpeechKit) throw new SpeechKitSubscriptionRequiredError();
    return 'yandex';
  }

  if (request.voiceTier === 'premium') {
    requirePremium();
    return pickPremiumAutoProvider();
  }

  if (!serverSpeechKit) {
    return requireSileroForFree();
  }

  if (canUseSileroTts() && process.env.TTS_PREFER_SILERO?.trim() !== 'false') {
    return 'silero';
  }

  return 'yandex';
}

export async function synthesizeStoryAudio(request: TtsRouteRequest): Promise<TtsRouteResult> {
  const provider = resolveEffectiveTtsProvider(request);

  let result: SynthesisResult;
  if (provider === 'sber') {
    result = await synthesizeSpeechSalute(request.script, request.fileName, {
      artist: request.artist,
      title: request.title,
      speed: request.speed,
      pauseProfile: request.pauseProfile,
      styleId: request.ttsStyle,
      storyNarrator: request.storyNarrator,
      clientAuthKey: request.userTtsCredentials?.salute?.authKey,
    });
  } else if (provider === 'azure') {
    result = await synthesizeSpeechAzure(request.script, request.fileName, {
      artist: request.artist,
      title: request.title,
      speed: request.speed,
      pauseProfile: request.pauseProfile,
      styleId: request.ttsStyle,
      storyNarrator: request.storyNarrator,
    });
  } else if (provider === 'elevenlabs') {
    const plainText = preparePlainSpeechText(
      request.script,
      request.artist ?? '',
      request.title ?? '',
    );
    result = await synthesizeSpeechElevenLabs(plainText, request.fileName, {
      artist: request.artist,
      title: request.title,
    });
  } else if (provider === 'silero') {
    result = await synthesizeSpeechSilero(request.script, request.fileName, {
      artist: request.artist,
      title: request.title,
      voicePreset: request.sileroVoicePreset,
      voice: request.sileroVoice as SileroVoiceId | undefined,
    });
  } else {
    result = await synthesizeYandex(request.script, request.voiceId, request.fileName, {
      speed: request.speed,
      emotion: request.emotion,
      artist: request.artist,
      title: request.title,
      pauseProfile: request.pauseProfile,
      logContext: request.logContext,
      credentials: request.userTtsCredentials?.yandex,
    });
  }

  if (result.filePath.endsWith('.ogg')) {
    await postprocessOggFile(result.filePath);
  }

  return {
    ...result,
    provider,
    voiceTier: request.voiceTier,
  };
}

export {
  hasAzureSpeechCredentials,
  canUseAzureSpeechProduction,
  hasSaluteSpeechCredentials,
  canUseSaluteSpeechProduction,
  canUseSileroTts,
};
