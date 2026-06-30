/**
 * Yandex / Edge RU: сдвоенные согласные в заимствованиях (рифф, басс, беллами) и
 * удвоенные гласные (версии, коллекции) ломают TTS. Схлопываем в озвучке, display не трогаем.
 */

import { RUSSIAN_STRESS } from './russian-stress.js';

const CYRILLIC_CONSONANT = 'бвгджзклмнпрстфхцчшщ';
const CYRILLIC_VOWEL = 'аеёиоуыэюя';

/** Слова/корни, где двойная согласная — норма русского правописания. */
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
  const lower = token.toLowerCase().replace(/\+/g, '');
  return KEEP_GEMINATE_STEMS.some((stem) => lower.includes(stem));
}

/** Схлопнуть удвоенные гласные (версии→верси для TTS) внутри токена. */
function preservesVowelGeminateToken(lowerBare: string): boolean {
  const stem = lowerBare.replace(/[.,!?;:—–)\]»]+$/u, '');
  if (/еев$/iu.test(stem)) return true;
  if (/[бвгджзклмнпрстфхцчшщ]нее$/iu.test(stem)) return true;
  if (/[бвгджзклмнпрстфхцчшщ]ее$/iu.test(stem) && !/ии$/iu.test(stem)) return true;
  return false;
}

export function collapseVowelGeminateInCyrillicToken(token: string): string {
  if (!/[а-яё]/i.test(token)) return token;

  const lowerBare = token.toLowerCase().replace(/\+/g, '');
  if (preservesVowelGeminateToken(lowerBare)) {
    return token;
  }

  let result = token;
  const doubleVowelRe = new RegExp(`([${CYRILLIC_VOWEL}])\\1+`, 'giu');
  result = result.replace(doubleVowelRe, '$1');
  // vers+ii → vers+и (ударение перед первой «и»)
  result = result.replace(
    new RegExp(`([${CYRILLIC_VOWEL}])\\+([${CYRILLIC_VOWEL}])\\1`, 'giu'),
    '$1+$2',
  );
  return result;
}

/** После схлопывания — вернуть ударение из словаря (спонтано → спонт+анно). */
function reapplyKnownStress(token: string): string {
  const bare = token.replace(/\+/g, '').toLowerCase();
  const marked = RUSSIAN_STRESS[bare];
  if (!marked) return token;
  if (token[0] === token[0].toUpperCase() && token[0] !== token[0].toLowerCase()) {
    return marked.charAt(0).toUpperCase() + marked.slice(1);
  }
  return marked;
}

function collapseTokenSegments(token: string): string {
  if (!token.includes('-')) {
    const collapsed = collapseGeminateInCyrillicTokenCore(token);
    return reapplyKnownStress(collapsed);
  }
  return token
    .split('-')
    .map((seg) => {
      const collapsed = collapseGeminateInCyrillicTokenCore(seg);
      return reapplyKnownStress(collapsed);
    })
    .join('-');
}

function collapseGeminateInCyrillicTokenCore(token: string): string {
  if (!/[а-яё]/i.test(token) || tokenKeepsGeminate(token)) {
    return collapseVowelGeminateInCyrillicToken(token);
  }

  const geminateRe = new RegExp(
    `([${CYRILLIC_CONSONANT}])\\1(?=[${'аеёиоуыэюя'}]|$|[.,!?;:—–)\\]»+\\-\u2010\u2011\u2012\u2013\u2014])`,
    'gi',
  );
  let result = token.replace(geminateRe, '$1');
  result = collapseVowelGeminateInCyrillicToken(result);
  return result;
}

export function collapseGeminateInCyrillicToken(token: string): string {
  return collapseTokenSegments(token);
}

const LATIN_SLOT = '\uE014L';
const LATIN_SLOT_END = '\uE015';
const LATIN_RUN_RE =
  /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’.\-&]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’.\-&]*)*/g;
const MARKUP_RE = /<\[[^\]]+\]>/g;

/** Схлопнуть geminate в кириллице; латиница и Yandex-markup не трогаются. */
export function collapseCyrillicGeminatesForTts(text: string): string {
  if (!text.trim()) return text;

  const latinSlots: string[] = [];
  let masked = text.replace(LATIN_RUN_RE, (match) => {
    const idx = latinSlots.length;
    latinSlots.push(match);
    return `${LATIN_SLOT}${idx}${LATIN_SLOT_END}`;
  });
  masked = masked.replace(MARKUP_RE, (m) => m);

  masked = masked
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim() || !/[а-яё]/i.test(part)) return part;
      return collapseTokenSegments(part);
    })
    .join('');

  return masked.replace(
    new RegExp(`${LATIN_SLOT}(\\d+)${LATIN_SLOT_END}`, 'g'),
    (_, index) => latinSlots[Number(index)] ?? '',
  );
}
