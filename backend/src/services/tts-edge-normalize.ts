/**
 * Edge RU путает ударение на сдвоенных согласных в заимствованиях (риффе → «ри-ФФ-е»).
 * Перед синтезом схлопываем geminate, кроме устойчивых русских слов (класс, бассейн…).
 */

import { normalizeGenreTermsForTts } from './tts-genre-pronounce.js';

const CYRILLIC_CONSONANT = 'бвгджзклмнпрстфхцчшщ';

/** Слова/корни, где двойная согласная — норма русского правописания, не трогаем. */
const KEEP_GEMINATE_STEMS = [
  'класс',
  'гласс',
  'пасс',
  'масс',
  'росс',
  'ссор',
  'ссуд',
  'групп',
  'шосс',
  'террасс',
  'професс',
  'ассист',
  'экспресс',
  'процесс',
  'бассейн',
  'кабель',
  'грипп',
  'коллек',
  'комплек',
  'телеграф',
];

function tokenKeepsGeminate(token: string): boolean {
  const lower = token.toLowerCase();
  return KEEP_GEMINATE_STEMS.some((stem) => lower.includes(stem));
}

/**
 * Схлопнуть сдвоенную согласную:
 * - перед гласным окончанием (риффе → рифе, басса → баса)
 * - в конце слова / перед пунктуацией (рифф → риф)
 */
function collapseGeminateInToken(token: string): string {
  if (!/[а-яё]/i.test(token) || tokenKeepsGeminate(token)) return token;

  const geminateRe = new RegExp(
    `([${CYRILLIC_CONSONANT}])\\1(?=[${'аеёиоуыэюя'}]|$|[.,!?;:—–)\\]»])`,
    'gi',
  );
  return token.replace(geminateRe, '$1');
}

/** Нормализация кириллицы перед Edge RU (без + и SSML-разметки). */
export function normalizeEdgeRussianOrthography(text: string): string {
  if (!text.trim()) return text;

  const withGenres = normalizeGenreTermsForTts(text);

  return withGenres
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim() || !/[а-яё]/i.test(part)) return part;
      return collapseGeminateInToken(part);
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
