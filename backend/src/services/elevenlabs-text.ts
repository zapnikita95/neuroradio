/**
 * Prepare mixed RU + EN/DE/FR text for ElevenLabs (language_code per segment).
 */
import { applyEnglishArtistPronunciation } from './artist-pronunciation.js';
import { prepareYandexTtsText } from './tts-markup.js';
import { stripYandexMarkup } from './tts-azure-ssml.js';
import { mergeLatinTitleOtArtist } from './tts-yandex-ssml.js';
import { normalizeEdgeRussianOrthography } from './tts-edge-normalize.js';
import {
  hasForeignSegmentsForEdge,
  splitMixedLanguageForEdge,
  type MixedLangSegment,
} from './tts-mixed-segments.js';
import { edgeForeignLang, isKnownFrenchPhrase, isKnownGermanPhrase } from './tts-foreign-lang.js';

/** Optional Latin respelling hints when ElevenLabs misreads a name even with language_code. */
const DE_LATIN_HINT: Record<string, string> = {
  rammstein: 'Ramm-shtine',
  'du hast': 'Doo hahst',
};

const FR_LATIN_HINT: Record<string, string> = {
  stromae: 'Stro-may',
  papaoutai: 'Papa-oo-tie',
  zaz: 'Zahz',
};

function normalizeKey(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?!.,…]+$/g, '');
}

function prepareRussianSegment(text: string): string {
  return normalizeEdgeRussianOrthography(stripYandexMarkup(text.replace(/\+/g, '')));
}

function prepareLatinSegment(text: string, lang: 'en' | 'de' | 'fr'): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (lang === 'en') return applyEnglishArtistPronunciation(trimmed);
  const key = normalizeKey(trimmed);
  if (lang === 'de') return DE_LATIN_HINT[key] ?? trimmed;
  return FR_LATIN_HINT[key] ?? trimmed;
}

export function prepareElevenLabsMixedSegments(
  script: string,
  artist: string,
  title: string,
): MixedLangSegment[] {
  const marked = prepareYandexTtsText(script, {
    artist,
    title,
    sentencePauses: false,
    speakTrackNamesInVoiceover: true,
  });
  const merged = mergeLatinTitleOtArtist(
    marked.replace(/<\[[^\]]+\]>/g, ' ').replace(/\s+/g, ' ').trim(),
  );

  return splitMixedLanguageForEdge(merged, artist, title).map((seg) => {
    if (seg.lang === 'ru') {
      return { ...seg, text: prepareRussianSegment(seg.text) };
    }
    return { ...seg, text: prepareLatinSegment(seg.text, seg.lang) };
  });
}

export function shouldUseElevenLabsMixedSegments(
  script: string,
  artist: string,
  title: string,
  speakTrackNamesInVoiceover: boolean,
): boolean {
  if (!speakTrackNamesInVoiceover) return false;
  if (
    (artist && (isKnownGermanPhrase(artist) || isKnownFrenchPhrase(artist))) ||
    (title && (isKnownGermanPhrase(title) || isKnownFrenchPhrase(title)))
  ) {
    return true;
  }
  if (
    (artist && edgeForeignLang(artist, artist, title) !== 'en') ||
    (title && edgeForeignLang(title, artist, title) !== 'en')
  ) {
    return true;
  }
  const marked = prepareYandexTtsText(script, {
    artist,
    title,
    sentencePauses: false,
    speakTrackNamesInVoiceover: true,
  });
  const merged = mergeLatinTitleOtArtist(
    marked.replace(/<\[[^\]]+\]>/g, ' ').replace(/\s+/g, ' ').trim(),
  );
  return hasForeignSegmentsForEdge(merged, artist, title);
}

export function elevenLabsLanguageCode(lang: MixedLangSegment['lang']): string {
  switch (lang) {
    case 'de':
      return 'de';
    case 'fr':
      return 'fr';
    case 'en':
      return 'en';
    default:
      return 'ru';
  }
}

export function resolveElevenLabsModelForMixed(useMixed: boolean, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  if (useMixed) {
    return process.env.ELEVENLABS_MULTILINGUAL_MODEL_ID?.trim() || 'eleven_multilingual_v2';
  }
  return process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_flash_v2_5';
}
