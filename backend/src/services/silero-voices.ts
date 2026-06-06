export type SileroVoiceId = 'aidar' | 'baya' | 'kseniya' | 'xenia' | 'eugene';

/** Silero has no Yandex-style emotion API — mood ≈ choice of voice. */
export type SileroVoicePresetId = 'calm_female' | 'calm_male' | 'lively_female' | 'lively_male';

export interface SileroVoicePreset {
  id: SileroVoicePresetId;
  voice: SileroVoiceId;
  labelRu: string;
  moodRu: string;
  /** Rough Yandex analogue for A/B listening. */
  yandexAnalogue: string;
}

export const SILERO_VOICE_PRESETS: SileroVoicePreset[] = [
  {
    id: 'calm_female',
    voice: 'baya',
    labelRu: 'baya — спокойный женский',
    moodRu: 'Размеренный, без «робота» — ближе к нейтральной Yandex',
    yandexAnalogue: 'alena / neutral',
  },
  {
    id: 'calm_male',
    voice: 'aidar',
    labelRu: 'aidar — спокойный мужской',
    moodRu: 'Ровный дикторский тон',
    yandexAnalogue: 'filipp / neutral',
  },
  {
    id: 'lively_female',
    voice: 'kseniya',
    labelRu: 'kseniya — живой женский',
    moodRu: 'Энергичнее, ближе к emotion=good',
    yandexAnalogue: 'jane / good',
  },
  {
    id: 'lively_male',
    voice: 'eugene',
    labelRu: 'eugene — бодрый мужской',
    moodRu: 'Бодрее, для «радио»-подачи',
    yandexAnalogue: 'zahar / good',
  },
];

export function resolveSileroVoicePreset(id: string | undefined): SileroVoicePreset {
  return SILERO_VOICE_PRESETS.find((p) => p.id === id) ?? SILERO_VOICE_PRESETS[0]!;
}

export function resolveSileroVoiceFromEnv(): SileroVoiceId {
  const raw = process.env.SILERO_TTS_VOICE?.trim().toLowerCase();
  const allowed: SileroVoiceId[] = ['aidar', 'baya', 'kseniya', 'xenia', 'eugene'];
  if (raw && allowed.includes(raw as SileroVoiceId)) {
    return raw as SileroVoiceId;
  }
  const preset = process.env.SILERO_TTS_PRESET?.trim();
  if (preset) {
    return resolveSileroVoicePreset(preset).voice;
  }
  return 'baya';
}
