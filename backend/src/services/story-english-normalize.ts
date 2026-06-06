/**
 * English in Russian narration: keep proper nouns (Billboard, band names, titles),
 * replace generic music jargon with Russian for TTS + quality gates.
 */

import { collectLatinTokens } from './tts-en-normalize.js';

/** Multi-word brands / outlets — never translate or strip. */
export const MUSIC_PROPER_NOUN_PHRASES: string[] = [
  'Cash Box',
  'Rolling Stone',
  'Spin Magazine',
  'Hollywood Reporter',
  'Native American',
  'Hot 100',
  'Top 40',
  'Anti-Gravity Lean',
  'Hollywood Tonight',
  'Epic Records',
  'Columbia Records',
  'Abbey Road',
  'Music Brainz',
  'Duck Duck Go',
];

/** Single-token proper nouns (magazines, platforms, labels). Lowercase keys. */
export const MUSIC_PROPER_NOUNS = new Set([
  'billboard',
  'grammy',
  'grammys',
  'mtv',
  'vh1',
  'pitchfork',
  'nme',
  'variety',
  'reddit',
  'discord',
  'spotify',
  'youtube',
  'tiktok',
  'soundcloud',
  'bandcamp',
  'shazam',
  'deezer',
  'yandex',
  'wikipedia',
  'wikidata',
  'musicbrainz',
  'apollo',
  'columbia',
  'capitol',
  'atlantic',
  'warner',
  'polydor',
  'motown',
  'defjam',
  'interscope',
  'reprise',
  'parlophone',
  'redbone',
  'fm',
  'am',
  'abba',
  'beatles',
  'queen',
  'nirvana',
  'gorillaz',
  'albarn',
  'hewlett',
  'jackson',
  'madonna',
  'elvis',
  'flow',
  'flo',
  'moonwalk',
  'hollywood',
  'tonight',
  'michael',
  'spears',
  'britney',
  'gravity',
  'lean',
  'robot',
]);

/** Generic English → Russian (not proper nouns). Longer phrases first. */
export const GENERIC_ENGLISH_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bnative\s+american\b/gi, 'коренных американцев'],
  [/\btop[-\s]?five\b/gi, 'пятёрку'],
  [/\btop[-\s]?5\b/gi, 'пятёрку'],
  [/\btop[-\s]?ten\b/gi, 'десятку'],
  [/\btop[-\s]?10\b/gi, 'десятку'],
  [/\bnumber\s+one\b/gi, 'первое место'],
  [/\bnumber\s+1\b/gi, 'первое место'],
  [/\bshock\s+rock\b/gi, 'шок-рок'],
  [/\bultimate\s+pop\b/gi, 'поп'],
  [/\bmainstream\b/gi, 'мейнстрим'],
  [/\bunderground\b/gi, 'андеграунд'],
  [/\bperformance\b/gi, 'выступление'],
  [/\bperformances\b/gi, 'выступления'],
  [/\bvocal delivery\b/gi, 'подача'],
  [/\bdelivery\b/gi, 'подача'],
  [/\bflow\b/gi, 'флоу'],
  [/\bflo\b/gi, 'флоу'],
  [/\bengineers\b/gi, 'звукорежиссёры'],
  [/\bengineer\b/gi, 'звукорежиссёр'],
  [/\bmonitors\b/gi, 'мониторы'],
  [/\bfeedback\b/gi, 'обратная связь'],
  [/\boverdub\b/gi, 'дубль'],
  [/\boverdubs\b/gi, 'дубли'],
  [/\bbootleg\b/gi, 'бутлег'],
  [/\bbootlegs\b/gi, 'бутлеги'],
  [/\bmacabre\b/gi, 'макабр'],
  [/\bviral\b/gi, 'вирусный'],
  [/\bcharts\b/gi, 'чарты'],
  [/\bchart\b/gi, 'чарт'],
  [/\bbands?\b/gi, 'группа'],
  [/\bsingles?\b/gi, 'сингл'],
  [/\btracks?\b/gi, 'трек'],
  [/\bsongs?\b/gi, 'песня'],
  [/\bhits?\b/gi, 'хит'],
  [/\blive\b/gi, 'живой'],
  [/\bstudios?\b/gi, 'студия'],
  [/\bshows?\b/gi, 'концерт'],
  [/\bstages?\b/gi, 'сцена'],
  [/\brecordings?\b/gi, 'запись'],
  [/\breleased\b/gi, 'вышел'],
  [/\brelease\b/gi, 'релиз'],
  [/\bcommercial\b/gi, 'коммерческий'],
  [/\bcritic\b/gi, 'критик'],
  [/\bcritics\b/gi, 'критики'],
  [/\breview\b/gi, 'рецензия'],
  [/\breviews\b/gi, 'рецензии'],
  [/\brecommended\b/gi, 'рекомендовал'],
  [/\brecommend\b/gi, 'рекомендовал'],
  [/\bradio\b/gi, 'радио'],
  // Lowercase only — Pop/Rock/Rap with capital letter are stage names (Jimmy Pop, Kid Rock).
  [/\bpop\b/g, 'поп'],
  [/\brock\b/g, 'рок'],
  [/\brap\b/g, 'рэп'],
  [/\bfunk\b/g, 'фанк'],
  [/\bsoul\b/g, 'соул'],
  [/\bjazz\b/g, 'джаз'],
  [/\bblues\b/g, 'блюз'],
  [/\bcountry\b/g, 'кантри'],
  [/\bdisco\b/g, 'диско'],
  [/\bmetal\b/g, 'метал'],
  [/\bpunk\b/g, 'панк'],
  [/\bindie\b/g, 'инди'],
];

/** Genre words that become Russian when lowercased; used to undo mistaken translation in names. */
const GENRE_LATIN_TO_RU: Record<string, string> = {
  pop: 'поп',
  rock: 'рок',
  rap: 'рэп',
  funk: 'фанк',
  soul: 'соул',
  jazz: 'джаз',
  blues: 'блюз',
  country: 'кантри',
  disco: 'диско',
  metal: 'метал',
  punk: 'панк',
  indie: 'инди',
};

const GENRE_CAP_WORDS =
  'Pop|Rock|Rap|Funk|Soul|Jazz|Blues|Country|Disco|Metal|Punk|Indie';

const MULTI_WORD_LATIN_NAME =
  /\b([A-Z][a-z]+(?:[''][a-z]+)?(?:\s+[A-Z][a-z]+(?:[''][a-z]+)?)+)\b/g;

const STAGE_NAME_WITH_GENRE = new RegExp(
  `\\b([A-Z][a-z]+(?:[''][a-z]+)?(?:\\s+[A-Z][a-z]+(?:[''][a-z]+)?)*)\\s+(${GENRE_CAP_WORDS})\\b`,
  'g',
);

/** Latin phrases that must survive generic EN→RU replacement (e.g. «soul» in De La Soul). */
const PROTECTED_LATIN_PHRASES = [
  'De La Soul',
  'Gorillaz',
  'Jamie Hewlett',
  'Damon Albarn',
  'Feel Good Inc.',
  'Måneskin',
  'The Rasmus',
];

const PHRASE_SLOT = '\uE012P';
const PHRASE_END = '\uE013';

function maskProtectedLatinPhrases(
  text: string,
  phraseList: string[] = PROTECTED_LATIN_PHRASES,
): { masked: string; phrases: string[] } {
  const phrases: string[] = [];
  let masked = text;
  const sorted = [...new Set(phraseList.filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const phrase of sorted) {
    const re = new RegExp(escapeRegExp(phrase), 'gi');
    masked = masked.replace(re, (match) => {
      const idx = phrases.length;
      phrases.push(match);
      return `${PHRASE_SLOT}${idx}${PHRASE_END}`;
    });
  }
  return { masked, phrases };
}

/** Capitalized Latin multi-word names and stage names with genre words (Jimmy Pop). */
function collectCapitalizedProperNounPhrases(text: string): string[] {
  const phrases: string[] = [];
  for (const match of text.matchAll(STAGE_NAME_WITH_GENRE)) phrases.push(match[0]);
  for (const match of text.matchAll(MULTI_WORD_LATIN_NAME)) phrases.push(match[1]);
  return phrases;
}

/** Nicknames and multi-word names from wiki/fact snippets. */
export function extractProperNamePhrasesFromFacts(referenceFacts: string[] = []): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];
  const add = (raw: string) => {
    const phrase = raw.trim().replace(/\s{2,}/g, ' ');
    if (phrase.length < 3) return;
    const key = phrase.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    phrases.push(phrase);
  };

  for (const fact of referenceFacts) {
    for (const match of fact.matchAll(/["']([A-Za-z][^"']{1,80})["']/g)) add(match[1]);
    for (const match of fact.matchAll(MULTI_WORD_LATIN_NAME)) add(match[1]);
    for (const match of fact.matchAll(STAGE_NAME_WITH_GENRE)) add(match[0]);
  }
  return phrases;
}

/** Undo «Jimmy поп» when facts/wiki still have «Jimmy Pop». */
function restoreProperNamesCorruptedByGenreTranslation(
  text: string,
  namePhrases: string[],
): string {
  let result = text;
  for (const name of namePhrases) {
    const parts = name.split(/\s+/);
    if (parts.length < 2) continue;
    const lastLatin = parts[parts.length - 1];
    const ruGenre = GENRE_LATIN_TO_RU[lastLatin.toLowerCase()];
    if (!ruGenre) continue;
    const prefix = parts.slice(0, -1).map(escapeRegExp).join('\\s+');
    // \b fails around Cyrillic in JS — use Unicode-aware boundaries.
    result = result.replace(
      new RegExp(
        `(?<![\\p{L}\\p{N}'])${prefix}\\s+${escapeRegExp(ruGenre)}(?![\\p{L}\\p{N}'])`,
        'giu',
      ),
      name,
    );
  }
  return result;
}

function unmaskProtectedLatinPhrases(text: string, phrases: string[]): string {
  return text.replace(
    new RegExp(`${PHRASE_SLOT}(\\d+)${PHRASE_END}`, 'g'),
    (_, index) => phrases[Number(index)] ?? '',
  );
}
const LATIN_TITLE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,5}\b/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Latin tokens from English fact snippets (Redbone, Goodman, etc.). */
export function extractLatinTokensFromFacts(referenceFacts: string[] = []): Set<string> {
  const tokens = new Set<string>();
  for (const fact of referenceFacts) {
    for (const match of fact.matchAll(LATIN_CAP_WORD)) {
      const word = match[0].toLowerCase();
      if (word.length >= 2) tokens.add(word);
    }
    for (const match of fact.matchAll(LATIN_TITLE)) {
      for (const part of match[0].split(/\s+/)) {
        const word = part.replace(/[^a-z']/gi, '').toLowerCase();
        if (word.length >= 2) tokens.add(word);
      }
    }
    for (const part of fact.split(/[^\p{L}\p{N}]+/u)) {
      const word = part.trim().toLowerCase();
      if (word.length >= 2 && /[a-z]/.test(word)) tokens.add(word);
    }
  }
  return tokens;
}

export function buildAllowedLatinTokens(
  artist: string,
  title: string,
  referenceFacts: string[] = [],
  script = '',
): Set<string> {
  const allowed = collectLatinTokens(artist, title);
  for (const word of MUSIC_PROPER_NOUNS) allowed.add(word);
  for (const token of extractLatinTokensFromFacts(referenceFacts)) allowed.add(token);
  for (const match of script.matchAll(LATIN_CAP_WORD)) {
    allowed.add(match[0].toLowerCase());
  }
  for (const phrase of MUSIC_PROPER_NOUN_PHRASES) {
    for (const part of phrase.split(/\s+/)) {
      allowed.add(part.toLowerCase());
    }
  }
  return allowed;
}

/** LLM often mistranslates vocal «delivery» as shipping «доставка». */
export function fixMusicalMistranslations(text: string): string {
  return text
    .replace(/\bдоставок\b/gi, 'подач')
    .replace(/\bдоставкой\b/gi, 'подачей')
    .replace(/\bдоставку\b/gi, 'подачу')
    .replace(/\bдоставки\b/gi, 'подачи')
    .replace(/\bдоставка\b/gi, 'подача');
}

/** Replace generic English; leave proper nouns intact. */
export function replaceGenericEnglish(
  text: string,
  extraProtectedPhrases: string[] = [],
): string {
  const protectedPhrases = [
    ...PROTECTED_LATIN_PHRASES,
    ...extraProtectedPhrases,
    ...collectCapitalizedProperNounPhrases(text),
  ];
  const { masked, phrases } = maskProtectedLatinPhrases(text, protectedPhrases);
  let result = masked;
  for (const [pattern, replacement] of GENERIC_ENGLISH_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  result = fixMusicalMistranslations(unmaskProtectedLatinPhrases(result, phrases));
  return result.replace(/\s{2,}/g, ' ').trim();
}

const LATIN_CAP_WORD = /\b[A-Z][a-z]+(?:[''][a-z]+)?\b/g;

export interface StoryLanguageContext {
  artist: string;
  title: string;
  referenceFacts?: string[];
}

/** Normalize script before quality check / TTS: RU jargon, keep names. */
export function prepareStoryScriptLanguage(
  script: string,
  ctx: StoryLanguageContext,
): { text: string; allowedLatin: Set<string> } {
  let text = script.trim();
  for (const phrase of MUSIC_PROPER_NOUN_PHRASES) {
    const re = new RegExp(escapeRegExp(phrase), 'gi');
    text = text.replace(re, phrase);
  }
  const namePhrases = extractProperNamePhrasesFromFacts(ctx.referenceFacts ?? []);
  text = replaceGenericEnglish(text, namePhrases);
  text = restoreProperNamesCorruptedByGenreTranslation(text, namePhrases);
  text = fixMusicalMistranslations(text);
  const allowedLatin = buildAllowedLatinTokens(ctx.artist, ctx.title, ctx.referenceFacts ?? [], text);
  return { text, allowedLatin };
}
