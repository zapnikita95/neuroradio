/**
 * Shared Unicode Latin helpers — é/ñ/ü/ö stay inside one token everywhere (not ASCII \b[a-z]\b).
 */

const LATIN_APOSTROPHE = "''\u2018\u2019\u02BC\u0060";
const LATIN_HYPHENS = '\\-\u2010\u2011\u2012\u2013\u2014';
const LATIN_INNER = `[\\p{Script=Latin}${LATIN_APOSTROPHE}${LATIN_HYPHENS}:.&]`;
const LATIN_TOKEN = `\\p{Script=Latin}${LATIN_INNER}{0,}`;

/** One Latin run: words, apostrophes, hyphens, dotted brands (Last.fm). */
export const LATIN_RUN_RE = new RegExp(
  `${LATIN_TOKEN}(?:\\s+(?![.!?…]\\s)${LATIN_TOKEN})*`,
  'gu',
);

export function hasLatinScript(text: string): boolean {
  return /\p{Script=Latin}/u.test(text);
}

export function splitLatinParts(value: string): string[] {
  return value
    .split(/[^\p{L}\p{N}]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && hasLatinScript(part));
}

/** Dash/comma only — must not become a standalone RU TTS segment. */
export function isPunctuationOnlyForMixedLang(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && !/[\p{Script=Cyrillic}\p{Script=Latin}]/u.test(t);
}

export type MixedLangSegment = { lang: 'ru' | 'en' | 'de' | 'fr'; text: string };

/** Merge same-lang neighbors; glue orphan punctuation to previous segment. */
export function coalesceMixedLanguageSegments(segments: MixedLangSegment[]): MixedLangSegment[] {
  const merged: MixedLangSegment[] = [];
  for (const seg of segments) {
    if (isPunctuationOnlyForMixedLang(seg.text)) {
      const prev = merged[merged.length - 1];
      if (prev) prev.text = `${prev.text}${seg.text}`.replace(/\s{2,}/g, ' ').trim();
      continue;
    }
    const prev = merged[merged.length - 1];
    if (prev?.lang === seg.lang) {
      prev.text = `${prev.text} ${seg.text}`.replace(/\s+/g, ' ').trim();
    } else {
      merged.push({ ...seg, text: seg.text.trim() });
    }
  }
  return merged.filter((s) => s.text.length > 0);
}
