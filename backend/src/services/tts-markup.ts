/**
 * Yandex SpeechKit TTS markup (API v1, text format).
 * @see https://aistudio.yandex.ru/docs/ru/speechkit/tts/markup/tts-markup.html
 */

import { sanitizeScriptForTts } from './story-quality.js';
import { applyRussianStressSafe, RUSSIAN_STRESS } from './russian-stress.js';
import { runTtsQualityPass } from './tts-quality-pass.js';
import {
  applyForeignPronunciation,
  applyForeignPronunciationWithReplacements,
  preserveMusicProperNames,
} from './tts-foreign-pronounce.js';
import { stripYandexPauseMarkup } from './tts-azure-ssml.js';
import { enhanceMixedLanguageText } from './tts-en-normalize.js';
import { normalizeYearsForRussianTts } from './tts-russian-years.js';
import type { SileroTtsTextTrace } from './tts-silero-transcript.js';
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
  const tag = profile === 'tight' ? '<[sentence]>' : pauseTag(profile, 'medium');
  return text.replace(/([.!?…])(\s+)(?=[А-ЯЁа-яё«])/g, `$1 ${tag}$2`);
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

/** Латинские названия треков/песен — без «в кавычках», только текст. */
function isForeignSongTitleQuote(phrase: string): boolean {
  const latin = (phrase.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  const cyrillic = (phrase.match(/[а-яёА-ЯЁ]/g) ?? []).length;
  return latin >= 2 && latin >= cyrillic;
}

/** «слово» → «в кавычках слово» для русских цитат; иностранные треки — без обёртки. */
const SONG_CONTEXT_BEFORE_QUOTE =
  /(?:песн\S*|трек\S*|хит\S*|сингл\S*|композици\S*|альбом\S*)\s*$/i;

function expandQuotesForSpeech(text: string): string {
  return text.replace(/«([^»]+)»/g, (_match, inner: string, offset: number, whole: string) => {
    const phrase = inner.trim();
    if (!phrase) return '';
    if (isForeignSongTitleQuote(phrase)) return phrase;
    const before = whole.slice(Math.max(0, offset - 48), offset);
    if (SONG_CONTEXT_BEFORE_QUOTE.test(before)) return phrase;
    return `в кавычках ${phrase}`;
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
  const pauseProfile = options.pauseProfile ?? 'tight';

  let text = preserveMusicProperNames(script, artist, title);
  text = sanitizeScriptForTts(text, artist, title);
  const quality = runTtsQualityPass(text);
  text = quality.text;

  text = normalizeYearsForRussianTts(text);
  text = expandQuotesForSpeech(text);
  text = applyRussianStressSafe(text);

  if (options.sentencePauses !== false) {
    text = addSentencePauses(text, pauseProfile);
    text = addCommaPauses(text, pauseProfile);
    text = addDashPauses(text, pauseProfile);
    text = addQuotePauses(text, pauseProfile);
  }

  text = enhanceMixedLanguageText(text, artist, title);
  text = applyForeignPronunciation(text, artist, title);

  return collapseMarkupWhitespace(text);
}

/**
 * Plain Russian text for Silero / other engines without SSML:
 * same sanitize → polish → quotes → stress as Yandex, then Latin → Cyrillic transliteration.
 */
export function prepareSileroTtsTextTrace(
  script: string,
  options: TtsMarkupOptions = {},
): SileroTtsTextTrace {
  const artist = options.artist ?? '';
  const title = options.title ?? '';

  const originalScript = script;
  const afterProperNames = preserveMusicProperNames(script, artist, title);
  const { text: afterLatinTransliteration, replacements: latinReplacements } =
    applyForeignPronunciationWithReplacements(afterProperNames, artist, title);

  let text = afterLatinTransliteration;
  text = sanitizeScriptForTts(text, artist, title);
  text = runTtsQualityPass(text).text;
  text = normalizeYearsForRussianTts(text);
  text = expandQuotesForSpeech(text);
  text = applyRussianStressSafe(text);
  const prepared = stripYandexPauseMarkup(text);

  return {
    originalScript,
    artist,
    title,
    afterProperNames,
    afterLatinTransliteration,
    latinReplacements,
    prepared,
  };
}

export function prepareSileroTtsText(
  script: string,
  options: TtsMarkupOptions = {},
): string {
  return prepareSileroTtsTextTrace(script, options).prepared;
}

export { STRESS_OVERRIDES, RUSSIAN_STRESS };
