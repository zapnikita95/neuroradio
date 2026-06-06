/**
 * Yandex SpeechKit API v1 — SSML с переключением языка для латиницы.
 * ru-RU голос (ermil, zahar, …) читает «Baby One More Time» как русскую транскрипцию;
 * <lang xml:lang="en-US"> заставляет синтезатор произнести по-английски.
 */

import type { YandexVoiceId } from './voices.js';

const BREAK_SMALL = '\uE020';
const BREAK_MEDIUM = '\uE021';
const BREAK_SENTENCE = '\uE022';

const LATIN_RUN_RE =
  /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9''\-&]*(?:\s+(?![.!?…]\s)[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9''\-&]*)*/g;

export function hasLatinForSsml(text: string): boolean {
  return /[A-Za-zÀ-ÿ]{2,}/.test(text);
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
    .replaceAll(BREAK_SMALL, '<break time="40ms"/>')
    .replaceAll(BREAK_MEDIUM, '<break time="120ms"/>');
}

/** Оборачивает латинские фрагменты в SSML lang; русский текст и +ударения — как есть. */
export function wrapMixedLanguageBody(text: string): string {
  const prepared = pausesToPlaceholders(text);
  let last = 0;
  let out = '';
  const re = new RegExp(LATIN_RUN_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(prepared)) !== null) {
    if (match.index > last) {
      out += escapeSsml(prepared.slice(last, match.index));
    }
    const lang = detectLangCode(match[0]);
    out += `<lang xml:lang="${lang}">${escapeSsml(match[0])}</lang>`;
    last = match.index + match[0].length;
  }
  if (last < prepared.length) {
    out += escapeSsml(prepared.slice(last));
  }
  return placeholdersToBreaks(out);
}

export function buildYandexSsml(markedText: string, _voice?: YandexVoiceId): string {
  const body = wrapMixedLanguageBody(markedText);
  // Voice is passed via HTTP `voice=` — Yandex rejects <voice> inside SSML (400 BAD_REQUEST).
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ru-RU">` +
    `${body}</speak>`
  );
}
