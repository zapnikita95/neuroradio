/**
 * Yandex SpeechKit API v1 — SSML с переключением языка для латиницы.
 * ru-RU голос (ermil, zahar, …) читает «Baby One More Time» как русскую транскрипцию;
 * <lang xml:lang="en-US"> заставляет синтезатор произнести по-английски.
 */

import type { YandexVoiceId } from './voices.js';
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

function detectLangCode(latinSpan: string): string {
  if (/ñ|¿|¡|[áéíóúü]/i.test(latinSpan)) return 'es-ES';
  if (
    /\b(zitti|buoni|buono|mambo|italiano|ciao|amore|bambino|gnocchi)\b/i.test(latinSpan) ||
    /tti\b|gn[a-z]|gli/i.test(latinSpan)
  ) {
    return 'it-IT';
  }
  return 'en-US';
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

/**
 * «с/в/к» перед <lang en-US> Yandex иногда читает как буквы.
 * Предлог остаётся в русском потоке; для «контракт с Young…» — bridge в tts-yandex-normalize.
 */
function escapeRussianChunkBeforeLatin(chunk: string): string {
  return escapeSsml(chunk);
}

/** После en-US блока ru-предлог может прочитаться как буква — короткая пауза сбрасывает язык. */
function fixRussianPrepositionsAfterLangTags(text: string): string {
  return text.replace(
    /(<\/lang>)(\s*)([вскуо])(\s+)(?=[а-яёА-ЯЁ])/g,
    '$1<break time="60ms"/>$3$4',
  );
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

/** Strip micro-pauses hugging <lang> — foreign words should flow like in speech. */
function trimBreaksAroundLangTags(text: string): string {
  return text
    .replace(/<break time="\d+ms"\/?>\s*(<lang\b)/g, '$1')
    .replace(/(<\/lang>)\s*<break time="\d+ms"\/?>/g, '$1');
}

/** Latin spans Yandex misreads unless spaced for en-US voice. */
const LATIN_SSML_PRONUNCIATION: Record<string, string> = {
  moonwalk: 'moon walk',
  xscape: 'X scape',
  onerepublic: 'One Republic',
  'anti-gravity lean': 'anti gravity lean',
  'anti-gravity': 'anti gravity',
};

/** Split CamelCase album/brand tokens for en-US TTS (Xscape → X scape). */
function splitCamelCaseLatin(span: string): string {
  const key = span.trim().toLowerCase();
  const mapped = LATIN_SSML_PRONUNCIATION[key];
  if (mapped) return mapped;
  if (/^[A-Z][a-z]+[A-Z][a-z]+$/.test(span.trim())) {
    return span.trim().replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  if (/^X[a-z]{4,}$/i.test(span.trim())) {
    return `X ${span.trim().slice(1)}`;
  }
  return span;
}

function latinSpanForSsml(span: string): string {
  const trimmed = span.trim();
  return splitCamelCaseLatin(trimmed);
}

/** Оборачивает латинские фрагменты в SSML lang; русский текст и +ударения — как есть. */
export function wrapMixedLanguageBody(text: string): string {
  const prepared = pausesToPlaceholders(normalizeLatinApostrophes(text));
  let last = 0;
  let out = '';
  const re = new RegExp(LATIN_RUN_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(prepared)) !== null) {
    if (match.index > last) {
      out += escapeRussianChunkBeforeLatin(prepared.slice(last, match.index));
    }
    const lang = detectLangCode(match[0]);
    const cyrillicAccent = lang === 'es-ES' || lang === 'it-IT' ? cyrillicForShortAccentLatin(match[0]) : null;
    if (cyrillicAccent) {
      out += escapeSsml(cyrillicAccent);
    } else {
      out += `<lang xml:lang="${lang}">${escapeSsml(latinSpanForSsml(match[0]))}</lang>`;
    }
    last = match.index + match[0].length;
  }
  if (last < prepared.length) {
    out += escapeSsml(prepared.slice(last));
  }
  return fixRussianPrepositionsAfterLangTags(trimBreaksAroundLangTags(placeholdersToBreaks(out)));
}

export function buildYandexSsml(markedText: string, _voice?: YandexVoiceId): string {
  const body = wrapMixedLanguageBody(markedText);
  // Voice is passed via HTTP `voice=` — Yandex rejects <voice> inside SSML (400 BAD_REQUEST).
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ru-RU">` +
    `${body}</speak>`
  );
}
