/**
 * Yandex SpeechKit TTS markup (API v1, text format).
 * @see https://aistudio.yandex.ru/docs/ru/speechkit/tts/markup/tts-markup.html
 */

import { sanitizeScriptForTts } from './story-quality.js';
import { applyRussianStressSafe, RUSSIAN_STRESS } from './russian-stress.js';
import { runTtsQualityPass } from './tts-quality-pass.js';
import {
  applyForeignPronunciation,
  preserveMusicProperNames,
} from './tts-foreign-pronounce.js';
import { enhanceMixedLanguageText } from './tts-en-normalize.js';
import {
  normalizeYandexSpeechTokens,
} from './tts-yandex-normalize.js';
import { normalizeYearsForRussianTts } from './tts-russian-years.js';
import type { TtsPauseProfile } from './tts-voice-profiles.js';

/** @deprecated use RUSSIAN_STRESS from russian-stress.ts */
const STRESS_OVERRIDES = RUSSIAN_STRESS;

export interface TtsMarkupOptions {
  artist?: string;
  title?: string;
  sentencePauses?: boolean;
  pauseProfile?: TtsPauseProfile;
  /** false / omitted → не подставлять artist/title в sanitize (озвучка без названий). */
  speakTrackNamesInVoiceover?: boolean;
  /** Статические демо efir-ai.ru: кириллическая транслитерация, без «в кавычках» и без SSML lang. */
  websitePreview?: boolean;
}

function markupArtistTitle(options: TtsMarkupOptions): { artist: string; title: string } {
  if (options.speakTrackNamesInVoiceover === true) {
    return { artist: options.artist ?? '', title: options.title ?? '' };
  }
  return { artist: '', title: '' };
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

/** Превью на сайте: убираем кавычки, без фразы «в кавычках». */
function stripGuillemetsForPreview(text: string): string {
  return text.replace(/«([^»]+)»/g, (_m, inner: string) => inner.trim());
}

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

/** Превью сайта: падежи имён после транслитерации. */
function fixWebsiteRussianInflection(text: string): string {
  return text
    .replace(/хореографу\s+Майкл\s+Питерс(?=\s|,|\.|!|\?|…|$)/gi, 'хореографу Майклу Питерсу')
    .replace(/убеждать\s+его(?=\s|,|\.|!|\?|…|$)/gi, 'убеждать Джона Ландиса')
    .replace(/убеждать\s+ландиса(?=\s|,|\.|!|\?|…|$)/gi, 'убеждать Джона Ландиса')
    .replace(/убеждал\s+его(?=\s|,|\.|!|\?|…|$)/gi, 'убеждал Джона Ландиса')
    .replace(/убеждал\s+ландиса(?=\s|,|\.|!|\?|…|$)/gi, 'убеждал Джона Ландиса');
}

/**
 * Prepare story script for Yandex SpeechKit TTS:
 * sanitize → polish → stress → pauses → Latin kept for SSML <lang en-US>.
 */
export function prepareYandexTtsText(
  script: string,
  options: TtsMarkupOptions = {},
): string {
  const { artist, title } = markupArtistTitle(options);
  const pauseProfile = options.pauseProfile ?? 'tight';

  let text = preserveMusicProperNames(script, artist, title);
  text = sanitizeScriptForTts(text, artist, title, [], {
    speakTrackNamesInVoiceover: options.speakTrackNamesInVoiceover,
    trackArtist: options.artist ?? '',
    trackTitle: options.title ?? '',
  });
  const quality = runTtsQualityPass(text, {
    artist: options.artist ?? '',
    title: options.title ?? '',
  });
  text = quality.text;

  text = normalizeYearsForRussianTts(text);
  text = options.websitePreview ? stripGuillemetsForPreview(text) : expandQuotesForSpeech(text);
  text = normalizeYandexSpeechTokens(text, artist, title);
  text = applyRussianStressSafe(text);

  if (options.sentencePauses !== false) {
    text = addSentencePauses(text, pauseProfile);
    text = addCommaPauses(text, pauseProfile);
    text = addDashPauses(text, pauseProfile);
    if (!options.websitePreview) text = addQuotePauses(text, pauseProfile);
  }

  text = options.websitePreview
    ? fixWebsiteRussianInflection(applyForeignPronunciation(text, artist, title))
    : enhanceMixedLanguageText(text, artist, title);

  return collapseMarkupWhitespace(text);
}

export { STRESS_OVERRIDES, RUSSIAN_STRESS };
