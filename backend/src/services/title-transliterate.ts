/** Cyrillic ↔ Latin title matching for snippets, facts, and search results. */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CYR_TO_LAT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

export function cyrillicToLatin(text: string): string {
  return [...text.toLowerCase()].map((ch) => CYR_TO_LAT[ch] ?? ch).join('');
}

function cleanTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

function significantTokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length >= 2);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(row[j] + 1, prev + 1, row[j - 1] + cost);
      row[j - 1] = prev;
      prev = next;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/** Token match with transliteration and small typos (Ya Soshla vs soshla). */
export function fuzzyTokenMatch(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))) return true;

  const pairs: Array<[string, string]> = [
    [x, y],
    [cyrillicToLatin(x), y],
    [x, cyrillicToLatin(y)],
    [cyrillicToLatin(x), cyrillicToLatin(y)],
  ];
  for (const [left, right] of pairs) {
    if (left === right) return true;
    if (left.length >= 3 && right.length >= 3 && (left.includes(right) || right.includes(left))) return true;
    const minLen = Math.min(left.length, right.length);
    if (minLen >= 4 && levenshtein(left, right) <= Math.max(1, Math.floor(minLen * 0.28))) return true;
  }
  return false;
}

/** All normalized spellings to search for in snippet/fact text. */
export function buildTitleMatchVariants(title: string): string[] {
  const clean = cleanTitle(title);
  const base = normalize(clean);
  const variants = new Set<string>();
  if (base.length >= 2) variants.add(base);

  const latin = normalize(cyrillicToLatin(clean));
  if (latin.length >= 2) {
    variants.add(latin);
    variants.add(latin.replace(/\s+/g, ''));
  }

  if (base.includes('favourite')) variants.add(base.replace('favourite', 'favorite'));
  if (base.includes('favorite')) variants.add(base.replace('favorite', 'favourite'));

  const tokens = significantTokens(clean);
  if (tokens.length >= 2) {
    variants.add(tokens.join(' '));
    variants.add(cyrillicToLatin(tokens.join(' ')));
  }

  return [...variants].filter((v) => v.length >= 2);
}

/** True when haystack contains title in any spelling variant. */
export function textMentionsTitle(haystack: string, title: string): boolean {
  const clean = cleanTitle(title);
  const hayNorm = normalize(haystack);
  if (!hayNorm || !clean) return false;

  const titleNorm = normalize(clean);
  if (titleNorm.length >= 4 && hayNorm.includes(titleNorm)) return true;

  for (const variant of buildTitleMatchVariants(clean)) {
    if (variant.length >= 4 && hayNorm.includes(variant)) return true;
  }

  if (titleNorm.length < 4) {
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`[«""']\\s*${escaped}\\s*[»""']`, 'i').test(haystack)) return true;
    if (new RegExp(`\\b(?:song|track|single|titled?)\\s+[«""']?${escaped}[«""']?`, 'i').test(haystack)) return true;
  }

  const titleTokens = significantTokens(clean);
  if (titleTokens.length === 0) return false;

  const hayTokens = significantTokens(haystack);
  const latinTitleTokens = significantTokens(cyrillicToLatin(clean));
  const allTitleTokens = [...new Set([...titleTokens, ...latinTitleTokens])];

  let matched = 0;
  for (const tt of allTitleTokens) {
    if (hayTokens.some((ht) => fuzzyTokenMatch(tt, ht))) matched += 1;
  }

  const required = allTitleTokens.length <= 2 ? allTitleTokens.length : Math.max(2, Math.ceil(allTitleTokens.length * 0.6));
  return matched >= required;
}

/** Snippet relevance: direct mention or enough transliterated token overlap. */
export function snippetMatchesTitle(snippet: string, title: string): boolean {
  return textMentionsTitle(snippet, title);
}
