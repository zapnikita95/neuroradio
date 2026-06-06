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

/** Short pause before/after whole Latin phrases — never split multi-word names. */
export function addLatinArticulationPauses(text: string): string {
  const quotes: string[] = [];
  const maskedQuotes = text.replace(/«[^»]+»/g, (quote) => {
    const idx = quotes.length;
    quotes.push(quote);
    return `\uE000LQ${idx}\uE001`;
  });
  const runs: string[] = [];
  const masked = maskedQuotes.replace(LATIN_RUN_RE, (run) => {
    const idx = runs.length;
    runs.push(run);
    return `\uE016L${idx}\uE017`;
  });
  let result = masked.replace(/\uE016L(\d+)\uE017/g, (_, index) => {
    const run = runs[Number(index)] ?? '';
    return `<[small]> ${run} <[small]>`;
  });
  result = result.replace(/<\[small\]>\s*<\[small\]>/g, '<[small]>');
  return result.replace(/\uE000LQ(\d+)\uE001/g, (_, index) => quotes[Number(index)] ?? '');
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
  void artist;
  void title;
  return result;
}
