/**
 * Edge TTS text prep — отдельно от Yandex SpeechKit.
 * Без кириллической фонетики, без +ударений и без normalizeYandexSpeechTokens.
 * Латиница → native EN/DE/FR голос Edge; кириллица → RU голос Edge.
 */

import { primaryArtistName } from './artist-primary.js';
import { sanitizeScriptForTts } from './story-quality.js';
import { runTtsQualityPass } from './tts-quality-pass.js';
import { preserveMusicProperNames } from './tts-foreign-pronounce.js';
import { normalizeGenreTermsForTts } from './tts-genre-pronounce.js';
import { mergeLatinTitleOtArtist } from './tts-yandex-ssml.js';
import {
  normalizeLatinApostrophes,
  stripApostrophesInLatinRuns,
} from './tts-yandex-normalize.js';
import { normalizeSocialPlatformsForRussianTts } from './tts-social-platforms.js';
import {
  scriptContainsLatinTrackCitation,
  shouldStripLatinTrackNames,
} from './tts-generic-script.js';

export interface EdgeTtsPrepareOptions {
  artist?: string;
  title?: string;
  speakTrackNamesInVoiceover?: boolean;
}

function stripGuillemets(text: string): string {
  return text.replace(/«([^»]+)»/g, (_m, inner: string) => inner.trim());
}

/** Один раз в начале — латиница для EN-голоса; тело текста («они», «этот трек») не трогаем. */
export function ensureEdgeLatinCitationOpener(
  script: string,
  artist: string,
  title: string,
  speakTrackNamesInVoiceover: boolean,
): string {
  const trimmed = script.trim();
  if (!speakTrackNamesInVoiceover || !trimmed) return trimmed;

  const stripTitle = shouldStripLatinTrackNames(title);
  const stripArtist = shouldStripLatinTrackNames(artist);
  if (!stripTitle && !stripArtist) return trimmed;
  if (scriptContainsLatinTrackCitation(trimmed, artist, title)) return trimmed;

  const primary = primaryArtistName(artist).trim();
  const sep =
    stripTitle && stripArtist && /[A-Za-z]/.test(title) && /[A-Za-z]/.test(primary)
      ? ' by '
      : ' — ';
  const opener =
    stripTitle && stripArtist
      ? `${title.trim()}${sep}${primary}. `
      : stripTitle
        ? `${title.trim()}. `
        : `${primary}. `;
  return `${opener}${trimmed}`.replace(/\s{2,}/g, ' ').trim();
}

export function prepareEdgeTtsText(
  script: string,
  options: EdgeTtsPrepareOptions = {},
): string {
  const artist = options.artist ?? '';
  const title = options.title ?? '';
  const speakNames = options.speakTrackNamesInVoiceover === true;

  let text = preserveMusicProperNames(script, artist, title);
  text = normalizeSocialPlatformsForRussianTts(text);
  text = sanitizeScriptForTts(text, artist, title, [], {
    speakTrackNamesInVoiceover: speakNames,
    trackArtist: artist,
    trackTitle: title,
    skipForeignPhonetic: true,
  });

  const quality = runTtsQualityPass(text, { artist, title });
  text = quality.text;

  text = stripGuillemets(text);
  text = normalizeGenreTermsForTts(text);
  text = normalizeLatinApostrophes(text);
  text = stripApostrophesInLatinRuns(text);
  text = mergeLatinTitleOtArtist(text);

  return text.replace(/\s{2,}/g, ' ').trim();
}
