/**
 * English phoneme dictionary + rules for Yandex SpeechKit [[...]] markup.
 */

/** Exact word → space-separated Yandex phonemes */
export const ENGLISH_PHONEME_WORDS: Record<string, string> = {
  abba: 'a b a',
  bad: 'b a d',
  beatles: 'b i t l z',
  beyonce: 'b i j o n s eɪ',
  billie: 'b ɪ l i',
  brown: 'b r a u n',
  california: 'k a l ɪ f ɔ r n j a',
  cafe: 'k a f eɪ',
  ciocarlia: 'tʃ o k a r l i a',
  daft: 'd a f t',
  david: 'd eɪ v ɪ d',
  dean: 'd i n',
  eilish: 'a i l i ʂ',
  elvis: 'ɛ l v i s',
  fanfare: 'f a n f ɛ r',
  good: 'g u d',
  hey: 'h e i',
  italiano: 'i t a l i a n o',
  james: 'd j e m z',
  jude: 'd j u d',
  jxl: 'd j e k s e l',
  love: 'l a v',
  mambo: 'm a m b o',
  martin: 'm a r t i n',
  miles: 'm a i l z',
  moliendo: 'm o l i e n d o',
  one: 'v a n',
  pac: 'p a k',
  presley: 'p r ɛ s l i',
  queen: 'k v i n',
  rock: 'r o k',
  soul: 's o l',
  swift: 't e i l ɛ r',
  taylor: 't e i l ɛ r',
  thrill: 't r i l',
  '2pac': 't u p a k',
};

/** Yandex SpeechKit supported phonemes (ru voice reading [[...]] blocks) */
export const VALID_PHONEME =
  /^(?:bʲ|b|dʲ|d|fʲ|f|gʲ|g|j|kʲ|k|lʲ|l|mʲ|m|nʲ|n|pʲ|p|rʲ|r|sʲ|s|ʂ|tʲ|t|t͡s|t͡ɕ|vʲ|v|xʲ|x|zʲ|z|ʐ|ɕː|ə|a|ʌ|ɛ|i|ɪ|ɨ|o|ɔ|u|ʊ)$/;

const PHONEME_ALIASES: Record<string, string> = {
  eɪ: 'e i',
  aɪ: 'a i',
  oʊ: 'o',
  dʒ: 'd j',
  tʃ: 't͡ɕ',
  sh: 'ʂ',
  θ: 't',
  ð: 'd',
  ŋ: 'n',
  ɚ: 'ə',
  ɒ: 'ɔ',
  w: 'v',
  h: 'x',
};

function normalizePhonemeString(raw: string): string {
  const parts = raw.split(/\s+/).flatMap((p) => {
    const alias = PHONEME_ALIASES[p];
    return alias ? alias.split(/\s+/) : [p];
  });
  return parts.filter((p) => VALID_PHONEME.test(p)).join(' ');
}

export function englishWordToPhonemes(rawWord: string): string | null {
  if (!rawWord || !/[a-z\u00C0-\u024F0-9]/i.test(rawWord)) return null;

  const normalized = rawWord
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, "'")
    .toLowerCase();

  const dictHit = ENGLISH_PHONEME_WORDS[normalized];
  if (dictHit) return normalizePhonemeString(dictHit);

  if (/^\d+[a-z]*$/i.test(normalized)) {
    return normalized.split('').filter((c) => /[a-z0-9]/i.test(c)).join(' ');
  }

  return englishRulesToPhonemes(normalized);
}

function englishRulesToPhonemes(word: string): string | null {
  let w = word;

  const rules: Array<[RegExp, string]> = [
    [/sch/g, 'ʃ'],
    [/sh/g, 'ʃ'],
    [/ch/g, 'tʃ'],
    [/ph/g, 'f'],
    [/ck/g, 'k'],
    [/qu/g, 'k w'],
    [/ee/g, 'i'],
    [/ea/g, 'i'],
    [/oo/g, 'u'],
    [/ou/g, 'a u'],
    [/ai/g, 'eɪ'],
    [/ay/g, 'eɪ'],
    [/th/g, 'θ'],
    [/ng/g, 'ŋ'],
  ];

  for (const [pattern, replacement] of rules) {
    w = w.replace(pattern, ` ${replacement} `);
  }

  if (w.endsWith('e') && w.length > 3 && !w.endsWith('ee')) {
    w = w.slice(0, -1);
  }

  const charMap: Record<string, string> = {
    a: 'a',
    b: 'b',
    c: 'k',
    d: 'd',
    e: 'ɛ',
    f: 'f',
    g: 'g',
    h: 'h',
    i: 'ɪ',
    j: 'dʒ',
    k: 'k',
    l: 'l',
    m: 'm',
    n: 'n',
    o: 'oʊ',
    p: 'p',
    q: 'k',
    r: 'r',
    s: 's',
    t: 't',
    u: 'a',
    v: 'v',
    w: 'w',
    x: 'k s',
    y: 'j',
    z: 'z',
  };

  const phonemes: string[] = [];
  for (const token of w.split(/\s+/)) {
    if (!token) continue;
    if (token.includes(' ')) {
      phonemes.push(...token.split(/\s+/));
      continue;
    }
    for (const ch of token) {
      const mapped = charMap[ch];
      if (mapped) phonemes.push(...mapped.split(/\s+/));
    }
  }

  const filtered = phonemes.filter((p) => p && VALID_PHONEME.test(p));
  const joined = filtered.join(' ');
  return joined.length > 0 ? normalizePhonemeString(joined) : null;
}

export function wrapLatinWord(rawWord: string): string {
  if (!/[a-z\u00C0-\u024F0-9]/i.test(rawWord)) return rawWord;
  if (rawWord.includes('[[') || rawWord.includes('+')) return rawWord;
  const phonemes = englishWordToPhonemes(rawWord);
  if (!phonemes) return rawWord;
  return `[[${phonemes}]]`;
}