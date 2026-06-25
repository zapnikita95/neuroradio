/**
 * Edge RU путает ударение на сдвоенных согласных в заимствованиях (риффе → «ри-ФФ-е»).
 * Перед синтезом схлопываем geminate, кроме устойчивых русских слов (класс, бассейн…).
 */

import { normalizeGenreTermsForTts } from './tts-genre-pronounce.js';
import { collapseGeminateInCyrillicToken } from './tts-cyrillic-geminate.js';

/** Нормализация кириллицы перед Edge RU (без + и SSML-разметки). */
export function normalizeEdgeRussianOrthography(text: string): string {
  if (!text.trim()) return text;

  const withGenres = normalizeGenreTermsForTts(text);

  return withGenres
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim() || !/[а-яё]/i.test(part)) return part;
      return collapseGeminateInCyrillicToken(part);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Полная подготовка RU-сегмента для Edge после Yandex-markup. */
export function prepareEdgeRussianSegment(markedText: string): string {
  const stripped = markedText
    .replace(/<\[[^\]]+\]>/g, ' ')
    .replace(/\+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalizeEdgeRussianOrthography(stripped);
}
