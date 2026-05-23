/** Yandex SpeechKit voice identifiers used by the app */
export type YandexVoiceId =
  | 'zahar'
  | 'ermil'
  | 'filipp'
  | 'marina'
  | 'jane'
  | 'alena'
  | 'omazh';

const VOICE_BY_DECADE: { maxYear: number; voice: YandexVoiceId }[] = [
  { maxYear: 1969, voice: 'zahar' },
  { maxYear: 1979, voice: 'ermil' },
  { maxYear: 1989, voice: 'filipp' },
  { maxYear: 1999, voice: 'omazh' },
  { maxYear: 2009, voice: 'jane' },
  { maxYear: 2019, voice: 'alena' },
  { maxYear: Infinity, voice: 'marina' },
];

/** Soul/funk — тёплый мужской голос */
const SOUL_VOICES: YandexVoiceId[] = ['zahar', 'ermil', 'filipp'];

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

export const ALL_VOICES: YandexVoiceId[] = [
  'zahar',
  'ermil',
  'filipp',
  'marina',
  'jane',
  'alena',
  'omazh',
];

export function voiceSupportsEmotion(voiceId: YandexVoiceId): boolean {
  return ALL_VOICES.includes(voiceId);
}
