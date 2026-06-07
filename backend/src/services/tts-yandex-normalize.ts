/** Last-mile token fixes before Yandex SSML (no network). */

const CURLY_APOSTROPHE = /[\u2018\u2019\u02BC\u0060]/g;

export function normalizeLatinApostrophes(text: string): string {
  return text.replace(CURLY_APOSTROPHE, "'");
}

const MIXED_TTS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bR\s*&\s*B\b/gi, 'ар эн би'],
  [/\brap[\s-]singing\b/gi, 'рэп-сингинг'],
  [/\bрэп[\s-]singing\b/gi, 'рэп-сингинг'],
  [/\b(контракт(?:ом)?|сделк(?:а|у|ой|е)|подпис\w*)\s+с\s+(?=[A-Z])/gi, '$1 с лейблом '],
  [/(?<=[.!?…]\s+)В\s+(?=[A-Z])/g, 'В треке '],
  [/(?<=[.!?…]\s+)в\s+(?=[A-Z])/g, 'в треке '],
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

  return result;
}
