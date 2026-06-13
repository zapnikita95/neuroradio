/**
 * English narration for ElevenLabs: base language en, DE/FR spans for foreign artist/track names.
 * ElevenLabs is used only when storyLanguage === 'en' — no Russian segments.
 */
import { applyEnglishArtistPronunciation } from './artist-pronunciation.js';
import { stripYandexMarkup } from './tts-azure-ssml.js';
import { sanitizeScriptForTts } from './story-quality.js';
import { runTtsQualityPass } from './tts-quality-pass.js';
import { germanData } from './de-lang-detect.js';
import { frenchData } from './fr-lang-detect.js';
import { edgeForeignLang, isKnownFrenchPhrase, isKnownGermanPhrase } from './tts-foreign-lang.js';

export type ElevenLabsSegment = { lang: 'en' | 'de' | 'fr'; text: string };

/** Optional Latin respelling when language_code alone misreads a name. */
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

function prepareForeignSegment(text: string, lang: 'de' | 'fr'): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const key = normalizeKey(trimmed);
  if (lang === 'de') return DE_LATIN_HINT[key] ?? trimmed;
  return FR_LATIN_HINT[key] ?? trimmed;
}

export function prepareEnglishSpeechText(
  script: string,
  artist: string,
  title: string,
  speakTrackNamesInVoiceover: boolean,
): string {
  const markupArtist = speakTrackNamesInVoiceover ? artist : '';
  const markupTitle = speakTrackNamesInVoiceover ? title : '';
  let text = sanitizeScriptForTts(script, markupArtist, markupTitle, [], { storyLanguage: 'en' });
  text = runTtsQualityPass(text).text;
  return stripYandexMarkup(text);
}

function prepareEnglishSegment(text: string, artist: string, title: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return applyEnglishArtistPronunciation(trimmed, artist, title);
}

type ForeignPhrase = { phrase: string; lang: 'de' | 'fr' };

function isWordChar(ch: string): boolean {
  return /[\p{L}\p{N}']/u.test(ch);
}

/** Match phrase only on whole-word boundaries — avoids "she" inside "wishes". */
function phraseAtPosition(text: string, pos: number, phrase: string): boolean {
  if (text.slice(pos, pos + phrase.length).toLowerCase() !== phrase.toLowerCase()) return false;
  const before = pos > 0 ? text[pos - 1]! : '';
  const after = pos + phrase.length < text.length ? text[pos + phrase.length]! : '';
  if (before && isWordChar(before)) return false;
  if (after && isWordChar(after)) return false;
  return true;
}

function textContainsWholePhrase(text: string, phrase: string): boolean {
  const lower = text.toLowerCase();
  const needle = phrase.toLowerCase();
  let from = 0;
  while (from < lower.length) {
    const idx = lower.indexOf(needle, from);
    if (idx === -1) return false;
    if (phraseAtPosition(text, idx, phrase)) return true;
    from = idx + 1;
  }
  return false;
}

function buildForeignPhrasesInText(text: string, artist: string, title: string): ForeignPhrase[] {
  const items: ForeignPhrase[] = [];
  const add = (phrase: string, lang: 'de' | 'fr') => {
    const p = phrase.trim();
    if (p.length < 2 || !textContainsWholePhrase(text, p)) return;
    items.push({ phrase: p, lang });
  };

  const artistLang = edgeForeignLang(artist, artist, title);
  const titleLang = edgeForeignLang(title, artist, title);

  if (artistLang === 'de' || artistLang === 'fr') add(artist, artistLang);
  if (titleLang === 'de' || titleLang === 'fr') add(title, titleLang);
  if (artist && title) {
    const combinedLang =
      artistLang === 'de' || artistLang === 'fr'
        ? artistLang
        : titleLang === 'de' || titleLang === 'fr'
          ? titleLang
          : null;
    if (combinedLang) add(`${title} by ${artist}`, combinedLang);
  }

  for (const key of Object.keys(germanData.phrases)) {
    if (key.length >= 3) add(key, 'de');
  }
  for (const key of germanData.artistKeys) {
    add(key, 'de');
  }
  for (const key of Object.keys(frenchData.phrases)) {
    if (key.length >= 3) add(key, 'fr');
  }
  for (const key of frenchData.artistKeys) {
    add(key, 'fr');
  }

  const seen = new Set<string>();
  return items
    .sort((a, b) => b.phrase.length - a.phrase.length)
    .filter(({ phrase }) => {
      const k = phrase.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function findNextForeignIndex(text: string, from: number, phrases: ForeignPhrase[]): number | null {
  let best: number | null = null;
  for (const { phrase } of phrases) {
    const lower = text.toLowerCase();
    const needle = phrase.toLowerCase();
    let searchFrom = from;
    while (searchFrom < text.length) {
      const idx = lower.indexOf(needle, searchFrom);
      if (idx === -1) break;
      if (phraseAtPosition(text, idx, phrase)) {
        if (best === null || idx < best) best = idx;
        break;
      }
      searchFrom = idx + 1;
    }
  }
  return best;
}

function pushSegment(segments: ElevenLabsSegment[], lang: ElevenLabsSegment['lang'], chunk: string): void {
  const t = chunk.trim();
  if (!t) return;
  const last = segments[segments.length - 1];
  if (last?.lang === lang) {
    last.text = `${last.text} ${t}`.replace(/\s+/g, ' ').trim();
  } else {
    segments.push({ lang, text: t });
  }
}

/** Split English script into en + de/fr chunks for language_code per ElevenLabs request. */
export function splitEnglishNarrationForForeignNames(
  script: string,
  artist: string,
  title: string,
  speakTrackNamesInVoiceover = true,
): ElevenLabsSegment[] {
  const plain = prepareEnglishSpeechText(script, artist, title, speakTrackNamesInVoiceover);
  const phrases = buildForeignPhrasesInText(plain, artist, title);

  if (phrases.length === 0) {
    return [{ lang: 'en', text: prepareEnglishSegment(plain, artist, title) }];
  }

  const segments: ElevenLabsSegment[] = [];
  let cursor = 0;

  while (cursor < plain.length) {
    let matched: ForeignPhrase | null = null;
    for (const item of phrases) {
      if (phraseAtPosition(plain, cursor, item.phrase)) {
        matched = item;
        break;
      }
    }

    if (matched) {
      pushSegment(segments, matched.lang, prepareForeignSegment(plain.slice(cursor, cursor + matched.phrase.length), matched.lang));
      cursor += matched.phrase.length;
      continue;
    }

    const nextForeign = findNextForeignIndex(plain, cursor + 1, phrases);
    const end = nextForeign ?? plain.length;
    pushSegment(segments, 'en', prepareEnglishSegment(plain.slice(cursor, end), artist, title));
    cursor = end;
  }

  return segments.filter((s) => s.text.length > 0);
}

export function shouldUseElevenLabsForeignSegments(
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
  const plain = prepareEnglishSpeechText(script, artist, title, true);
  return buildForeignPhrasesInText(plain, artist, title).length > 0;
}

export function elevenLabsLanguageCode(lang: ElevenLabsSegment['lang']): string {
  return lang;
}

export function resolveElevenLabsModelForMixed(useForeignSegments: boolean, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  if (useForeignSegments) {
    return process.env.ELEVENLABS_MULTILINGUAL_MODEL_ID?.trim() || 'eleven_multilingual_v2';
  }
  return process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_flash_v2_5';
}
