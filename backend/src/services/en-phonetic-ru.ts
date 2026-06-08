/**
 * English → Russian Cyrillic phonetic transcription for Silero (single RU voice).
 * CMU dict (134k words) + phonemize/en-g2p rules for unknowns — NOT letter-by-letter.
 */
import { createRequire } from 'node:module';
import { dictionary as cmuDictionary } from 'cmu-pronouncing-dictionary';

const require = createRequire(import.meta.url);

type G2PProcessor = {
  predict: (word: string) => string | null;
};

let g2p: G2PProcessor | null = null;

function getG2p(): G2PProcessor {
  if (!g2p) {
    const { G2PModel } = require('phonemize/en-g2p') as { G2PModel: new () => G2PProcessor };
    g2p = new G2PModel();
  }
  return g2p;
}

const ARPABET_MULTI = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'CH', 'DH', 'EH', 'ER', 'EY', 'HH', 'IH', 'IY', 'JH', 'NG',
  'OW', 'OY', 'SH', 'TH', 'UH', 'UW', 'ZH',
]);

const PHONETIC_OVERRIDES: Record<string, string> = {
  co: 'ко',
  hot: 'хот',
  the: 'зэ',
  mtv: 'эм-ти-ви',
  cd: 'си-ди',
  flac: 'флак',
  mp3: 'эм-пи-три',
  rb: 'ар-би',
  dj: 'ди-джей',
  feat: 'фит',
};

/** IPA / ARPAbet → Russian ear (как в русскоязычных новостях). Longest tokens first. */
const PHONEME_TO_RU: Array<[string, string]> = [
  ['tʃ', 'ч'], ['dʒ', 'дж'], ['aɪ', 'ай'], ['aʊ', 'ау'], ['eɪ', 'эй'], ['oʊ', 'оу'], ['ɔɪ', 'ой'],
  ['ju', 'ю'], ['juː', 'ю'], ['uː', 'у'], ['iː', 'и'], ['ɜː', 'ер'], ['ɔː', 'о'], ['ɑː', 'а'],
  ['iən', 'иан'], ['iɑn', 'иан'], ['ɪŋ', 'инг'], ['ɪk', 'ик'], ['ɪt', 'ит'], ['ɪd', 'ид'],
  ['ɪz', 'из'], ['ɪs', 'ис'], ['ɪf', 'иф'], ['ɪm', 'им'], ['ɪn', 'ин'], ['ɪl', 'ил'],
  ['tʃ', 'ч'], ['ʃ', 'ш'], ['ʒ', 'ж'], ['θ', 'с'], ['ð', 'з'], ['ŋ', 'нг'], ['ɫ', 'л'],
  ['ɝ', 'ер'], ['ɚ', 'ер'], ['ɜ', 'ер'], ['ɹ', 'р'], ['r', 'р'], ['w', 'в'], ['j', 'й'],
  ['æ', 'э'], ['ɑ', 'а'], ['ɒ', 'о'], ['ə', 'а'], ['ɛ', 'э'], ['ɪ', 'и'], ['i', 'и'],
  ['ɔ', 'о'], ['ʊ', 'у'], ['u', 'у'], ['ʌ', 'а'], ['a', 'а'], ['e', 'э'], ['o', 'о'],
  ['ɡ', 'г'], ['g', 'г'], ['h', 'х'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'],
  ['p', 'п'], ['b', 'б'], ['f', 'ф'], ['v', 'в'], ['s', 'с'], ['z', 'з'], ['t', 'т'], ['d', 'д'],
  ['x', 'кс'], ['ː', ''], ['ˈ', ''], ['ˌ', ''],
  // ARPAbet
  ['DH', 'з'], ['TH', 'с'], ['SH', 'ш'], ['CH', 'ч'], ['JH', 'дж'], ['ZH', 'ж'], ['NG', 'нг'],
  ['HH', 'х'], ['ER', 'ер'], ['AY', 'ай'], ['AW', 'ау'], ['EY', 'эй'], ['OW', 'оу'], ['OY', 'ой'],
  ['AA', 'а'], ['AE', 'э'], ['AH', 'а'], ['AO', 'о'], ['EH', 'э'], ['IH', 'и'], ['IY', 'и'],
  ['UH', 'у'], ['UW', 'у'], ['B', 'б'], ['D', 'д'], ['F', 'ф'], ['G', 'г'], ['K', 'к'],
  ['L', 'л'], ['M', 'м'], ['N', 'н'], ['P', 'п'], ['R', 'р'], ['S', 'с'], ['T', 'т'], ['V', 'в'],
  ['W', 'в'], ['Y', 'й'], ['Z', 'з'],
];

function capitalizeLike(original: string, translated: string): string {
  if (!original || !translated) return translated;
  if (original[0] === original[0]?.toUpperCase() && original[0] !== original[0]?.toLowerCase()) {
    return translated.charAt(0).toUpperCase() + translated.slice(1);
  }
  return translated;
}

function phonemesToRussian(phonemes: string): string {
  let s = phonemes.replace(/[0-9]/g, '');
  for (const [from, to] of PHONEME_TO_RU) {
    s = s.split(from).join(to);
  }
  return s
    .replace(/(.)\1{2,}/g, '$1$1')
    .replace(/[^а-яё\-]/gi, '')
    .trim();
}

function arpabetToRussian(arpabet: string): string {
  const tokens = arpabet.trim().split(/\s+/);
  let out = '';
  for (const raw of tokens) {
    const stress = raw.replace(/[^0-9]/g, '');
    const base = raw.replace(/[0-9]/g, '').toUpperCase();
    if (!base) continue;
    if (ARPABET_MULTI.has(base)) {
      out += PHONEME_TO_RU.find(([k]) => k === base)?.[1] ?? phonemesToRussian(base);
      continue;
    }
    if (base.length === 1) {
      out += PHONEME_TO_RU.find(([k]) => k === base)?.[1] ?? '';
    }
  }
  if (!out) out = phonemesToRussian(arpabet.replace(/[0-9]/g, ''));
  // «the» → зэ, not за
  if (/^DH\s*AH/i.test(arpabet.replace(/[0-9]/g, '')) && out === 'за') out = 'зэ';
  if (/^DH\s*AH/i.test(arpabet.replace(/[0-9]/g, '')) && out === 'zа') out = 'зэ';
  return out.replace(/(.)\1{2,}/g, '$1$1');
}

function ipaToRussian(ipa: string): string {
  let s = ipa.toLowerCase().replace(/[ˈˌ]/g, '');
  for (const [from, to] of PHONEME_TO_RU) {
    if (from.length <= 2 || from.startsWith('DH') || from.startsWith('AA')) continue;
    s = s.split(from).join(to);
  }
  let out = '';
  let i = 0;
  while (i < s.length) {
    let matched = false;
    for (const [from, to] of PHONEME_TO_RU.sort((a, b) => b[0].length - a[0].length)) {
      if (s.startsWith(from, i)) {
        out += to;
        i += from.length;
        matched = true;
        break;
      }
    }
    if (!matched) i += 1;
  }
  out = out.replace(/(.)\1{2,}/g, '$1$1');
  if (s === 'ðə' || s === 'ða') out = 'зэ';
  return out;
}

function lookupCmu(word: string): string | null {
  const key = word.toLowerCase().replace(/['']/g, '').replace(/\./g, '');
  if (!key) return null;
  const hit = cmuDictionary[key as keyof typeof cmuDictionary];
  if (typeof hit === 'string') return hit;
  for (let n = 2; n <= 5; n += 1) {
    const alt = cmuDictionary[`${key}(${n})` as keyof typeof cmuDictionary];
    if (typeof alt === 'string') return alt;
  }
  return null;
}

function predictEnglishPhonemes(word: string): string {
  const cmu = lookupCmu(word);
  if (cmu) return cmu;
  const ipa = getG2p().predict(word);
  if (ipa) return ipa;
  return '';
}

function normalizeEnglishToken(raw: string): { core: string; punct: string } {
  const punct = raw.match(/[.!?…;:,'"]+$/)?.[0] ?? '';
  let core = punct ? raw.slice(0, -punct.length) : raw;
  core = core.replace(/['']/g, '');
  if (/^co\.?$/i.test(core)) core = 'co';
  if (/^no\.?$/i.test(core)) core = 'no';
  if (/^dr\.?$/i.test(core)) core = 'doctor';
  if (/^mr\.?$/i.test(core)) core = 'mister';
  if (/^ms\.?$/i.test(core)) core = 'miss';
  return { core, punct };
}

/** One English token → Cyrillic phonetic for Silero. */
export function englishWordToRussianPhonetic(word: string): string {
  if (!word || !/[A-Za-z]/.test(word)) return word;
  if (word === '&') return 'энд';

  const { core, punct } = normalizeEnglishToken(word);
  if (!core) return word;

  const override = PHONETIC_OVERRIDES[core.toLowerCase()];
  if (override) return capitalizeLike(core, override) + punct;

  if (/^[A-Z]{2,8}$/.test(core)) {
    const spelled = core
      .split('')
      .map((ch) => englishWordToRussianPhonetic(ch))
      .join('-');
    return spelled + punct;
  }

  const cmu = lookupCmu(core);
  let ru: string;
  if (cmu) {
    ru = arpabetToRussian(cmu);
  } else {
    const ipa = getG2p().predict(core);
    ru = ipa ? ipaToRussian(ipa) : '';
  }

  if (!ru || /[A-Za-z]/.test(ru)) {
    const parts = splitCompoundWord(core);
    if (parts.length > 1) {
      ru = parts.map((p) => englishWordToRussianPhonetic(p)).join('');
    }
  }

  if (!ru) return word;
  return capitalizeLike(core, ru) + punct;
}

function splitCompoundWord(word: string): string[] {
  const bare = word.replace(/[^A-Za-z0-9]/g, '');
  if (bare.length < 5) return [word];

  const camel = bare.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/);
  if (camel.length > 1) return camel;

  for (let i = 3; i < bare.length - 2; i += 1) {
    const left = bare.slice(0, i);
    const right = bare.slice(i);
    if (lookupCmu(left) && (lookupCmu(right) || getG2p().predict(right))) {
      return [left, right];
    }
  }
  return [word];
}

/** Latin phrase → Cyrillic phonetic (word-wise). */
export function englishPhraseToRussianPhonetic(phrase: string): string {
  const trimmed = phrase.trim();
  if (!trimmed || !/[A-Za-z]/.test(trimmed)) return trimmed;

  return trimmed
    .split(/\s+/)
    .map((token) => englishWordToRussianPhonetic(token))
    .join(' ');
}

export function hasLatinAfterPhonetic(text: string): boolean {
  return /[A-Za-zÀ-ÿ]{2,}/.test(text);
}
