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

/** Служебные EN-слова в названиях — без ударения, слитно с соседями. */
const EN_FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'by', 'and', 'or', 'from', 'with', 'as',
]);

const FUNCTION_WORD_RU: Record<string, string> = {
  the: 'зэ',
  in: 'ин',
  of: 'ов',
  by: 'бай',
  a: 'э',
  an: 'эн',
  to: 'ту',
  for: 'фор',
  and: 'энд',
  or: 'ор',
  at: 'эт',
  from: 'фром',
  with: 'уиз',
  on: 'он',
  as: 'эз',
};

/** Целые фразы (артист / трек) — CMU по словам даёт мусор на «the/in/by». */
const MUSIC_PHRASE_PHONETIC: Record<string, string> = {
  'red hot chili peppers': 'р+эд х+от ч+или п+эпэрз',
  'killing in the name': 'к+илинг ин зэ н+эйм',
  'killing in the name of': 'к+илинг ин зэ н+эйм ов',
  'rage against the machine': 'р+эйдж аг+энст зэ маш+ин',
  'stadium arcadium': 'ст+эйдиам арк+эйдиам',
  'michael jackson': 'м+айкл дж+эксон',
  'snow (hey oh)': 'сн+оу хей оу',
  'snow': 'сн+оу',
  'hey oh': 'хей оу',
  'thriller': 'тр+иллер',
};

const PHONETIC_OVERRIDES: Record<string, string> = {
  co: 'ко',
  hot: 'х+от',
  mtv: 'эм-ти-ви',
  cd: 'си-ди',
  flac: 'флак',
  mp3: 'эм-пи-три',
  rb: 'ар-би',
  dj: 'ди-джей',
  feat: 'фит',
  michael: 'м+айкл',
  jackson: 'дж+эксон',
  arcadium: 'арк+эйдиам',
  stadium: 'ст+эйдиам',
  rage: 'р+эйдж',
  against: 'аг+энст',
  machine: 'маш+ин',
  killing: 'к+илинг',
  name: 'н+эйм',
  peppers: 'п+эпэрз',
  chili: 'ч+или',
  snow: 'сн+оу',
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

  if (s === 'ðə' || s === 'ða') return 'зэ';
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

function functionWordPhonetic(core: string, format: PhoneticFormat): string {
  const ru = FUNCTION_WORD_RU[core.toLowerCase()] ?? core.toLowerCase();
  return format === 'edge' ? ru : ru;
}

function lookupMusicPhrasePhonetic(phrase: string, format: PhoneticFormat): string | null {
  const key = phrase.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*&\s*/g, ' and ');
  const hit = MUSIC_PHRASE_PHONETIC[key];
  if (!hit) return null;
  return format === 'edge' ? sileroPhoneticToEdge(hit) : hit;
}

function wordToRussianPhoneticCore(core: string, format: PhoneticFormat = 'silero'): string {
  if (EN_FUNCTION_WORDS.has(core.toLowerCase())) {
    return functionWordPhonetic(core, format);
  }

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

/** Edge TTS: one uppercase = stressed vowel only. No word caps — Dmitry reads «ПЭ» as «пэ-плюс». */
export function sileroPhoneticToEdge(text: string): string {
  return text
    .toLowerCase()
    .replace(/\+([аеёиоуыэюя])/gi, (_, v: string) => v.toUpperCase());
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
  if (format === 'edge') return ru + punct;
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

/** Latin phrase → Cyrillic phonetic (phrase dict → word-wise). */
export function englishPhraseToRussianPhonetic(
  phrase: string,
  format: PhoneticFormat = 'silero',
): string {
  const trimmed = phrase.trim();
  if (!trimmed || !/[A-Za-z]/.test(trimmed)) return trimmed;

  const phraseHit = lookupMusicPhrasePhonetic(trimmed, format);
  if (phraseHit) return phraseHit;

  return trimmed
    .split(/\s+/)
    .map((token) => englishWordToRussianPhonetic(token, format))
    .join(' ');
}

export interface PhoneticTranscriptLine {
  token: string;
  source: string;
  phonemes: string;
  silero: string;
  edge: string;
}

/** Подробная расшифровка EN→RU для отладки / demo-transcripts. */
export function englishPhrasePhoneticTranscript(phrase: string): {
  phrase: string;
  phraseSilero: string;
  phraseEdge: string;
  words: PhoneticTranscriptLine[];
} {
  const trimmed = phrase.trim();
  const phraseSilero = englishPhraseToRussianPhonetic(trimmed, 'silero');
  const phraseEdge = englishPhraseToRussianPhonetic(trimmed, 'edge');
  const phraseOverride = lookupMusicPhrasePhonetic(trimmed, 'silero');

  const words: PhoneticTranscriptLine[] = trimmed.split(/\s+/).map((token) => {
    if (phraseOverride) {
      return {
        token,
        source: 'phrase-override',
        phonemes: '',
        silero: '(phrase)',
        edge: '(phrase)',
      };
    }
    const d = englishPhoneticDebug(token);
    return {
      token,
      source: d.source,
      phonemes: d.phonemes,
      silero: d.ru,
      edge: d.ruEdge,
    };
  });

  return { phrase: trimmed, phraseSilero, phraseEdge, words };
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
