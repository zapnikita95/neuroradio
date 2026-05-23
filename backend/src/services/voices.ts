/** Yandex SpeechKit voice identifiers used by the app */
export type YandexVoiceId = 'marina' | 'filipp' | 'jane' | 'alena' | 'omazh';

const VOICE_BY_DECADE: { maxYear: number; voice: YandexVoiceId }[] = [
  { maxYear: 1979, voice: 'filipp' },
  { maxYear: 1989, voice: 'omazh' },
  { maxYear: 1999, voice: 'jane' },
  { maxYear: 2009, voice: 'alena' },
  { maxYear: 2019, voice: 'marina' },
  { maxYear: Infinity, voice: 'marina' },
];

/**
 * Maps release year to a Yandex TTS voice for era-appropriate narration.
 * Falls back to marina when year is unknown.
 */
export function voiceForYear(year?: number): YandexVoiceId {
  if (!year || year < 1950) {
    return 'marina';
  }

  for (const entry of VOICE_BY_DECADE) {
    if (year <= entry.maxYear) {
      return entry.voice;
    }
  }

  return 'marina';
}

export const ALL_VOICES: YandexVoiceId[] = [
  'marina',
  'filipp',
  'jane',
  'alena',
  'omazh',
];
