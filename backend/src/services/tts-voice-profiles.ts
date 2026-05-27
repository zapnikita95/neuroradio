import type { StoryNarratorId } from './story-narrator.js';
import type { TtsEmotion } from './tts-options.js';
import { DEFAULT_TTS_EMOTION, DEFAULT_TTS_SPEED } from './tts-options.js';
import type { YandexVoiceId } from './voices.js';
import { resolveVoiceForStory, type TtsVoiceSetting } from './voices.js';

export type TtsVoiceStyleId = 'auto' | 'radio_host' | 'warm_story' | 'night_soft';
export type TtsPauseProfile = 'tight' | 'natural' | 'airy';

export interface ResolvedVoiceDelivery {
  voiceId: YandexVoiceId;
  speed: number;
  emotion: TtsEmotion;
  pauseProfile: TtsPauseProfile;
  styleId: TtsVoiceStyleId;
}

interface VoiceStylePreset {
  speed: number;
  emotion: TtsEmotion;
  pauseProfile: TtsPauseProfile;
  voiceHint?: YandexVoiceId;
}

const STYLE_PRESETS: Record<Exclude<TtsVoiceStyleId, 'auto'>, VoiceStylePreset> = {
  radio_host: { speed: 0.94, emotion: 'good', pauseProfile: 'natural', voiceHint: 'filipp' },
  warm_story: { speed: 0.9, emotion: 'good', pauseProfile: 'airy', voiceHint: 'marina' },
  night_soft: { speed: 0.86, emotion: 'neutral', pauseProfile: 'airy', voiceHint: 'ermil' },
};

const NARRATOR_STYLE_MAP: Partial<Record<StoryNarratorId, TtsVoiceStyleId>> = {
  radio_host: 'radio_host',
  expert: 'radio_host',
  fan: 'warm_story',
  contemporary: 'warm_story',
  backstage: 'radio_host',
  night_dj: 'night_soft',
};

const VALID_STYLES = new Set<string>(['auto', 'radio_host', 'warm_story', 'night_soft']);

export function resolveTtsVoiceStyle(value: unknown): TtsVoiceStyleId {
  if (typeof value === 'string' && VALID_STYLES.has(value)) {
    return value as TtsVoiceStyleId;
  }
  return 'auto';
}

function styleFromNarrator(narratorId: StoryNarratorId): TtsVoiceStyleId {
  if (narratorId === 'auto') return 'auto';
  return NARRATOR_STYLE_MAP[narratorId] ?? 'warm_story';
}

export function resolveVoiceDelivery(
  options: {
    ttsVoice: TtsVoiceSetting;
    ttsStyle: TtsVoiceStyleId;
    storyNarrator: StoryNarratorId;
    year?: number;
    genre?: string;
    clientSpeed?: number;
    clientEmotion?: TtsEmotion;
    clientVoiceLocked: boolean;
  },
): ResolvedVoiceDelivery {
  const baseVoice = resolveVoiceForStory(options.ttsVoice, options.year, options.genre);
  const effectiveStyle =
    options.ttsStyle === 'auto' ? styleFromNarrator(options.storyNarrator) : options.ttsStyle;

  if (effectiveStyle === 'auto' || options.clientVoiceLocked) {
    return {
      voiceId: baseVoice,
      speed: options.clientSpeed ?? DEFAULT_TTS_SPEED,
      emotion: options.clientEmotion ?? DEFAULT_TTS_EMOTION,
      pauseProfile: 'natural',
      styleId: 'auto',
    };
  }

  const preset = STYLE_PRESETS[effectiveStyle];
  const voiceId =
    options.ttsVoice === 'auto' && preset.voiceHint ? preset.voiceHint : baseVoice;

  return {
    voiceId,
    speed: options.clientSpeed ?? preset.speed,
    emotion: options.clientEmotion ?? preset.emotion,
    pauseProfile: preset.pauseProfile,
    styleId: effectiveStyle,
  };
}

export function listVoiceStyleOptions(): Array<{
  id: TtsVoiceStyleId;
  labelRu: string;
  descriptionRu: string;
}> {
  return [
    { id: 'auto', labelRu: 'Авто', descriptionRu: 'Стиль подачи подбирается по рассказчику' },
    { id: 'radio_host', labelRu: 'Радиоведущий', descriptionRu: 'Энергично, чётко, с живыми паузами' },
    { id: 'warm_story', labelRu: 'Тёплая история', descriptionRu: 'Мягко и дружелюбно' },
    { id: 'night_soft', labelRu: 'Ночной эфир', descriptionRu: 'Спокойно, с воздухом между фразами' },
  ];
}
