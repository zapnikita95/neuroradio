/**
 * Mixed RU/EN pronunciation helpers for Yandex SpeechKit.
 * Keeps artist/title Latin intact and adds micro-pauses around foreign tokens.
 */

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
]);

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

/** Short pause before/after Latin runs so Yandex articulates names clearly. */
export function addLatinArticulationPauses(text: string): string {
  const quotes: string[] = [];
  const masked = text.replace(/«[^»]+»/g, (quote) => {
    const idx = quotes.length;
    quotes.push(quote);
    return `\uE000LQ${idx}\uE001`;
  });
  let result = masked
    .replace(
      /(\s)([A-Za-z][A-Za-z0-9&'’.-]{1,}(?:\s+[A-Za-z][A-Za-z0-9&'’.-]{1,}){0,4})(\s|[,.!?…])/g,
      '$1<[small]> $2 <[small]>$3',
    )
    .replace(/<\[small\]>\s*<\[small\]>/g, '<[small]>');
  result = result.replace(/\uE000LQ(\d+)\uE001/g, (_, index) => quotes[Number(index)] ?? '');
  return result;
}

/** Normalize punctuation around Latin tokens (no spaces inside hyphenated names). */
export function normalizeLatinPunctuation(text: string): string {
  return text
    .replace(/\s+([’'])\s+/g, '$1')
    .replace(/\s+-\s+/g, '-')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function enhanceMixedLanguageText(
  text: string,
  artist: string,
  title: string,
): string {
  let result = normalizeLatinPunctuation(text);
  result = addLatinArticulationPauses(result);
  return result.replace(/\s{2,}/g, ' ').trim();
}
