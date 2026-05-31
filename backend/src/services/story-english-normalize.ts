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
  'jackson',
  'madonna',
  'elvis',
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
  [/\bpop\b/gi, 'поп'],
  [/\brock\b/gi, 'рок'],
  [/\bfunk\b/gi, 'фанк'],
  [/\bsoul\b/gi, 'соул'],
  [/\bjazz\b/gi, 'джаз'],
  [/\bblues\b/gi, 'блюз'],
  [/\bcountry\b/gi, 'кантри'],
  [/\bdisco\b/gi, 'диско'],
  [/\bmetal\b/gi, 'метал'],
  [/\bpunk\b/gi, 'панк'],
  [/\bindie\b/gi, 'инди'],
];

const LATIN_CAP_WORD = /\b[A-Z][a-z]+(?:[''][a-z]+)?\b/g;
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

/** Replace generic English; leave proper nouns intact. */
export function replaceGenericEnglish(text: string): string {
  let result = text;
  for (const [pattern, replacement] of GENERIC_ENGLISH_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

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
  text = replaceGenericEnglish(text);
  const allowedLatin = buildAllowedLatinTokens(ctx.artist, ctx.title, ctx.referenceFacts ?? [], text);
  return { text, allowedLatin };
}
