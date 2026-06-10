/**
 * French → Russian Cyrillic phonetic (legacy Silero path only).
 * Edge/Yandex: Latin + fr-FR SSML lang tag — native French pronunciation.
 */
import { frenchData, normalizePhraseKey } from './fr-lang-detect.js';
import type { PhoneticFormat } from './en-phonetic-ru.js';
import { sileroPhoneticToEdge } from './en-phonetic-ru.js';

export { isFrenchLatinPhrase } from './fr-lang-detect.js';

export const FRENCH_PHRASE_PHONETIC: Record<string, string> = frenchData.phrases;

const CYR_VOWEL = /[аеёиоуыэюя]/i;

const FR_FUNCTION_WORDS = new Set(Object.keys(frenchData.words));

const GRAPHEME_RULES: Array<[RegExp, string]> = [
  [/eau/g, 'о'],
  [/eux/g, 'ё'],
  [/oeu/g, 'ё'],
  [/œu/g, 'ё'],
  [/ou/g, 'у'],
  [/oi/g, 'уа'],
  [/au/g, 'о'],
  [/eu/g, 'ё'],
  [/ai/g, 'е'],
  [/ei/g, 'е'],
  [/ey/g, 'е'],
  [/ch/g, 'ш'],
  [/gn/g, 'нь'],
  [/qu/g, 'к'],
  [/ph/g, 'ф'],
  [/th/g, 'т'],
  [/tion/g, 'сьон'],
  [/ille/g, 'ий'],
  [/ille\b/g, 'ий'],
  [/ç/g, 'с'],
  [/œ/g, 'ё'],
  [/æ/g, 'э'],
  [/à|â/g, 'а'],
  [/é|è|ê/g, 'е'],
  [/ë/g, 'е'],
  [/î|ï/g, 'и'],
  [/ô/g, 'о'],
  [/ù|û|ü/g, 'ю'],
  [/j/g, 'ж'],
  [/c(?=[eiy])/g, 'с'],
  [/c/g, 'к'],
  [/g(?=[eiy])/g, 'ж'],
  [/x/g, 'кс'],
  [/v/g, 'в'],
  [/w/g, 'в'],
  [/h(?=[aeiou])/g, ''],
  [/h/g, ''],
  [/ll/g, 'л'],
  [/y(?=[aeiou])/g, 'й'],
  [/y/g, 'и'],
  [/z/g, 'з'],
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

function frenchGraphemesToRuLower(word: string): string {
  let w = word.toLowerCase();
  let out = w;
  for (const [re, repl] of GRAPHEME_RULES) out = out.replace(re, repl);
  out = out
    .replace(/a/g, 'а')
    .replace(/b/g, 'б')
    .replace(/d/g, 'д')
    .replace(/e/g, 'е')
    .replace(/f/g, 'ф')
    .replace(/g/g, 'г')
    .replace(/i/g, 'и')
    .replace(/k/g, 'к')
    .replace(/l/g, 'л')
    .replace(/m/g, 'м')
    .replace(/n/g, 'н')
    .replace(/o/g, 'о')
    .replace(/p/g, 'п')
    .replace(/r/g, 'р')
    .replace(/s/g, 'с')
    .replace(/t/g, 'т')
    .replace(/u/g, 'ю');
  return out.replace(/[^а-яё+\-0-9]/gi, '');
}

export function lookupFrenchPhrasePhonetic(phrase: string): string | null {
  const key = normalizePhraseKey(phrase);
  const phrases = frenchData.phrases as Record<string, string>;
  return phrases[key] ?? null;
}

function lookupPhrase(phrase: string, format: PhoneticFormat): string | null {
  const hit = lookupFrenchPhrasePhonetic(phrase);
  if (!hit) return null;
  return format === 'edge' ? sileroPhoneticToEdge(hit) : hit;
}

function wordCorePhonetic(core: string, format: PhoneticFormat): string {
  const phraseHit = lookupFrenchPhrasePhonetic(core);
  if (phraseHit) return format === 'edge' ? sileroPhoneticToEdge(phraseHit) : phraseHit;

  const dictWord = (frenchData.words as Record<string, string>)[core.toLowerCase()];
  if (dictWord) return format === 'edge' ? sileroPhoneticToEdge(dictWord) : dictWord;

  const ru = frenchGraphemesToRuLower(core);
  if (!ru || /[a-zàâäæçéèêëîïôœùûüÿ]/i.test(ru)) return '';
  if (FR_FUNCTION_WORDS.has(core.toLowerCase())) return ru;
  return applyStressMark(ru, format);
}

function normalizeToken(raw: string): { core: string; punct: string } {
  const punct = raw.match(/[.!?…;:,'"]+$/)?.[0] ?? '';
  let core = punct ? raw.slice(0, -punct.length) : raw;
  core = core.replace(/[''`´]/g, '');
  return { core, punct };
}

export function frenchWordToRussianPhonetic(word: string, format: PhoneticFormat = 'silero'): string {
  if (!word || !/[A-Za-zÀ-ÿ]/.test(word)) return word;
  if (word === '&') return 'энд';
  const { core, punct } = normalizeToken(word);
  if (!core) return word;
  const ru = wordCorePhonetic(core, format);
  if (!ru) return word;
  if (format === 'edge') return ru + punct;
  return capitalizeLike(core, ru) + punct;
}

export function frenchPhraseToRussianPhonetic(phrase: string, format: PhoneticFormat = 'silero'): string {
  const trimmed = phrase.trim();
  if (!trimmed || !/[A-Za-zÀ-ÿ]/.test(trimmed)) return trimmed;
  const phraseHit = lookupPhrase(trimmed, format);
  if (phraseHit) return phraseHit;
  return trimmed.split(/\s+/).map((t) => frenchWordToRussianPhonetic(t, format)).join(' ');
}
