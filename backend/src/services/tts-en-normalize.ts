/**
 * Mixed RU/EN pronunciation helpers for Yandex SpeechKit.
 * Keeps artist/title Latin intact and adds micro-pauses around foreign tokens.
 */

import { normalizeLatinApostrophes } from './tts-yandex-normalize.js';

export { normalizeLatinApostrophes };

/** Common music/tech Latin tokens that may appear in Russian narration. */
export const MUSIC_LATIN_ALLOWLIST = new Set([
  'tiktok',
  'youtube',
  'spotify',
  'remix',
  'cover',
  'single',
  'album',
  'vinyl',
  'master',
  'demo',
  'live',
  'feat',
  'featuring',
  'vs',
  'ep',
  'lp',
  'cd',
  'dvd',
  'mtv',
  'grammy',
  'billboard',
  'hot',
  'top',
  'hit',
  'pop',
  'rock',
  'jazz',
  'funk',
  'soul',
  'rnb',
  'r&b',
  'hip',
  'hop',
  'rap',
  'edm',
  'house',
  'techno',
  'disco',
  'indie',
  'punk',
  'metal',
  'blues',
  'reggae',
  'samba',
  'bossa',
  'nova',
  'beatles',
  'queen',
  'nirvana',
  'gorillaz',
  'albarn',
  'hewlett',
  'pixies',
  'cobain',
  'elvis',
  'madonna',
  'beyonce',
  'drake',
  'eminem',
  'weeknd',
  'beat',
  'drop',
  'hook',
  'chorus',
  'verse',
  'bridge',
  'sample',
  'loop',
  'track',
  'playlist',
  'stream',
  'streams',
  'bpm',
  'acoustic',
  'electric',
  'studio',
  'stage',
  'tour',
  'gig',
  'setlist',
  'soundcheck',
  'backstage',
  'reissue',
  'deluxe',
  'bonus',
  'unplugged',
  'acapella',
  'a cappella',
  'bedroom',
  'viral',
]);

const LATIN_RUN_RE =
  /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9''.\-&]{0,}(?:\s+(?![.!?…]\s)[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9''.\-&]{0,})*/g;

const YANDEX_MARKUP_TAG_RE = /<\[(?:small|medium|large|tiny|huge|sentence)\]>/g;
const MARKUP_SLOT = '\uE012';
const MARKUP_SLOT_END = '\uE013';

/** Hide `<[sentence]>` etc. before Latin pass — otherwise "sentence" becomes en-US speech. */
function maskYandexMarkupTags(text: string): { masked: string; slots: string[] } {
  const slots: string[] = [];
  const masked = text.replace(YANDEX_MARKUP_TAG_RE, (tag) => {
    const idx = slots.length;
    slots.push(tag);
    return `${MARKUP_SLOT}${idx}${MARKUP_SLOT_END}`;
  });
  return { masked, slots };
}

function unmaskYandexMarkupTags(text: string, slots: string[]): string {
  return text.replace(
    new RegExp(`${MARKUP_SLOT}(\\d+)${MARKUP_SLOT_END}`, 'g'),
    (_, index) => slots[Number(index)] ?? '',
  );
}

export function collectLatinTokens(artist: string, title: string): Set<string> {
  const tokens = new Set<string>();
  const collect = (value: string) => {
    value
      .split(/[^\p{L}\p{N}]+/u)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2 && /[a-z]/i.test(part))
      .forEach((part) => tokens.add(part.toLowerCase()));
  };
  collect(artist);
  collect(title);
  for (const word of MUSIC_LATIN_ALLOWLIST) {
    tokens.add(word);
  }
  return tokens;
}

/** Latin phrases stay inline — SSML <lang> handles pronunciation; no extra pauses around foreign words. */
export function addLatinArticulationPauses(text: string): string {
  return text;
}

/** Normalize punctuation around Latin tokens (no spaces inside hyphenated names). */
export function normalizeLatinPunctuation(text: string): string {
  return normalizeLatinApostrophes(text)
    .replace(/\s+([’'])\s+/g, '$1')
    .replace(/\s+-\s+/g, '-')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** 2nd → second inside Latin runs (TTS only — display script keeps «The 2nd Law»). */
const EN_ORDINAL_WORDS: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eighth',
  9: 'ninth',
  10: 'tenth',
  11: 'eleventh',
  12: 'twelfth',
};

export function normalizeEnglishOrdinalsInLatin(text: string): string {
  return text.replace(
    /\b(\d{1,2})\s*(st|nd|rd|th)\b/gi,
    (match, digits: string) => EN_ORDINAL_WORDS[parseInt(digits, 10)] ?? match,
  );
}

export function enhanceMixedLanguageText(
  text: string,
  artist: string,
  title: string,
): string {
  let result = normalizeLatinPunctuation(text);
  result = normalizeEnglishOrdinalsInLatin(result);
  result = addLatinArticulationPauses(result);
  void artist;
  void title;
  return result;
}
