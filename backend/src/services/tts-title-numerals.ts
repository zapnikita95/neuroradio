/**
 * Spell out numerals in Latin track titles for Yandex `<lang en-US>` TTS.
 * Display script / metadata keep original spelling (e.g. «The 2nd Law», «24K Magic»).
 */

import { normalizeEnglishOrdinalsInLatin } from './tts-en-normalize.js';

const SMALL_NUM_WORDS: Record<number, string> = {
  0: 'zero',
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
  11: 'eleven',
  12: 'twelve',
  13: 'thirteen',
  14: 'fourteen',
  15: 'fifteen',
  16: 'sixteen',
  17: 'seventeen',
  18: 'eighteen',
  19: 'nineteen',
  20: 'twenty',
  21: 'twenty one',
  22: 'twenty two',
  23: 'twenty three',
  24: 'twenty four',
  25: 'twenty five',
  30: 'thirty',
  40: 'forty',
  50: 'fifty',
  60: 'sixty',
  70: 'seventy',
  80: 'eighty',
  90: 'ninety',
  100: 'one hundred',
};

function spellSmallNumber(n: number): string {
  if (SMALL_NUM_WORDS[n]) return SMALL_NUM_WORDS[n]!;
  if (n > 20 && n < 100) {
    const tens = Math.floor(n / 10) * 10;
    const ones = n % 10;
    if (ones === 0) return SMALL_NUM_WORDS[tens]!;
    return `${SMALL_NUM_WORDS[tens]!} ${SMALL_NUM_WORDS[ones]!}`;
  }
  return String(n);
}

const K_SUFFIX_RE = /\b(\d{1,3})K\b/g;
const HASH_NUM_RE = /#\s*(\d{1,2})\b/g;
const NO_NUM_RE = /\bNo\.?\s*(\d{1,2})\b/gi;

function spellNumeralsInLatinPhrase(phrase: string): string {
  let result = normalizeEnglishOrdinalsInLatin(phrase);
  result = result.replace(K_SUFFIX_RE, (_, digits: string) => `${spellSmallNumber(parseInt(digits, 10))} K`);
  result = result.replace(HASH_NUM_RE, (_, digits: string) => `Number ${spellSmallNumber(parseInt(digits, 10))}`);
  result = result.replace(NO_NUM_RE, (_, digits: string) => `Number ${spellSmallNumber(parseInt(digits, 10))}`);
  return result;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Full title → spoken Latin for SSML / normalize pass. */
export function titleNumeralsForTts(title: string, _artist = ''): string {
  const trimmed = title.trim();
  if (!trimmed) return trimmed;
  return spellNumeralsInLatinPhrase(trimmed);
}

/** Replace digit-heavy title fragments elsewhere in narration (not only exact title match). */
export function applyTitleNumeralsInText(text: string, _artist = '', title = ''): string {
  if (!text) return text;
  let result = text;
  const trimmed = title.trim();
  if (!trimmed || !/\d/.test(trimmed)) return result;

  const spokenTitle = titleNumeralsForTts(trimmed);
  if (spokenTitle.toLowerCase() === trimmed.toLowerCase()) return result;

  const digitChunks = trimmed.match(/\d[\dA-Za-z.'-]*/g) ?? [];
  for (const chunk of digitChunks) {
    const spokenChunk = spellNumeralsInLatinPhrase(chunk);
    if (spokenChunk.toLowerCase() !== chunk.toLowerCase()) {
      result = result.replace(new RegExp(escapeRegExp(chunk), 'gi'), spokenChunk);
    }
  }

  const spokenWords = spokenTitle.split(/\s+/).filter(Boolean);
  const titleWords = trimmed.split(/\s+/).filter(Boolean);
  for (let i = 0; i < titleWords.length; i += 1) {
    const raw = titleWords[i]!;
    const spoken = spokenWords[i];
    if (!spoken || raw.toLowerCase() === spoken.toLowerCase() || !/\d/.test(raw)) continue;
    result = result.replace(new RegExp(`\\b${escapeRegExp(raw)}\\b`, 'gi'), spoken);
  }

  return result;
}
