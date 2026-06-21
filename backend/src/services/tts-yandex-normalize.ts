/** Last-mile token fixes before Yandex SSML (no network). */

import { mergeLatinCollaborationPhrases } from './tts-grammar-fixes.js';
import { normalizeGenreTermsForTts } from './tts-genre-pronounce.js';
import { applyTitleNumeralsInText, titleNumeralsForTts } from './tts-title-numerals.js';

const CURLY_APOSTROPHE = /[\u2018\u2019\u02BC\u0060]/g;

export function normalizeLatinApostrophes(text: string): string {
  return text.replace(CURLY_APOSTROPHE, "'");
}

const LATIN_APOSTROPHE_CLASS = "''\u2018\u2019\u02BC\u0060";

/** It's → Its for TTS (display text unchanged; call only on speech pipeline). */
export function stripLatinApostrophesForTts(span: string): string {
  return span.replace(new RegExp(`[${LATIN_APOSTROPHE_CLASS}]`, 'g'), '');
}

const LATIN_RUN_FOR_APOSTROPHE_RE = new RegExp(
  `[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9${LATIN_APOSTROPHE_CLASS}.\\-&]{0,}(?:\\s+(?![.!?…]\\s)[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9${LATIN_APOSTROPHE_CLASS}.\\-&]{0,})*`,
  'g',
);

export function stripApostrophesInLatinRuns(text: string): string {
  return text.replace(LATIN_RUN_FOR_APOSTROPHE_RE, (span) => stripLatinApostrophesForTts(span));
}

const MIXED_TTS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bR\s*&\s*B\b/gi, 'ар эн би'],
  [/\brap[\s-]singing\b/gi, 'рэп-сингинг'],
  [/\bрэп[\s-]singing\b/gi, 'рэп-сингинг'],
  [/\b(контракт(?:ом)?|сделк(?:а|у|ой|е)|подпис\w*)\s+с\s+(?=[A-Z])/gi, '$1 с лейблом '],
  [/(?<=[.!?…]\s+)В\s+(?=[A-Z])/g, 'В треке '],
  [/(?<=[.!?…]\s+)в\s+(?=[A-Z])/g, 'в треке '],
  [
    /\s+с\s+(?=(?:Bandcamp|Spotify|SoundCloud|YouTube|Apple Music|iTunes|Deezer|Tidal|Shazam)\b)/gi,
    ' на ',
  ],
  [/\s+со\s+(?=(?:Spotify|SoundCloud|YouTube)\b)/gi, ' на '],
];

/** B-side / A-side — «сторона бэ/эй» с падежами (без \\b — кириллица не \\w в JS). */
function normalizeVinylSideLabels(text: string): string {
  let result = text;

  result = result.replace(/(^|[\s(«"])как\s+B-(?:\s*side)?(?=\s|,|\.|;|$)/gi, '$1как сторону бэ');
  result = result.replace(/(^|[\s(«"])на\s+B-(?:\s*side)?(?=\s|,|\.|;|$)/gi, '$1на стороне бэ');
  result = result.replace(/(^|[\s(«"])для\s+B-(?:\s*side)?(?=\s|,|\.|;|$)/gi, '$1для стороны бэ');
  result = result.replace(/(^|[\s(«"])со\s+B-(?:\s*side)?(?=\s|,|\.|;|$)/gi, '$1со стороной бэ');
  result = result.replace(/(^|[\s(«"])с\s+B-(?:\s*side)?(?=\s|,|\.|;|$)/gi, '$1с стороной бэ');
  result = result.replace(/(^|[\s(«"])в\s+B-(?:\s*side)?(?=\s|,|\.|;|$)/gi, '$1в стороне бэ');
  result = result.replace(/(^|[\s(«"])из\s+B-(?:\s*side)?(?=\s|,|\.|;|$)/gi, '$1из стороны бэ');
  result = result.replace(/(^|[\s(«"])от\s+B-(?:\s*side)?(?=\s|,|\.|;|$)/gi, '$1от стороны бэ');
  result = result.replace(/\bB-side\b/gi, 'сторона бэ');
  result = result.replace(/\bside\s+B\b/gi, 'сторона бэ');
  result = result.replace(/\bB\s+side\b/gi, 'сторона бэ');
  result = result.replace(/\bB-(?=\s|,|\.|;|$)/g, 'сторона бэ');

  result = result.replace(/(^|[\s(«"])как\s+A-(?:\s*side)?(?=\s|,|\.|;|$)/gi, '$1как сторону эй');
  result = result.replace(/(^|[\s(«"])на\s+A-(?:\s*side)?(?=\s|,|\.|;|$)/gi, '$1на стороне эй');
  result = result.replace(/(^|[\s(«"])для\s+A-(?:\s*side)?(?=\s|,|\.|;|$)/gi, '$1для стороны эй');
  result = result.replace(/\bA-side\b/gi, 'сторона эй');
  result = result.replace(/\bA-(?=\s|,|\.|;|$)/g, 'сторона эй');

  return result;
}

/** Latin tech acronyms in Russian narration → Cyrillic phonetic (TTS only; UI script unchanged). */
function normalizeTechAcronymsForRussianTts(text: string): string {
  return text
    .replace(/\bMTV\b/gi, 'МТВ')
    .replace(/\bMP3-(?=[а-яёА-ЯЁ])/gi, 'эмп+э три-')
    .replace(/\bMP3\s+(?=[а-яёА-ЯЁ])/gi, 'эмп+э три ')
    .replace(/\bMP3\b/gi, 'эмп+э три');
}

/** English loanwords in Russian narration → Cyrillic phonetic (TTS only). */
function normalizeLoanwordsForRussianTts(text: string): string {
  return text
    .replace(/\bfiller\b/gi, 'ф+иллер')
    .replace(/\blo[\u2010\u2011\u2012\u2013\u2014-]fi\b/gi, 'л+оу ф+ай')
    .replace(/\blofi\b/gi, 'л+оу ф+ай');
}

/** Mixed RU/EN tokens that Yandex misreads inside `<lang en-US>` or after apostrophe splits. */
export function normalizeYandexSpeechTokens(text: string, artist = '', title = ''): string {
  let result = normalizeLatinApostrophes(text);

  const titleNorm = normalizeLatinApostrophes(title.trim());
  if (titleNorm) {
    const titleCurly = title.trim().replace(/'/g, '\u2019');
    if (titleCurly !== titleNorm && result.includes(titleCurly)) {
      result = result.replaceAll(titleCurly, titleNorm);
    }
  }

  const artistNorm = normalizeLatinApostrophes(artist.trim());
  if (artistNorm && artistNorm !== artist.trim()) {
    result = result.replaceAll(artist.trim(), artistNorm);
  }

  for (const [pattern, replacement] of MIXED_TTS_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  result = normalizeVinylSideLabels(result);

  result = mergeKnownTitleOtArtist(result, artist, title);

  result = mergeLatinCollaborationPhrases(result);

  result = normalizeGenreTermsForTts(result);

  result = normalizeTechAcronymsForRussianTts(result);

  result = normalizeLoanwordsForRussianTts(result);

  if (titleNorm) {
    const spoken = titleNumeralsForTts(titleNorm, artistNorm);
    if (spoken && spoken.toLowerCase() !== titleNorm.toLowerCase()) {
      result = result.replace(new RegExp(escapeRegExp(titleNorm), 'gi'), spoken);
    }
  }
  result = applyTitleNumeralsInText(result, artist, title);

  return result;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Metadata-aware: «Killing in The Name от Rage…» → «Killing in The Name by Rage…». */
function mergeKnownTitleOtArtist(text: string, artist: string, title: string): string {
  const a = normalizeLatinApostrophes(artist.trim());
  const t = normalizeLatinApostrophes(title.trim());
  if (!a || !t || !/[A-Za-zÀ-ÿ]{2,}/.test(a) || !/[A-Za-zÀ-ÿ]{2,}/.test(t)) return text;
  const re = new RegExp(`${escapeRegExp(t)}\\s*,?\\s*от\\s+${escapeRegExp(a)}`, 'gi');
  return text.replace(re, `${t} by ${a}`);
}
