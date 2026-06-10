/**
 * German → Russian Cyrillic phonetic for Silero / Edge RU voices.
 * Dictionary: german-pronunciation.json; rules for unknown tokens.
 */
import { germanData, normalizePhraseKey } from './de-lang-detect.js';
import type { PhoneticFormat } from './en-phonetic-ru.js';
import { sileroPhoneticToEdge } from './en-phonetic-ru.js';

export { isGermanLatinPhrase } from './de-lang-detect.js';

export const GERMAN_PHRASE_PHONETIC: Record<string, string> = germanData.phrases;

const CYR_VOWEL = /[аеёиоуыэюя]/i;

const DE_FUNCTION_WORDS = new Set(Object.keys(germanData.words));

const GRAPHEME_RULES: Array<[RegExp, string]> = [
  [/sch/g, 'ш'],
  [/tsch/g, 'ч'],
  [/ch(?=[eiyäöü])/gi, 'х'],
  [/ch/g, 'х'],
  [/ck/g, 'к'],
  [/pf/g, 'пф'],
  [/qu/g, 'кв'],
  [/sp/g, 'шп'],
  [/st/g, 'шт'],
  [/tz/g, 'ц'],
  [/ts/g, 'ц'],
  [/ei/g, 'ай'],
  [/ie/g, 'и'],
  [/eu/g, 'ой'],
  [/äu/g, 'ой'],
  [/au/g, 'ау'],
  [/ai/g, 'ай'],
  [/ä/g, 'э'],
  [/ö/g, 'ё'],
  [/ü/g, 'ю'],
  [/ß/g, 'с'],
  [/ph/g, 'ф'],
  [/tion/g, 'цион'],
  [/ng(?=[aeiouäöü]|$)/g, 'нг'],
  [/v/g, 'ф'],
  [/w/g, 'в'],
  [/z/g, 'ц'],
  [/j/g, 'й'],
  [/y(?=[aeiouäöü])/g, 'й'],
  [/y/g, 'и'],
  [/x/g, 'кс'],
  [/c(?=[eiyäöü])/g, 'ц'],
  [/c/g, 'к'],
  [/g(?=[eiyäöü])/g, 'г'],
  [/d(?=[eiyäöü])/g, 'д'],
  [/b/g, 'б'],
  [/d/g, 'д'],
  [/f/g, 'ф'],
  [/h/g, 'х'],
  [/k/g, 'к'],
  [/l/g, 'л'],
  [/m/g, 'м'],
  [/n/g, 'н'],
  [/p/g, 'п'],
  [/r/g, 'р'],
  [/s/g, 'с'],
  [/t/g, 'т'],
];

function applyStressMark(chunk: string, format: PhoneticFormat): string {
  if (!chunk) return format === 'silero' ? '+' : '';
  const m = chunk.match(CYR_VOWEL);
  if (!m || m.index === undefined) return format === 'silero' ? `+${chunk}` : chunk;
  if (format === 'silero') return `${chunk.slice(0, m.index)}+${chunk.slice(m.index)}`;
  const v = chunk.charAt(m.index);
  return chunk.slice(0, m.index) + v.toUpperCase() + chunk.slice(m.index + 1);
}

function capitalizeLike(original: string, translated: string): string {
  if (!original || !translated) return translated;
  if (original[0] === original[0]?.toUpperCase() && original[0] !== original[0]?.toLowerCase()) {
    const idx = translated.search(/[а-яё]/i);
    if (idx >= 0) {
      return translated.slice(0, idx) + translated.charAt(idx).toUpperCase() + translated.slice(idx + 1);
    }
  }
  return translated;
}

function germanGraphemesToRuLower(word: string): string {
  let w = word.toLowerCase().replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü');
  let out = w;
  for (const [re, repl] of GRAPHEME_RULES) out = out.replace(re, repl);
  return out.replace(/[^а-яё+\-0-9]/gi, '');
}

export function lookupGermanPhrasePhonetic(phrase: string): string | null {
  const key = normalizePhraseKey(phrase);
  const phrases = germanData.phrases as Record<string, string>;
  return phrases[key] ?? null;
}

function lookupPhrase(phrase: string, format: PhoneticFormat): string | null {
  const hit = lookupGermanPhrasePhonetic(phrase);
  if (!hit) return null;
  return format === 'edge' ? sileroPhoneticToEdge(hit) : hit;
}

function wordCorePhonetic(core: string, format: PhoneticFormat): string {
  const phraseHit = lookupGermanPhrasePhonetic(core);
  if (phraseHit) return format === 'edge' ? sileroPhoneticToEdge(phraseHit) : phraseHit;

  const dictWord = (germanData.words as Record<string, string>)[core.toLowerCase()];
  if (dictWord) return format === 'edge' ? sileroPhoneticToEdge(dictWord) : dictWord;

  const ru = germanGraphemesToRuLower(core);
  if (!ru || /[a-zäöüß]/i.test(ru)) return '';
  if (DE_FUNCTION_WORDS.has(core.toLowerCase())) return ru;
  return applyStressMark(ru, format);
}

function normalizeToken(raw: string): { core: string; punct: string } {
  const punct = raw.match(/[.!?…;:,'"]+$/)?.[0] ?? '';
  let core = punct ? raw.slice(0, -punct.length) : raw;
  core = core.replace(/[''`´]/g, '');
  return { core, punct };
}

export function germanWordToRussianPhonetic(word: string, format: PhoneticFormat = 'silero'): string {
  if (!word || !/[A-Za-zÀ-ÿ]/.test(word)) return word;
  if (word === '&') return 'энд';
  const { core, punct } = normalizeToken(word);
  if (!core) return word;
  const ru = wordCorePhonetic(core, format);
  if (!ru) return word;
  if (format === 'edge') return ru + punct;
  return capitalizeLike(core, ru) + punct;
}

export function germanPhraseToRussianPhonetic(phrase: string, format: PhoneticFormat = 'silero'): string {
  const trimmed = phrase.trim();
  if (!trimmed || !/[A-Za-zÀ-ÿ]/.test(trimmed)) return trimmed;
  const phraseHit = lookupPhrase(trimmed, format);
  if (phraseHit) return phraseHit;
  return trimmed.split(/\s+/).map((t) => germanWordToRussianPhonetic(t, format)).join(' ');
}
