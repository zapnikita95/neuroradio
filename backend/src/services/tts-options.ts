export type TtsEmotion = 'neutral' | 'good';

export interface TtsOptions {
  speed: number;
  emotion: TtsEmotion;
}

export const TTS_SPEED_MIN = 0.75;
export const TTS_SPEED_MAX = 1.15;
export const DEFAULT_TTS_SPEED = 0.92;
export const DEFAULT_TTS_EMOTION: TtsEmotion = 'good';

export function resolveTtsSpeed(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_TTS_SPEED;
  }
  return Math.min(TTS_SPEED_MAX, Math.max(TTS_SPEED_MIN, Math.round(value * 100) / 100));
}

export function resolveTtsEmotion(value: unknown): TtsEmotion {
  return value === 'neutral' ? 'neutral' : DEFAULT_TTS_EMOTION;
}
