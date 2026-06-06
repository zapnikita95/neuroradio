/**
 * Yandex SpeechKit TTS markup (API v1, text format).
 * @see https://aistudio.yandex.ru/docs/ru/speechkit/tts/markup/tts-markup.html
 */

import { sanitizeScriptForTts } from './story-quality.js';
import { applyRussianStress, RUSSIAN_STRESS } from './russian-stress.js';
import { enhanceMixedLanguageText } from './tts-en-normalize.js';
import { runTtsQualityPass } from './tts-quality-pass.js';
import type { TtsPauseProfile } from './tts-voice-profiles.js';

/** @deprecated use RUSSIAN_STRESS from russian-stress.ts */
const STRESS_OVERRIDES = RUSSIAN_STRESS;

export interface TtsMarkupOptions {
  artist?: string;
  title?: string;
  sentencePauses?: boolean;
  pauseProfile?: TtsPauseProfile;
}

function pauseTag(profile: TtsPauseProfile, size: 'small' | 'medium'): string {
  if (profile === 'tight' && size === 'medium') return '<[small]>';
  if (profile === 'airy' && size === 'small') return '<[medium]>';
  return `<[${size}]>`;
}

function addSentencePauses(text: string, profile: TtsPauseProfile): string {
  const small = pauseTag(profile, 'small');
  return text.replace(/([.!?…])(\s+)(?=[А-ЯЁа-яё«])/g, `$1 ${small}$2`);
}

function addCommaPauses(text: string, profile: TtsPauseProfile): string {
  if (profile === 'tight') return text;
  const small = pauseTag(profile, 'small');
  return text.replace(/,(\s+)(?=[А-ЯЁа-яё])/g, `, ${small}$1`);
}

function addDashPauses(text: string, profile: TtsPauseProfile): string {
  if (profile === 'tight') return text;
  const medium = pauseTag(profile, 'medium');
  return text
    .replace(/\s+—\s+/g, ` ${medium} `)
    .replace(/\s+-\s+/g, ` ${pauseTag(profile, 'small')} `);
}

/** «слово» → «фраза в кавычках, слово,» so SpeechKit reads quoted bits clearly. */
function expandQuotesForSpeech(text: string): string {
  return text.replace(/«([^»]+)»/g, (_match, inner: string) => {
    const phrase = inner.trim();
    if (!phrase) return '';
    return `фраза в кавычках, ${phrase},`;
  });
}

function addQuotePauses(text: string, profile: TtsPauseProfile): string {
  if (profile === 'tight') return text;
  const small = pauseTag(profile, 'small');
  const quotes: string[] = [];
  const masked = text.replace(/«[^»]+»/g, (quote) => {
    const idx = quotes.length;
    quotes.push(quote);
    return `\uE000QQ${idx}\uE001`;
  });
  let result = masked
    .replace(/«\s*/g, `«${small} `)
    .replace(/\s*»/g, ` ${small}»`);
  result = result.replace(/\uE000QQ(\d+)\uE001/g, (_, index) => quotes[Number(index)] ?? '');
  return result;
}

function collapseMarkupWhitespace(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/(<\[(?:small|medium)\]>)\s+\1/g, '$1')
    .trim();
}

/**
 * Prepare story script for Yandex SpeechKit TTS:
 * sanitize → speech quality pass → stress → RU/EN articulation → prosody pauses
 */
export function prepareYandexTtsText(
  script: string,
  options: TtsMarkupOptions = {},
): string {
  const artist = options.artist ?? '';
  const title = options.title ?? '';
  const pauseProfile = options.pauseProfile ?? 'natural';

  let text = sanitizeScriptForTts(script, artist, title);
  const quality = runTtsQualityPass(text);
  text = quality.text;

  text = expandQuotesForSpeech(text);
  text = applyRussianStress(text);
  text = enhanceMixedLanguageText(text, artist, title);

  if (options.sentencePauses !== false) {
    text = addSentencePauses(text, pauseProfile);
    text = addCommaPauses(text, pauseProfile);
    text = addDashPauses(text, pauseProfile);
    text = addQuotePauses(text, pauseProfile);
  }

  return collapseMarkupWhitespace(text);
}

export { STRESS_OVERRIDES, RUSSIAN_STRESS };
