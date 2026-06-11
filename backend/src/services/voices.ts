/** Yandex SpeechKit voice identifiers — https://yandex.cloud/docs/speechkit/tts/voices */
export type YandexVoiceId =
  | 'zahar'
  | 'ermil'
  | 'filipp'
  | 'marina'
  | 'jane'
  | 'alena'
  | 'omazh'
  | 'dasha'
  | 'julia'
  | 'kirill'
  | 'masha'
  | 'alexander'
  | 'lera';

export type TtsVoiceSetting = 'auto' | YandexVoiceId;

export interface YandexVoicePreset {
  id: YandexVoiceId;
  labelRu: string;
  genderRu: 'мужской' | 'женский';
  toneRu: string;
  supportsEvil: boolean;
}

export const YANDEX_VOICE_PRESETS: YandexVoicePreset[] = [
  { id: 'alena', labelRu: 'Алёна', genderRu: 'женский', toneRu: 'мягкий, дружелюбный', supportsEvil: false },
  { id: 'filipp', labelRu: 'Филипп', genderRu: 'мужской', toneRu: 'ровный, приятный', supportsEvil: false },
  { id: 'ermil', labelRu: 'Ермил', genderRu: 'мужской', toneRu: 'нейтральный, спокойный', supportsEvil: false },
  { id: 'jane', labelRu: 'Джейн', genderRu: 'женский', toneRu: 'строгий, чёткий', supportsEvil: true },
  { id: 'omazh', labelRu: 'Омаж', genderRu: 'женский', toneRu: 'строгий, драматичный', supportsEvil: true },
  { id: 'zahar', labelRu: 'Захар', genderRu: 'мужской', toneRu: 'строгий, уверенный', supportsEvil: true },
  { id: 'marina', labelRu: 'Марина', genderRu: 'женский', toneRu: 'тёплый, мягкий', supportsEvil: false },
  { id: 'dasha', labelRu: 'Даша', genderRu: 'женский', toneRu: 'живой, современный', supportsEvil: false },
  { id: 'julia', labelRu: 'Юлия', genderRu: 'женский', toneRu: 'строгий, собранный', supportsEvil: true },
  { id: 'kirill', labelRu: 'Кирилл', genderRu: 'мужской', toneRu: 'строгий, деловой', supportsEvil: true },
  { id: 'masha', labelRu: 'Маша', genderRu: 'женский', toneRu: 'дружелюбный, лёгкий', supportsEvil: false },
  { id: 'alexander', labelRu: 'Александр', genderRu: 'мужской', toneRu: 'нейтральный, универсальный', supportsEvil: false },
  { id: 'lera', labelRu: 'Лера', genderRu: 'женский', toneRu: 'молодой, живой', supportsEvil: false },
];

export const ALL_VOICES: YandexVoiceId[] = YANDEX_VOICE_PRESETS.map((v) => v.id);

/** Voices supported by SpeechKit REST `tts:synthesize` v1 (folder API key). */
const SPEECHKIT_V1_VOICES = new Set<YandexVoiceId>([
  'alena',
  'filipp',
  'ermil',
  'jane',
  'omazh',
  'zahar',
  'marina',
]);

/** Newer catalog IDs — map to closest v1 voice so TTS does not 400. */
const V1_VOICE_FALLBACK: Partial<Record<YandexVoiceId, YandexVoiceId>> = {
  kirill: 'zahar',
  dasha: 'alena',
  julia: 'jane',
  masha: 'marina',
  alexander: 'filipp',
  lera: 'alena',
};

export function coerceVoiceForSpeechKit(voiceId: YandexVoiceId): YandexVoiceId {
  if (SPEECHKIT_V1_VOICES.has(voiceId)) return voiceId;
  return V1_VOICE_FALLBACK[voiceId] ?? 'zahar';
}

const VOICE_BY_DECADE: { maxYear: number; voice: YandexVoiceId }[] = [
  { maxYear: 1969, voice: 'zahar' },
  { maxYear: 1979, voice: 'ermil' },
  { maxYear: 1989, voice: 'filipp' },
  { maxYear: 1999, voice: 'omazh' },
  { maxYear: 2009, voice: 'jane' },
  { maxYear: 2019, voice: 'alena' },
  { maxYear: Infinity, voice: 'marina' },
];

const VALID_VOICE_SETTINGS = new Set<string>(['auto', ...ALL_VOICES]);

export function resolveTtsVoice(value: unknown): TtsVoiceSetting {
  if (typeof value === 'string' && VALID_VOICE_SETTINGS.has(value)) {
    return value as TtsVoiceSetting;
  }
  return 'zahar';
}

export function resolveVoiceForStory(
  ttsVoice: TtsVoiceSetting,
  year?: number,
  genre?: string,
): YandexVoiceId {
  if (ttsVoice !== 'auto') return ttsVoice;
  return voiceForYear(year, genre);
}

/** Soul/funk — тёплый мужской голос */
export function voiceForYear(year?: number, genre?: string): YandexVoiceId {
  const g = (genre ?? '').toLowerCase();
  if (g.includes('soul') || g.includes('funk') || g.includes('r&b')) {
    return 'zahar';
  }

  if (!year || year < 1950) {
    return 'zahar';
  }

  for (const entry of VOICE_BY_DECADE) {
    if (year <= entry.maxYear) {
      return entry.voice;
    }
  }

  return 'marina';
}

export function getVoicePreset(voiceId: YandexVoiceId): YandexVoicePreset | undefined {
  return YANDEX_VOICE_PRESETS.find((v) => v.id === voiceId);
}

/** Prompt hint so first-person narrators match TTS voice gender. */
export function voiceStoryPromptHint(voiceId: string): string {
  const preset = getVoicePreset(voiceId as YandexVoiceId);
  if (!preset) return '';
  if (preset.genderRu === 'женский') {
    return `ОЗВУЧКА: женский голос (${preset.labelRu}). От первого лица — женский род: «я помню», «я слышала», «я обожаю», «услышала»; не «я слышал».`;
  }
  return `ОЗВУЧКА: мужской голос (${preset.labelRu}). От первого лица — мужской род: «я помню», «я слышал», «я обожаю».`;
}

/** SpeechKit v1: emotion only for ru-RU voices jane and omazh. */
const EMOTION_VOICES = new Set<YandexVoiceId>(['jane', 'omazh']);

export function voiceSupportsEmotion(voiceId: YandexVoiceId): boolean {
  return EMOTION_VOICES.has(voiceId);
}

export function voiceSupportsEvilEmotion(voiceId: YandexVoiceId): boolean {
  return getVoicePreset(voiceId)?.supportsEvil ?? false;
}

export function listVoiceOptions(): Array<{
  id: TtsVoiceSetting;
  labelRu: string;
  descriptionRu: string;
}> {
  return [
    {
      id: 'auto',
      labelRu: 'Авто',
      descriptionRu: 'Голос подбирается по эпохе и жанру трека',
    },
    ...YANDEX_VOICE_PRESETS.map((v) => ({
      id: v.id,
      labelRu: v.labelRu,
      descriptionRu: `${v.genderRu}, ${v.toneRu}`,
    })),
  ];
}
