/**
 * Yandex SpeechKit TTS markup (API v1, text format).
 * @see https://aistudio.yandex.ru/docs/ru/speechkit/tts/markup/tts-markup.html
 * @see https://aistudio.yandex.ru/docs/ru/speechkit/tts/markup/tts-supported-phonemes.html
 */

import { sanitizeScriptForTts } from './story-quality.js';
import { englishWordToPhonemes, wrapLatinWord, VALID_PHONEME } from './english-phonemes.js';
import { applyRussianStress, RUSSIAN_STRESS } from './russian-stress.js';

/** Valid Russian TTS phonemes — re-export for tests */
export { VALID_PHONEME };

/** @deprecated use RUSSIAN_STRESS from russian-stress.ts */
const STRESS_OVERRIDES = RUSSIAN_STRESS;

const LATIN_TOKEN = /\b[A-Za-z][A-Za-z0-9'’\-]*\b|\b\d+[A-Za-z]+\b|\b[A-Za-z]+\d+\b/g;

export interface TtsMarkupOptions {
  artist?: string;
  title?: string;
  /** Add short pauses between sentences */
  sentencePauses?: boolean;
}

function processAllLatinWords(text: string): string {
  return text.replace(LATIN_TOKEN, (word) => wrapLatinWord(word));
}

function processRussianWords(text: string): string {
  return applyRussianStress(text);
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

export { STRESS_OVERRIDES, RUSSIAN_STRESS };
