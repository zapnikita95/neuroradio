/**
 * Russian stress for Yandex SpeechKit: put + immediately BEFORE the stressed vowel.
 * Only words Yandex often misreads — do not mark common vocabulary.
 */

import { normalizeRussianYo } from './russian-yo.js';

/** lowercase word → word with + before stressed vowel */
export const RUSSIAN_STRESS: Record<string, string> = {
  атлас: 'атл+ас',
  атласе: 'атл+асе',
  барабан: 'бараб+ан',
  батарея: 'батар+ея',
  батарее: 'батар+ее',
  версии: 'верс+ии',
  версию: 'верс+ию',
  дубль: 'д+убль',
  дубля: 'д+убля',
  инженер: 'инжен+ер',
  инженера: 'инжен+ера',
  инженером: 'инжен+ером',
  инженеры: 'инжен+еры',
  колонках: 'кол+онках',
  колонки: 'кол+онки',
  концерт: 'конц+ерт',
  концерта: 'конц+ерта',
  концерте: 'конц+ерте',
  курьёз: 'курь+ёз',
  микрофон: 'микроф+он',
  микрофона: 'микроф+она',
  микрофоном: 'микроф+оном',
  монитор: 'монит+ор',
  монитора: 'монит+ора',
  мониторами: 'монит+орами',
  мониторах: 'монит+орах',
  мониторов: 'монит+оров',
  мониторы: 'монит+оры',
  продюсер: 'прод+юсер',
  продюсеры: 'прод+юсеры',
  радиола: 'ради+ола',
  радиолы: 'ради+олы',
  раздевалке: 'раздев+алке',
  свист: 'св+ист',
  свиста: 'св+иста',
  сингл: 'с+ингл',
  сингла: 'с+ингла',
  студии: 'ст+удии',
  студий: 'ст+удий',
  студию: 'ст+удию',
  студия: 'ст+удия',
  телешоу: 'телеш+оу',
  звукорежиссёр: 'звукорежисс+ёр',
  звукорежиссёра: 'звукорежисс+ёра',
  звукорежиссёры: 'звукорежисс+ёры',
  краснели: 'красн+ели',
  эфир: 'эф+ир',
  эфире: 'эф+ире',
};

export const FORCE_RESTRESS = new Set(Object.keys(RUSSIAN_STRESS));

export function stripStressMarks(word: string): string {
  return word.replace(/\+/g, '');
}

export function applyStressToWord(word: string): string {
  if (word.includes('[[')) return word;

  const bare = stripStressMarks(word);
  const lower = bare.toLowerCase();
  const override = RUSSIAN_STRESS[lower];
  if (!override) return bare;

  if (bare[0] === bare[0].toUpperCase() && bare[0] !== bare[0].toLowerCase()) {
    return override.charAt(0).toUpperCase() + override.slice(1);
  }
  return override;
}

export function applyRussianStress(text: string): string {
  const normalized = normalizeRussianYo(text);
  return normalized.replace(/[а-яёА-ЯЁ][а-яёА-ЯЁ+\-]*/g, (word) => applyStressToWord(word));
}

export function listStressEntries(): Array<{ word: string; marked: string }> {
  return Object.entries(RUSSIAN_STRESS).map(([word, marked]) => ({ word, marked }));
}

/** @deprecated use RUSSIAN_STRESS */
export const STRESS_OVERRIDES = RUSSIAN_STRESS;
