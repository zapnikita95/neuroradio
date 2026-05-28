import { postprocessOggFile } from './audio-postprocess.js';
import {
  synthesizeSpeechAzure,
  canUseAzureSpeechProduction,
  hasAzureSpeechCredentials,
} from './azure-tts.js';
import { preparePlainSpeechText } from './tts-azure-ssml.js';
import {
  hasPremiumEntitlement,
  isElevenLabsEnabled,
} from './entitlements.js';
import { hasElevenLabsCredentials, synthesizeSpeechElevenLabs } from './elevenlabs-tts.js';
import {
  synthesizeSpeechSalute,
  canUseSaluteSpeechProduction,
  hasSaluteSpeechCredentials,
} from './salute-tts.js';
import type { TtsEmotion } from './tts-options.js';
import type { TtsPauseProfile, TtsVoiceStyleId } from './tts-voice-profiles.js';
import {
  synthesizeSpeech as synthesizeYandex,
  type SynthesisResult,
  type YandexTtsLogContext,
} from './yandex-tts.js';
import type { YandexVoiceId } from './voices.js';
import type { StoryNarratorId } from './story-narrator.js';

export type TtsProviderId = 'auto' | 'yandex' | 'sber' | 'azure' | 'elevenlabs';
export type EffectiveTtsProvider = 'yandex' | 'sber' | 'azure' | 'elevenlabs';
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
  request: Pick<TtsRouteRequest, 'voiceTier' | 'ttsProvider' | 'installId'>,
): EffectiveTtsProvider {
  const requirePremium = () => {
    if (!hasPremiumEntitlement(request.installId)) {
      throw new PremiumTtsAccessError(
        'Премиум-голос доступен по подписке 199 ₽/мес. Оформите premium_voice_monthly.',
      );
    }
  };

  if (request.ttsProvider === 'yandex') {
    return 'yandex';
  }

  if (request.ttsProvider === 'sber') {
    requirePremium();
    if (canUseSaluteSpeechProduction()) return 'sber';
    console.warn('[tts-router] sber requested but not configured — fallback to Yandex');
    return 'yandex';
  }

  if (request.ttsProvider === 'azure') {
    requirePremium();
    if (canUseAzureSpeechProduction()) return 'azure';
    if (canUseSaluteSpeechProduction()) return 'sber';
    return 'yandex';
  }

  if (request.ttsProvider === 'elevenlabs') {
    requirePremium();
    if (canUseElevenLabs()) return 'elevenlabs';
    if (canUseSaluteSpeechProduction()) return 'sber';
    if (canUseAzureSpeechProduction()) return 'azure';
    return 'yandex';
  }

  if (request.voiceTier === 'premium') {
    requirePremium();
    return pickPremiumAutoProvider();
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
  } else {
    result = await synthesizeYandex(request.script, request.voiceId, request.fileName, {
      speed: request.speed,
      emotion: request.emotion,
      artist: request.artist,
      title: request.title,
      pauseProfile: request.pauseProfile,
      logContext: request.logContext,
    });
  }

  await postprocessOggFile(result.filePath);

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
};
