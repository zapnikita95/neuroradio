/** Yandex SpeechKit TTS request options — https://yandex.cloud/docs/speechkit/tts/request */
export type TtsEmotion = 'neutral' | 'good' | 'evil';

export interface TtsOptions {
  speed: number;
  emotion: TtsEmotion;
}

export const TTS_SPEED_MIN = 0.1;
export const TTS_SPEED_MAX = 3.0;
export const DEFAULT_TTS_SPEED = 1.0;
export const DEFAULT_TTS_EMOTION: TtsEmotion = 'good';

export const TTS_EMOTION_PRESETS: Array<{
  id: TtsEmotion;
  labelRu: string;
  descriptionRu: string;
}> = [
  { id: 'neutral', labelRu: 'Нейтральная', descriptionRu: 'Ровная, спокойная подача' },
  { id: 'good', labelRu: 'Живая', descriptionRu: 'Дружелюбная, тёплая интонация (good)' },
  { id: 'evil', labelRu: 'Строгая', descriptionRu: 'Жёсткая, драматичная (evil) — для строгих голосов' },
];

export const TTS_SPEED_PRESETS: Array<{
  id: string;
  labelRu: string;
  speed: number;
}> = [
  { id: 'very_slow', labelRu: 'Очень медленно', speed: 0.88 },
  { id: 'slow', labelRu: 'Медленно', speed: 1.0 },
  { id: 'normal', labelRu: 'Нормально', speed: 1.15 },
  { id: 'fast', labelRu: 'Быстро', speed: 1.32 },
  { id: 'very_fast', labelRu: 'Очень быстро', speed: 1.48 },
];

export function resolveTtsSpeed(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_TTS_SPEED;
  }
  return Math.min(TTS_SPEED_MAX, Math.max(TTS_SPEED_MIN, Math.round(value * 100) / 100));
}

export function resolveTtsEmotion(value: unknown): TtsEmotion {
  if (value === 'neutral' || value === 'good' || value === 'evil') {
    return value;
  }
  return DEFAULT_TTS_EMOTION;
}

export function listEmotionOptions() {
  return TTS_EMOTION_PRESETS;
}

export function listSpeedPresets() {
  return TTS_SPEED_PRESETS;
}
