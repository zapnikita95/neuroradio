/**
 * English → Russian Cyrillic phonetic transcription for Silero / Edge RU.
 * CMU dict (134k) + phonemize G2P; stress (+) follows English primary stress.
 */
import { createRequire } from 'node:module';
import { dictionary as cmuDictionary } from 'cmu-pronouncing-dictionary';

const require = createRequire(import.meta.url);

type G2PProcessor = { predict: (word: string) => string | null };

let g2p: G2PProcessor | null = null;

function getG2p(): G2PProcessor {
  if (!g2p) {
    const { G2PModel } = require('phonemize/en-g2p') as { G2PModel: new () => G2PProcessor };
    g2p = new G2PModel();
  }
  return g2p;
}

const ARPABET_VOWELS = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
]);

const ARPABET_TO_RU: Record<string, string> = {
  // vowels handled with stress in arpabetTokenToRu
  AA: 'а', AE: 'э', AH: 'а', AO: 'о', AW: 'ау', AY: 'ай',
  EH: 'э', EY: 'эй', IH: 'и', IY: 'и', OW: 'оу', OY: 'ой',
  UH: 'у', UW: 'у',
  DH: 'з', TH: 'с', SH: 'ш', CH: 'ч', JH: 'дж', ZH: 'ж', NG: 'нг', HH: 'х',
  B: 'б', D: 'д', F: 'ф', G: 'г', K: 'к', L: 'л', M: 'м', N: 'н',
  P: 'п', R: 'р', S: 'с', T: 'т', V: 'в', W: 'в', Y: 'й', Z: 'з',
};

function arpabetTokenToRu(tok: ParsedPhoneme): string {
  if (tok.base === 'ER') return tok.stress === 1 ? 'ёр' : 'эр';
  return ARPABET_TO_RU[tok.base] ?? '';
}

/** Longest IPA chunks first — vowels include stress-bearing nuclei. */
const IPA_TO_RU: Array<[string, string]> = [
  ['tʃ', 'ч'], ['dʒ', 'дж'], ['aɪ', 'ай'], ['aʊ', 'ау'], ['eɪ', 'эй'], ['oʊ', 'оу'], ['ɔɪ', 'ой'],
  ['iə', 'иа'], ['iən', 'иан'], ['uə', 'уа'], ['ɪŋ', 'инг'], ['iː', 'и'], ['uː', 'у'], ['ɜː', 'ёр'],
  ['ɔː', 'о'], ['ɑː', 'а'], ['ɝ', 'ёр'], ['ɚ', 'эр'], ['ɡ', 'г'], ['ɹ', 'р'], ['ɫ', 'л'],
  ['ʃ', 'ш'], ['ʒ', 'ж'], ['θ', 'с'], ['ð', 'з'], ['ŋ', 'нг'], ['j', 'й'], ['w', 'в'], ['h', 'х'],
  ['æ', 'э'], ['ɑ', 'а'], ['ɒ', 'о'], ['ə', 'а'], ['ɛ', 'э'], ['ɪ', 'и'], ['i', 'и'],
  ['ɔ', 'о'], ['ʊ', 'у'], ['u', 'у'], ['ʌ', 'а'], ['a', 'а'], ['e', 'э'], ['o', 'о'],
  ['b', 'б'], ['d', 'д'], ['f', 'ф'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'],
  ['p', 'п'], ['r', 'р'], ['s', 'с'], ['z', 'з'], ['t', 'т'], ['v', 'в'], ['x', 'кс'],
];

const IPA_TO_RU_SORTED = [...IPA_TO_RU].sort((a, b) => b[0].length - a[0].length);

const PHONETIC_OVERRIDES: Record<string, string> = {
  co: 'ко',
  hot: 'х+от',
  the: 'з+э',
  mtv: 'эм-ти-ви',
  cd: 'си-ди',
  flac: 'флак',
  mp3: 'эм-пи-три',
  rb: 'ар-би',
  dj: 'ди-джей',
  feat: 'фит',
};

const CYR_VOWEL = /[аеёиоуыэюя]/i;

export type PhoneticFormat = 'silero' | 'edge';

/** Silero: + before vowel. Edge: uppercase stressed vowel (no + — Edge reads «плюс»). */
function applyStressMark(chunk: string, format: PhoneticFormat): string {
  if (!chunk) return format === 'silero' ? '+' : '';
  const m = chunk.match(CYR_VOWEL);
  if (!m || m.index === undefined) return format === 'silero' ? `+${chunk}` : chunk;
  if (format === 'silero') {
    return `${chunk.slice(0, m.index)}+${chunk.slice(m.index)}`;
  }
  const v = chunk.charAt(m.index);
  return (
    chunk.slice(0, m.index) +
    v.toUpperCase() +
    chunk.slice(m.index + 1)
  );
}

function insertStressBeforeVowel(chunk: string): string {
  return applyStressMark(chunk, 'silero');
}

function collapseRu(s: string): string {
  return s.replace(/(.)\1{2,}/g, '$1$1').trim();
}

interface ParsedPhoneme {
  base: string;
  stress: 0 | 1 | 2;
}

function parseArpabetTokens(arpabet: string): ParsedPhoneme[] {
  return arpabet
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const stress = Number(raw.replace(/[^0-9]/g, '') || '0') as 0 | 1 | 2;
      const base = raw.replace(/[0-9]/g, '').toUpperCase();
      return { base, stress };
    });
}

function arpabetToRussianStressed(arpabet: string, format: PhoneticFormat = 'silero'): string {
  let out = '';
  for (const tok of parseArpabetTokens(arpabet)) {
    const chunk = arpabetTokenToRu(tok);
    if (!chunk) continue;
    const isVowel = ARPABET_VOWELS.has(tok.base) || tok.base === 'ER';
    out += isVowel && tok.stress === 1
      ? applyStressMark(chunk, format)
      : chunk;
  }
  return collapseRu(out);
}

function ipaToRussianStressed(ipa: string, format: PhoneticFormat = 'silero'): string {
  const s = ipa.toLowerCase().replace(/[ː]/g, '');
  let out = '';
  let i = 0;
  let stressNext = false;

  while (i < s.length) {
    const ch = s[i]!;
    if (ch === 'ˈ') {
      stressNext = true;
      i += 1;
      continue;
    }
    if (ch === 'ˌ') {
      i += 1;
      continue;
    }

    let matched = false;
    for (const [from, to] of IPA_TO_RU_SORTED) {
      if (!s.startsWith(from, i)) continue;
      let chunk = to;
      if (stressNext && CYR_VOWEL.test(chunk)) {
        chunk = applyStressMark(chunk, format);
        stressNext = false;
      }
      out += chunk;
      i += from.length;
      matched = true;
      break;
    }
    if (!matched) i += 1;
  }

  if (s === 'ðə' || s === 'ða') return format === 'silero' ? 'з+э' : 'зЭ';
  return collapseRu(out);
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

function capitalizeLike(original: string, translated: string): string {
  if (!original || !translated) return translated;
  if (original[0] === original[0]?.toUpperCase() && original[0] !== original[0]?.toLowerCase()) {
    const idx = translated.search(/[а-яё]/i);
    if (idx >= 0) {
      return (
        translated.slice(0, idx) +
        translated.charAt(idx).toUpperCase() +
        translated.slice(idx + 1)
      );
    }
  }
  return translated;
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

function wordToRussianPhoneticCore(core: string, format: PhoneticFormat = 'silero'): string {
  const override = PHONETIC_OVERRIDES[core.toLowerCase()];
  if (override) {
    return format === 'edge' ? sileroPhoneticToEdge(override) : override;
  }

  if (/^[A-Z]{2,8}$/.test(core)) {
    return core
      .split('')
      .map((ch) => wordToRussianPhoneticCore(ch.toLowerCase(), format))
      .join('-');
  }

  const cmu = lookupCmu(core);
  if (cmu) return arpabetToRussianStressed(cmu, format);

  const ipa = getG2p().predict(core);
  if (ipa) {
    const ru = ipaToRussianStressed(ipa, format);
    if (ru && !/[A-Za-z]/.test(ru)) return ru;
  }

  const parts = splitCompoundWord(core);
  if (parts.length > 1) {
    return parts.map((p) => wordToRussianPhoneticCore(p, format)).join('');
  }

  return '';
}

/** Edge TTS: strip Silero + marks, keep uppercase stress vowels. */
export function sileroPhoneticToEdge(text: string): string {
  return text.replace(/\+([аеёиоуыэюя])/gi, (_, v: string) => v.toUpperCase());
}

/** One English token → Cyrillic phonetic with English-aligned stress. */
export function englishWordToRussianPhonetic(
  word: string,
  format: PhoneticFormat = 'silero',
): string {
  if (!word || !/[A-Za-z]/.test(word)) return word;
  if (word === '&') return 'энд';

  const { core, punct } = normalizeEnglishToken(word);
  if (!core) return word;

  const ru = wordToRussianPhoneticCore(core, format);
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
export function englishPhraseToRussianPhonetic(
  phrase: string,
  format: PhoneticFormat = 'silero',
): string {
  const trimmed = phrase.trim();
  if (!trimmed || !/[A-Za-z]/.test(trimmed)) return trimmed;
  return trimmed.split(/\s+/).map((token) => englishWordToRussianPhonetic(token, format)).join(' ');
}

export function hasLatinAfterPhonetic(text: string): boolean {
  return /[A-Za-zÀ-ÿ]{2,}/.test(text);
}

/** Debug: CMU/G2P source for a word. */
export function englishPhoneticDebug(word: string): {
  word: string;
  source: 'override' | 'cmu' | 'g2p' | 'compound' | 'none';
  phonemes: string;
  ru: string;
  ruEdge: string;
} {
  const { core } = normalizeEnglishToken(word);
  if (PHONETIC_OVERRIDES[core.toLowerCase()]) {
    const ru = PHONETIC_OVERRIDES[core.toLowerCase()]!;
    return {
      word: core,
      source: 'override',
      phonemes: '',
      ru,
      ruEdge: sileroPhoneticToEdge(ru),
    };
  }
  const cmu = lookupCmu(core);
  if (cmu) {
    return {
      word: core,
      source: 'cmu',
      phonemes: cmu,
      ru: arpabetToRussianStressed(cmu),
      ruEdge: arpabetToRussianStressed(cmu, 'edge'),
    };
  }
  const ipa = getG2p().predict(core) ?? '';
  const ru = ipa ? ipaToRussianStressed(ipa) : '';
  return {
    word: core,
    source: ipa ? 'g2p' : 'none',
    phonemes: ipa,
    ru,
    ruEdge: ipa ? ipaToRussianStressed(ipa, 'edge') : '',
  };
}
