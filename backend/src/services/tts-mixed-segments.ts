/** Split RU / EN / DE / FR for Edge TTS (and Yandex SSML lang tags). */

import { edgeForeignLang } from './tts-foreign-lang.js';

const LATIN_APOSTROPHE = "''\u2018\u2019\u02BC\u0060";
const LATIN_INNER = `[\\p{Script=Latin}${LATIN_APOSTROPHE}.\\-&]`;

/** Full Unicode Latin — é, ñ, ü stay inside one token (not split like ASCII \\b[a-z]\\b). */
const LATIN_RUN_RE = new RegExp(
  `\\p{Script=Latin}${LATIN_INNER}{0,}(?:\\s+(?![.!?…]\\s)\\p{Script=Latin}${LATIN_INNER}{0,})*`,
  'gu',
);

export type MixedLangSegment = { lang: 'ru' | 'en' | 'de' | 'fr'; text: string };

/** « — », «. » between two FR spans — glue to previous segment (one voice). */
function isPunctuationOnly(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && !/[\p{Script=Cyrillic}\p{Script=Latin}]/u.test(t);
}

function pushSegment(
  segments: MixedLangSegment[],
  lang: 'ru' | 'en' | 'de' | 'fr',
  chunk: string,
): void {
  if (!chunk) return;
  if (isPunctuationOnly(chunk)) {
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

  return segments.filter((s) => s.text.length > 0);
}

export function hasForeignSegmentsForEdge(
  text: string,
  artist = '',
  title = '',
): boolean {
  return splitMixedLanguageForEdge(text, artist, title).some((s) => s.lang !== 'ru');
}
