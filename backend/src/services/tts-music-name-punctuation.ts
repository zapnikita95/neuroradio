/**
 * Music artist/title punctuation for TTS — no pauses on ! ? or letter-by-letter dots (R.E.M., t.A.T.u.).
 */

import { LATIN_RUN_RE } from './latin-script.js';

const CURLY_APOSTROPHE = /[\u2018\u2019\u02BC\u0060]/g;

function normalizeLatinApostrophes(text: string): string {
  return text.replace(CURLY_APOSTROPHE, "'");
}

const DOTTED_BRAND_RE = /\b(Last\.fm|Will\.i\.am)\b/gi;
const LETTER_ACRONYM_DOTS_RE =
  /\b(?:[A-Za-zÀ-ÿ]\.){2,}[A-Za-zÀ-ÿ]\.?(?=\s|$|[^\p{L}])/gu;
const LETTER_ACRONYM_DOTS_TEST_RE =
  /\b(?:[A-Za-zÀ-ÿ]\.){2,}[A-Za-zÀ-ÿ]\.?(?=\s|$|[^\p{L}])/u;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Dotted brands where the dot is not an acronym separator. */
function protectDottedBrands(text: string): { text: string; brands: string[] } {
  const brands: string[] = [];
  const masked = text.replace(DOTTED_BRAND_RE, (m) => {
    const idx = brands.length;
    brands.push(m);
    return `\uE030B${idx}\uE031`;
  });
  return { text: masked, brands };
}

function restoreDottedBrands(text: string, brands: string[]): string {
  return text.replace(/\uE030B(\d+)\uE031/g, (_, i) => brands[Number(i)] ?? '');
}

/** R.E.M. → REM, t.A.T.u. → tATu, B.I.G. → BIG — not Dr. Dre (only one dotted pair before space). */
export function collapseLetterAcronymDots(text: string): string {
  const { text: masked, brands } = protectDottedBrands(text);
  const collapsed = masked.replace(LETTER_ACRONYM_DOTS_RE, (m) => m.replace(/\./g, ''));
  return restoreDottedBrands(collapsed, brands);
}
export function stripDecorativeBangQuestion(text: string): string {
  return text.replace(/[!?]+/g, '');
}

export function spokenMusicNameForTts(name: string): string {
  const trimmed = name?.trim();
  if (!trimmed) return name;
  let s = normalizeLatinApostrophes(trimmed);
  s = collapseLetterAcronymDots(s);
  s = stripDecorativeBangQuestion(s);
  return s.replace(/\s{2,}/g, ' ').trim();
}

export function musicNameNeedsPunctuationFix(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 140) return false;
  if (/[!?]/.test(t)) return true;
  if (LETTER_ACRONYM_DOTS_TEST_RE.test(t)) return true;
  return false;
}

function buildFlexibleNamePattern(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => {
      let p = escapeRegExp(part);
      p = p.replace(/\\!/g, '!?').replace(/\\\?/g, '\\?!?');
      p = p.replace(/([A-Za-zÀ-ÿ])\\\.([A-Za-zÀ-ÿ])/g, '$1\\.?$2');
      return p;
    })
    .join('\\s+');
}

/** Replace metadata artist/title variants (Panic! at the Disco ↔ Panic at the Disco). */
export function applyKnownMusicNamesPunctuation(
  text: string,
  artist = '',
  title = '',
): string {
  let result = text;
  for (const raw of [artist, title]) {
    const original = raw?.trim();
    if (!original) continue;
    const spoken = spokenMusicNameForTts(original);
    if (!spoken || spoken.toLowerCase() === original.toLowerCase()) continue;
    const pattern = buildFlexibleNamePattern(original);
    result = result.replace(new RegExp(pattern, 'gi'), spoken);
  }
  return result;
}

/** Normalize Latin runs that look like band/song names (not full English sentences). */
export function normalizeMusicPunctuationInLatinRuns(text: string): string {
  return text.replace(LATIN_RUN_RE, (span) => {
    if (!musicNameNeedsPunctuationFix(span)) return span;
    const { core, trailing } = splitTrailingSentencePunct(span);
    const spoken = spokenMusicNameForTts(core);
    return spoken + trailing;
  });
}

function splitTrailingSentencePunct(span: string): { core: string; trailing: string } {
  const trimmed = span.trim();
  if (LETTER_ACRONYM_DOTS_TEST_RE.test(trimmed)) {
    return { core: trimmed, trailing: '' };
  }
  const m = trimmed.match(/^(.+?)([.!?…]+)$/);
  if (!m) return { core: trimmed, trailing: '' };
  const core = m[1]!.trim();
  if (core.length < 2 || !musicNameNeedsPunctuationFix(core)) {
    return { core: trimmed, trailing: '' };
  }
  return { core, trailing: m[2]! };
}

export function applyMusicNamePunctuationToText(
  text: string,
  artist = '',
  title = '',
): string {
  let result = applyKnownMusicNamesPunctuation(text, artist, title);
  result = normalizeMusicPunctuationInLatinRuns(result);
  return result;
}
