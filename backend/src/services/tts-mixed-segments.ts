/** Split RU / EN / DE / FR for Edge TTS (and Yandex SSML lang tags). */

import {
  coalesceMixedLanguageSegments,
  isPunctuationOnlyForMixedLang,
  LATIN_RUN_RE,
  type MixedLangSegment,
} from './latin-script.js';
import { edgeForeignLang } from './tts-foreign-lang.js';

export type { MixedLangSegment };

function pushSegment(
  segments: MixedLangSegment[],
  lang: 'ru' | 'en' | 'de' | 'fr',
  chunk: string,
): void {
  if (!chunk) return;
  if (isPunctuationOnlyForMixedLang(chunk)) {
    const last = segments[segments.length - 1];
    if (last) {
      last.text = `${last.text}${chunk}`.replace(/\s{2,}/g, ' ').trim();
    }
    return;
  }
  const t = chunk.trim();
  if (!t) return;
  const last = segments[segments.length - 1];
  if (last?.lang === lang) {
    last.text = `${last.text} ${t}`.replace(/\s+/g, ' ').trim();
  } else {
    segments.push({ lang, text: t });
  }
}

/** Split mixed RU + Latin into segments for per-lang Edge voices (ru / en / de / fr). */
export function splitMixedLanguageForEdge(
  text: string,
  artist = '',
  title = '',
): MixedLangSegment[] {
  const source = text.trim();
  if (!source) return [];

  const segments: MixedLangSegment[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    LATIN_RUN_RE.lastIndex = cursor;
    const match = LATIN_RUN_RE.exec(source);
    if (!match) {
      pushSegment(segments, 'ru', source.slice(cursor));
      break;
    }
    const start = match.index;
    const latin = match[0]!;
    if (start > cursor) {
      pushSegment(segments, 'ru', source.slice(cursor, start));
    }
    pushSegment(segments, edgeForeignLang(latin, artist, title), latin);
    cursor = start + latin.length;
  }

  return coalesceMixedLanguageSegments(segments.filter((s) => s.text.length > 0));
}

export function hasForeignSegmentsForEdge(
  text: string,
  artist = '',
  title = '',
): boolean {
  return splitMixedLanguageForEdge(text, artist, title).some((s) => s.lang !== 'ru');
}
