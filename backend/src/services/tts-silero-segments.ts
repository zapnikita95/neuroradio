/** Split RU / EN / DE / FR for Silero (ru) + Edge TTS foreign voices. */

import { edgeForeignLang } from './tts-foreign-lang.js';

const LATIN_APOSTROPHE = "''\u2018\u2019\u02BC\u0060";

const LATIN_RUN_RE = new RegExp(
  `[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9${LATIN_APOSTROPHE}.\\-&]{0,}(?:\\s+(?![.!?…]\\s)[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9${LATIN_APOSTROPHE}.\\-&]{0,})*`,
  'g',
);

export type MixedLangSegment = { lang: 'ru' | 'en' | 'de' | 'fr'; text: string };

function pushSegment(
  segments: MixedLangSegment[],
  lang: 'ru' | 'en' | 'de' | 'fr',
  chunk: string,
): void {
  const t = chunk.trim();
  if (!t) return;
  const last = segments[segments.length - 1];
  if (last?.lang === lang) {
    last.text = `${last.text} ${t}`.replace(/\s+/g, ' ').trim();
  } else {
    segments.push({ lang, text: t });
  }
}

export function splitMixedLanguageForSilero(
  text: string,
  _artist = '',
  _title = '',
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
    pushSegment(segments, edgeForeignLang(latin), latin);
    cursor = start + latin.length;
  }

  return segments.filter((s) => s.text.length > 0);
}

export function hasEnglishSegmentsForSilero(
  text: string,
  artist = '',
  title = '',
): boolean {
  return splitMixedLanguageForSilero(text, artist, title).some((s) => s.lang !== 'ru');
}
