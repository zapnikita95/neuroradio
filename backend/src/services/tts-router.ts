import { postprocessOggFile } from './audio-postprocess.js';
import {
  synthesizeSpeechAzure,
  canUseAzureSpeechProduction,
  hasAzureSpeechCredentials,
} from './azure-tts.js';
import {
  canUseServerSpeechKit,
  SpeechKitSubscriptionRequiredError,
} from './tts-access.js';
import { hasPremiumEntitlement, isElevenLabsEnabled } from './entitlements.js';
import { hasElevenLabsCredentials, synthesizeSpeechElevenLabs } from './elevenlabs-tts.js';
import { resolveElevenLabsVoiceId } from './elevenlabs-voices.js';
import type { StoryLanguageId } from './story-language.js';
import {
  synthesizeSpeechSalute,
  canUseSaluteSpeechProduction,
  hasSaluteSpeechCredentials,
} from './salute-tts.js';
import { synthesizeSpeechEdge } from './edge-tts-story.js';
import type { EdgeVoicePresetId } from './edge-voices.js';
import { resolveEdgeVoicePresetId } from './edge-voices.js';
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

export type TtsProviderId = 'auto' | 'yandex' | 'sber' | 'azure' | 'elevenlabs' | 'edge';
export type EffectiveTtsProvider = 'yandex' | 'sber' | 'azure' | 'elevenlabs' | 'edge';
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
  edgeVoicePreset?: EdgeVoicePresetId | string;
  speakTrackNamesInVoiceover?: boolean;
  storyLanguage?: StoryLanguageId;
  elevenLabsVoice?: string;
  /** iOS AVPlayer — WAV only; Salute OGG заменяем на Yandex WAV. */
  preferIosPlayback?: boolean;
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

function normalizeTtsProvider(requested: TtsProviderId | string | undefined): TtsProviderId {
  if (requested === 'silero') return 'edge';
  if (
    requested === 'yandex' ||
    requested === 'sber' ||
    requested === 'azure' ||
    requested === 'elevenlabs' ||
    requested === 'edge' ||
    requested === 'auto'
  ) {
    return requested;
  }
  return 'auto';
}

export function resolveEffectiveTtsProvider(
  request: Pick<
    TtsRouteRequest,
    'voiceTier' | 'ttsProvider' | 'installId' | 'userTtsCredentials' | 'storyLanguage'
  >,
): EffectiveTtsProvider {
  const ttsProvider = normalizeTtsProvider(request.ttsProvider);
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

  if (ttsProvider === 'edge') {
    return 'edge';
  }

  if (ttsProvider === 'yandex') {
    if (!serverSpeechKit) {
      throw new SpeechKitSubscriptionRequiredError();
    }
    return 'yandex';
  }

  if (ttsProvider === 'sber') {
    requirePremium();
    if (canUseSaluteSpeechProduction()) return 'sber';
    if (!serverSpeechKit) throw new SpeechKitSubscriptionRequiredError();
    console.warn('[tts-router] sber requested but not configured — fallback to Yandex');
    return 'yandex';
  }

  if (ttsProvider === 'azure') {
    requirePremium();
    if (canUseAzureSpeechProduction()) return 'azure';
    if (canUseSaluteSpeechProduction()) return 'sber';
    if (!serverSpeechKit) throw new SpeechKitSubscriptionRequiredError();
    return 'yandex';
  }

  if (ttsProvider === 'elevenlabs') {
    requirePremium();
    if (canUseElevenLabs()) return 'elevenlabs';
    if (canUseSaluteSpeechProduction()) return 'sber';
    if (canUseAzureSpeechProduction()) return 'azure';
    if (!serverSpeechKit) throw new SpeechKitSubscriptionRequiredError();
    return 'yandex';
  }

  if (request.voiceTier === 'premium') {
    requirePremium();
    if (request.storyLanguage === 'en' && canUseElevenLabs()) {
      return 'elevenlabs';
    }
    return pickPremiumAutoProvider();
  }

  if (request.storyLanguage === 'en') {
    if (hasPremiumEntitlement(request.installId) && canUseElevenLabs()) {
      return 'elevenlabs';
    }
    return 'edge';
  }

  if (!serverSpeechKit) {
    return 'edge';
  }

  return 'yandex';
}

function scriptForProvider(request: TtsRouteRequest, _provider: EffectiveTtsProvider): string {
  // genericize + транслитерация — в sanitizeScriptForTts (prepareYandexTtsText), без двойной обработки
  return request.script;
}

function ttsMarkupFlags(request: TtsRouteRequest): { speakTrackNamesInVoiceover: boolean } {
  return { speakTrackNamesInVoiceover: request.speakTrackNamesInVoiceover === true };
}

export async function synthesizeStoryAudio(request: TtsRouteRequest): Promise<TtsRouteResult> {
  let provider = resolveEffectiveTtsProvider(request);
  if (request.preferIosPlayback && provider === 'sber') {
    console.warn('[tts-router] ios playback — Salute OGG skipped, using Yandex WAV');
    provider = 'yandex';
  }
  const script = scriptForProvider(request, provider);
  const yandexAudioFormat = request.preferIosPlayback ? ('lpcm-wav' as const) : undefined;
  const edgePreset = resolveEdgeVoicePresetId(
    typeof request.edgeVoicePreset === 'string' ? request.edgeVoicePreset : undefined,
  );

  let result: SynthesisResult;
  if (provider === 'edge') {
    result = await synthesizeSpeechEdge(script, request.fileName, {
      artist: request.artist,
      title: request.title,
      voicePreset: edgePreset,
      speed: request.speed,
      speakTrackNamesInVoiceover: request.speakTrackNamesInVoiceover,
    });
  } else if (provider === 'sber') {
    result = await synthesizeSpeechSalute(script, request.fileName, {
      artist: request.artist,
      title: request.title,
      speed: request.speed,
      pauseProfile: request.pauseProfile,
      styleId: request.ttsStyle,
      storyNarrator: request.storyNarrator,
      clientAuthKey: request.userTtsCredentials?.salute?.authKey,
      ...ttsMarkupFlags(request),
    });
  } else if (provider === 'azure') {
    result = await synthesizeSpeechAzure(script, request.fileName, {
      artist: request.artist,
      title: request.title,
      speed: request.speed,
      pauseProfile: request.pauseProfile,
      styleId: request.ttsStyle,
      storyNarrator: request.storyNarrator,
      ...ttsMarkupFlags(request),
    });
  } else if (provider === 'elevenlabs') {
    const elevenVoiceId = resolveElevenLabsVoiceId(
      (request.elevenLabsVoice ?? request.voiceId ?? 'auto') as import('./elevenlabs-voices.js').ElevenLabsVoiceSetting,
      { storyNarrator: request.storyNarrator, genre: undefined },
    );
    result = await synthesizeSpeechElevenLabs(script, request.fileName, {
      artist: request.artist,
      title: request.title,
      voiceId: elevenVoiceId,
      speakTrackNamesInVoiceover: request.speakTrackNamesInVoiceover,
      storyLanguage: request.storyLanguage,
    });
  } else {
    result = await synthesizeYandex(script, request.voiceId, request.fileName, {
      speed: request.speed,
      emotion: request.emotion,
      artist: request.artist,
      title: request.title,
      pauseProfile: request.pauseProfile,
      logContext: request.logContext,
      credentials: request.userTtsCredentials?.yandex,
      audioFormat: yandexAudioFormat,
      ...ttsMarkupFlags(request),
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
};
