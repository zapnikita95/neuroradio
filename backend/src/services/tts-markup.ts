/**
 * Yandex SpeechKit TTS markup (API v1, text format).
 * @see https://aistudio.yandex.ru/docs/ru/speechkit/tts/markup/tts-markup.html
 * @see https://aistudio.yandex.ru/docs/ru/speechkit/tts/markup/tts-supported-phonemes.html
 */

import { sanitizeScriptForTts } from './story-quality.js';
import { englishWordToPhonemes, wrapLatinWord, VALID_PHONEME } from './english-phonemes.js';

/** Valid Russian TTS phonemes — re-export for tests */
export { VALID_PHONEME };

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

const LATIN_TOKEN = /\b[A-Za-z][A-Za-z0-9'’\-]*\b|\b\d+[A-Za-z]+\b|\b[A-Za-z]+\d+\b/g;

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

function processAllLatinWords(text: string): string {
  return text.replace(LATIN_TOKEN, (word) => wrapLatinWord(word));
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
  text = processAllLatinWords(text);
  text = processRussianWords(text);
  if (options.sentencePauses !== false) {
    text = addSentencePauses(text);
  }
  return collapseMarkupWhitespace(text);
}

/** For tests / debugging */
export function latinToPhonemeBlock(word: string): string | null {
  const phonemes = englishWordToPhonemes(word);
  return phonemes ? `[[${phonemes}]]` : null;
}

export { STRESS_OVERRIDES };
