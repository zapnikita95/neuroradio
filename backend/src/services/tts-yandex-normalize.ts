/** Last-mile token fixes before Yandex SSML (no network). */

const CURLY_APOSTROPHE = /[\u2018\u2019\u02BC\u0060]/g;

export function normalizeLatinApostrophes(text: string): string {
  return text.replace(CURLY_APOSTROPHE, "'");
}

const MIXED_TTS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bR\s*&\s*B\b/gi, 'рэ-энд-би'],
  [/\brap[\s-]singing\b/gi, 'рэп-сингинг'],
  [/\bрэп[\s-]singing\b/gi, 'рэп-сингинг'],
  [/\b(контракт(?:ом)?|сделк(?:а|у|ой|е)|подпис\w*)\s+с\s+(?=[A-Z])/gi, '$1 с лейблом '],
  [/(?<=[.!?…]\s+)В\s+(?=[A-Z])/g, 'В треке '],
  [/(?<=[.!?…]\s+)в\s+(?=[A-Z])/g, 'в треке '],
];

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

  return result;
}
