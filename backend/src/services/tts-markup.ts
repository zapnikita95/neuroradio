/**
 * Yandex SpeechKit TTS markup (API v1, text format).
 * @see https://aistudio.yandex.ru/docs/ru/speechkit/tts/markup/tts-markup.html
 * @see https://aistudio.yandex.ru/docs/ru/speechkit/tts/markup/tts-supported-phonemes.html
 */

import { sanitizeScriptForTts } from './story-quality.js';

/** Valid Russian TTS phonemes (IPA subset from Yandex docs) */
const VALID_PHONEME =
  /^(?:bʲ|b|dʲ|d|fʲ|f|gʲ|g|j|kʲ|k|lʲ|l|mʲ|m|nʲ|n|pʲ|p|rʲ|r|sʲ|s|ʂ|tʲ|t|t͡s|t͡ɕ|vʲ|v|xʲ|x|zʲ|z|ʐ|ɕː|ə|a|ʌ|ɛ|i|ɪ|ɨ|ɔ|u|ʊ)$/;

/** Words that TTS often mis-stresses in our stories → Yandex + markup */
const STRESS_OVERRIDES: Record<string, string> = {
  атлас: '+атлас',
  атласе: '+атласе',
  барабан: 'бараб+ан',
  батарея: 'батар+ея',
  батарее: 'батар+ее',
  берет: 'бер+ет',
  бизнес: 'б+изнес',
  было: 'б+ыло',
  важный: 'в+ажный',
  версии: 'в+ерсии',
  версию: 'в+ерсию',
  гарлем: 'Г+арлем',
  голос: 'г+олос',
  дубль: 'д+убль',
  дух: 'д+ух',
  зал: 'з+ал',
  зала: 'з+ала',
  замок: 'з+амок',
  замке: 'з+амке',
  инженер: 'инж+енер',
  инженеры: 'инж+енеры',
  инженером: 'инж+енером',
  колонках: 'кол+онках',
  колонки: 'кол+онки',
  концерт: 'конц+ерт',
  концерте: 'конц+ерте',
  кричал: 'кр+ичал',
  курьёз: 'курь+ёз',
  микрофон: 'микроф+он',
  монитор: 'мон+итор',
  монитора: 'мон+итора',
  мониторах: 'мон+иторах',
  мониторами: 'мон+иторами',
  мониторы: 'мон+иторы',
  музыканты: 'музык+анты',
  начала: 'нач+ала',
  ноте: 'н+оте',
  ноту: 'н+оту',
  одержим: 'од+ержим',
  одержимый: 'од+ержимый',
  па: 'п+а',
  плащ: 'пл+ащ',
  плащом: 'пл+ащом',
  продюсер: 'прод+юсер',
  продюсеры: 'прод+юсеры',
  радиола: 'ради+ола',
  радиолы: 'ради+олы',
  раздевалке: 'раздев+алке',
  реакция: 'ре+акция',
  реакцию: 'ре+акцию',
  ритуал: 'риту+ал',
  свист: 'св+ист',
  свиста: 'св+иста',
  сезон: 'сез+он',
  сезона: 'сез+она',
  сингл: 'с+ингл',
  сингла: 'с+ингла',
  соседи: 'сос+еди',
  студии: 'ст+удии',
  студию: 'ст+удию',
  студия: 'ст+удия',
  телешоу: 'телеш+оу',
  тогда: 'тогд+а',
  удар: 'уд+ар',
  фирменным: 'ф+ирменным',
  фраза: 'фр+аза',
  фразу: 'фр+азу',
  хит: 'х+ит',
  эфир: 'эф+ир',
  эфире: 'эф+ире',
  эпоха: 'эп+оха',
  краснели: 'красн+ели',
  мониторов: 'мон+иторов',
  звукорежиссёры: 'звукореж+иссёры',
  звукорежиссёра: 'звукореж+иссёра',
  эпохе: 'эп+охе',
};

const LATIN_DIGRAPH: Array<[RegExp, string]> = [
  [/sch/gi, 'ʂ'],
  [/sh/gi, 'ʂ'],
  [/ch/gi, 't͡ɕ'],
  [/zh/gi, 'ʐ'],
  [/th/gi, 't'],
  [/ph/gi, 'f'],
  [/ck/gi, 'k'],
  [/qu/gi, 'k v'],
  [/x/gi, 'k s'],
];

const LATIN_CHAR: Record<string, string> = {
  a: 'a',
  b: 'b',
  c: 'k',
  d: 'd',
  e: 'ɛ',
  f: 'f',
  g: 'g',
  h: 'x',
  i: 'i',
  j: 'dʲ',
  k: 'k',
  l: 'l',
  m: 'm',
  n: 'n',
  o: 'o',
  p: 'p',
  q: 'k',
  r: 'r',
  s: 's',
  t: 't',
  u: 'u',
  v: 'v',
  w: 'v',
  y: 'j',
  z: 'z',
  á: 'a',
  é: 'ɛ',
  í: 'i',
  ó: 'o',
  ú: 'u',
  ñ: 'nʲ',
  ç: 's',
};

export interface TtsMarkupOptions {
  artist?: string;
  title?: string;
  /** Add short pauses between sentences */
  sentencePauses?: boolean;
}

function normalizeUnicodeStress(text: string): string {
  return text
    .normalize('NFC')
    .replace(/([аеёиоуыэюяАЕЁИОУЫЭЮЯ])[\u0301\u0300]/gi, '+$1')
    .replace(/([аеёиоуыэюя])́/gi, '+$1');
}

function applyStressDictionary(word: string): string {
  if (word.includes('+') || word.includes('[[')) return word;
  const lower = word.toLowerCase();
  const override = STRESS_OVERRIDES[lower];
  if (!override) return word;
  if (word[0] === word[0].toUpperCase()) {
    return override.charAt(0).toUpperCase() + override.slice(1);
  }
  return override;
}

function latinWordToPhonemes(word: string): string | null {
  if (!word || !/[a-z\u00C0-\u024F]/i.test(word)) return null;

  let src = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [pattern, replacement] of LATIN_DIGRAPH) {
    src = src.replace(pattern, ` ${replacement} `);
  }

  const phonemes: string[] = [];
  for (const ch of src.toLowerCase()) {
    if (ch === ' ' || ch === '-' || ch === "'") continue;
    if (/[0-9]/.test(ch)) {
      phonemes.push(ch);
      continue;
    }
    const mapped = LATIN_CHAR[ch];
    if (mapped) {
      for (const p of mapped.split(/\s+/)) {
        if (p) phonemes.push(p);
      }
    }
  }

  if (phonemes.length === 0) return null;
  return phonemes.filter((p) => VALID_PHONEME.test(p) || /^\d+$/.test(p)).join(' ');
}

function wrapLatinToken(token: string): string {
  if (!/[a-z\u00C0-\u024F]/i.test(token)) return token;
  if (token.includes('[[') || token.includes('+')) return token;

  const phonemes = latinWordToPhonemes(token);
  if (!phonemes) return token;
  return `[[${phonemes}]]`;
}

function processLatinSegments(text: string): string {
  return text.replace(/[«"]([^«»"]*?[a-zA-Z][^«»"]*)[»"]/g, (full, inner: string) => {
    const quoteOpen = full[0];
    const quoteClose = full[full.length - 1];
    const processed = inner
      .split(/(\s+)/)
      .map((chunk) => (/\s+/.test(chunk) ? chunk : wrapLatinToken(chunk)))
      .join('');
    return `${quoteOpen}${processed}${quoteClose}`;
  });
}

function processBareLatinNames(text: string, artist?: string, title?: string): string {
  let result = text;
  const words = [
    ...(artist?.split(/\s+/) ?? []),
    ...(title?.split(/\s+/) ?? []),
  ].filter((w) => w.length >= 2 && /[a-z]/i.test(w));

  for (const word of words) {
    const phonemes = latinWordToPhonemes(word);
    if (!phonemes) continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<!\\[\\[)\\b${escaped}\\b(?!\\]\\])`, 'giu');
    result = result.replace(re, `[[${phonemes}]]`);
  }
  return result;
}

function processRussianWords(text: string): string {
  return text.replace(/[а-яёА-ЯЁ][а-яёА-ЯЁ+\-]*/g, (word) => applyStressDictionary(word));
}

function addSentencePauses(text: string): string {
  return text.replace(/([.!?…])(\s+)(?=[А-ЯЁа-яё])/g, '$1 <[small]>$2');
}

function collapseMarkupWhitespace(text: string): string {
  return text.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Prepare story script for Yandex SpeechKit TTS:
 * - sanitize numbers for TTS
 * - Russian stress via + (dictionary + unicode normalization)
 * - Latin artist/title tokens via [[phonemes]]
 * - natural pauses between sentences
 */
export function prepareYandexTtsText(
  script: string,
  options: TtsMarkupOptions = {},
): string {
  const artist = options.artist ?? '';
  const title = options.title ?? '';
  let text = sanitizeScriptForTts(script, artist, title);
  text = normalizeUnicodeStress(text);
  text = processLatinSegments(text);
  text = processBareLatinNames(text, artist, title);
  text = processRussianWords(text);
  if (options.sentencePauses !== false) {
    text = addSentencePauses(text);
  }
  return collapseMarkupWhitespace(text);
}

/** For tests / debugging */
export function latinToPhonemeBlock(word: string): string | null {
  const phonemes = latinWordToPhonemes(word);
  return phonemes ? `[[${phonemes}]]` : null;
}

export { STRESS_OVERRIDES, VALID_PHONEME };
