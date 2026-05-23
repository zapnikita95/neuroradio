/**
 * Yandex SpeechKit TTS markup (API v1, text format).
 * @see https://aistudio.yandex.ru/docs/ru/speechkit/tts/markup/tts-markup.html
 *
 * Cyrillic: server-side stress via + (dictionary).
 * Latin/English: left as-is — Yandex reads names and titles natively.
 */

import { sanitizeScriptForTts } from './story-quality.js';
import { applyRussianStress, RUSSIAN_STRESS } from './russian-stress.js';

/** @deprecated use RUSSIAN_STRESS from russian-stress.ts */
const STRESS_OVERRIDES = RUSSIAN_STRESS;

export interface TtsMarkupOptions {
  artist?: string;
  title?: string;
  /** Add short pauses between sentences */
  sentencePauses?: boolean;
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
 * - Russian stress via + (dictionary) — Cyrillic only
 * - Latin tokens unchanged (artist names, song titles)
 * - natural pauses between sentences
 */
export function prepareYandexTtsText(
  script: string,
  options: TtsMarkupOptions = {},
): string {
  const artist = options.artist ?? '';
  const title = options.title ?? '';
  let text = sanitizeScriptForTts(script, artist, title);
  text = applyRussianStress(text);
  if (options.sentencePauses !== false) {
    text = addSentencePauses(text);
  }
  return collapseMarkupWhitespace(text);
}

export { STRESS_OVERRIDES, RUSSIAN_STRESS };
