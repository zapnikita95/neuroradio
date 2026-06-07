/**
 * Yandex SpeechKit API v1 — SSML for pause tags.
 * Latin is transliterated to Cyrillic in prepareYandexTtsText — no <lang> switches
 * (they cause unnatural pauses before English words).
 */

import type { YandexVoiceId } from './voices.js';
import { latinPhraseToRussianTts } from './tts-foreign-pronounce.js';
import { normalizeLatinApostrophes } from './tts-yandex-normalize.js';

const BREAK_SMALL = '\uE020';
const BREAK_MEDIUM = '\uE021';
const BREAK_SENTENCE = '\uE022';

/** Latin runs incl. curly apostrophe in Don't / Don't Matter To Me. */
const LATIN_APOSTROPHE = "''\u2018\u2019\u02BC\u0060";

const LATIN_RUN_RE = new RegExp(
  `[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9${LATIN_APOSTROPHE}.\\-&]{0,}(?:\\s+(?![.!?…]\\s)[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9${LATIN_APOSTROPHE}.\\-&]{0,})*`,
  'g',
);

const LATIN_SSML_PRONUNCIATION: Record<string, string> = {
  moonwalk: 'moon walk',
  xscape: 'X scape',
  onerepublic: 'One Republic',
  'anti-gravity lean': 'anti gravity lean',
  'anti-gravity': 'anti gravity',
};

export function hasLatinForSsml(text: string): boolean {
  const stripped = text.replace(/<\[(?:small|medium|large|tiny|huge|sentence)\]>/g, '');
  return /[A-Za-zÀ-ÿ]{2,}/.test(stripped);
}

export function escapeSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function detectLangCode(latinSpan: string): 'en' | 'it' | 'es' {
  if (/ñ|¿|¡|[áéíóúü]/i.test(latinSpan)) return 'es';
  if (
    /\b(zitti|buoni|buono|mambo|italiano|ciao|amore|bambino|gnocchi)\b/i.test(latinSpan) ||
    /tti\b|gn[a-z]|gli/i.test(latinSpan)
  ) {
    return 'it';
  }
  return 'en';
}

/** Short Spanish/Italian tokens with accents — ru-RU voice reads es-ES lang as English «bi». */
const SHORT_ACCENT_LATIN_CYRILLIC: Record<string, string> = {
  bé: 'бэ',
  be: 'бэ',
};

function capitalizeLike(original: string, translated: string): string {
  if (!original) return translated;
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return translated.charAt(0).toUpperCase() + translated.slice(1);
  }
  return translated;
}

function cyrillicForShortAccentLatin(span: string): string | null {
  const trailing = span.match(/^(.+?)([.!?…]+)$/);
  const bare = (trailing?.[1] ?? span).trim();
  const punct = trailing?.[2] ?? '';
  if (bare.length > 8 || /\s/.test(bare)) return null;
  if (!/[áéíóúüñ]/i.test(bare)) return null;
  const mapped = SHORT_ACCENT_LATIN_CYRILLIC[bare.toLowerCase()];
  if (!mapped) return null;
  return capitalizeLike(bare, mapped) + punct;
}

function splitLatinTokenForTts(span: string): string {
  const trimmed = span.trim();
  const key = trimmed.toLowerCase();
  if (LATIN_SSML_PRONUNCIATION[key]) return LATIN_SSML_PRONUNCIATION[key];
  if (/^[A-Z][a-z]+[A-Z][a-z]+$/.test(trimmed)) {
    return trimmed.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  if (/^X[a-z]{4,}$/i.test(trimmed)) {
    return `X ${trimmed.slice(1)}`;
  }
  return trimmed;
}

function latinToCyrillicForYandex(span: string): string {
  const lang = detectLangCode(span);
  if (lang === 'es' || lang === 'it') {
    const cyrillicAccent = cyrillicForShortAccentLatin(span);
    if (cyrillicAccent) return cyrillicAccent;
  }
  return latinPhraseToRussianTts(splitLatinTokenForTts(span), lang);
}

function pausesToPlaceholders(text: string): string {
  return text
    .replace(/<\[sentence\]>/g, BREAK_SENTENCE)
    .replace(/<\[small\]>/g, BREAK_SMALL)
    .replace(/<\[medium\]>/g, BREAK_MEDIUM)
    .replace(/<\[large\]>/g, BREAK_MEDIUM);
}

function placeholdersToBreaks(text: string): string {
  return text
    .replaceAll(BREAK_SENTENCE, '<break time="260ms"/>')
    .replaceAll(BREAK_SMALL, '<break time="12ms"/>')
    .replaceAll(BREAK_MEDIUM, '<break time="80ms"/>');
}

/** Remaining Latin → Cyrillic inline; Russian text and + stress marks stay as-is. */
export function wrapMixedLanguageBody(text: string): string {
  const prepared = pausesToPlaceholders(normalizeLatinApostrophes(text));
  let last = 0;
  let out = '';
  const re = new RegExp(LATIN_RUN_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(prepared)) !== null) {
    if (match.index > last) {
      out += escapeSsml(prepared.slice(last, match.index));
    }
    out += escapeSsml(latinToCyrillicForYandex(match[0]));
    last = match.index + match[0].length;
  }
  if (last < prepared.length) {
    out += escapeSsml(prepared.slice(last));
  }
  return placeholdersToBreaks(out);
}

export function buildYandexSsml(markedText: string, _voice?: YandexVoiceId): string {
  const body = wrapMixedLanguageBody(markedText);
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ru-RU">` +
    `${body}</speak>`
  );
}
