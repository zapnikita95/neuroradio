import {
  DEFAULT_STORY_LENGTH,
  getStoryLengthPreset,
  StoryLengthId,
  StoryLengthPreset,
} from './story-length.js';

export { DEFAULT_STORY_LENGTH, getStoryLengthPreset };
export type { StoryLengthId, StoryLengthPreset };

export const BANNED_SCRIPT_PATTERNS: RegExp[] = [
  /^«?\s*знаю\s+(интересн|один|такой|факт)/i,
  /^«?\s*интересн/i,
  /^«?\s*вот что/i,
  /^«?\s*факт\s*:/i,
  /^«?\s*слушай[,]?\s*(факт|интересн)/i,
  /зал просто сходит с ума/i,
  /зрители в экстазе/i,
  /элвис в огне/i,
  /вкладывает душу/i,
  /магия музыки/i,
  /music story/i,
  /wikipedia/i,
  /по данным/i,
  /согласно/i,
  /стоял у мониторов,\s*звукорежиссёры краснели/i,
  /зал замолчал на первой ноте/i,
  /стоял у радиолы/i,
  /помню студию — при записи/i,
  /фанат\s+\S+\s+настояли/i,
  /микрофон еле остыл/i,
  /влия(?:ет|ли|ющ)/i,
  /легендарн/i,
  /уникальн(?:ый|ая|ое|ые|ом|ой|ую)/i,
  /суть в том, что/i,
  /понял[а]?, что музыка/i,
  /музыка может соедин/i,
  /чрезвычайно влия/i,
  /сделает.*классик/i,
  /собирались по вечерам/i,
  /забыл обо вс[её]м/i,
  /танцевали на стульях/i,
  /характерный.*рифф/i,
  /подсказывает\s+[A-Z]/i,
  /подсказывает\s+«?[A-Za-z]/i,
  /(?:^|[.!?…]\s*)я (?:сидел|вспоминаю) (?:в )?студии[,]?\s+где/i,
];

const ENGLISH_LEAK_PATTERN =
  /\b(show|feedback|engineers|monitors|bootleg|cape routine|that night|warehouse|remember when)\b/i;

const CYR = '[а-яё]+';
const SPELLED_YEAR_PATTERN = new RegExp(
  `(?:^|[\\s,.«"—-])(?:тысяча\\s+девятьсот(?:\\s+${CYR})?|двухтысяч${CYR}|пятидесят${CYR}|шестидесят${CYR}|семидесят${CYR}|восьмидесят${CYR}|девяност${CYR})(?=[\\s,.!?»"—-]|$)`,
  'giu',
);

const DIGIT_ORDINAL_SUFFIX =
  /\d+\s*[-–—]?\s*(?:й|го|м|х|е|ем|ом|ую|ая|ые|ых)(?=[\s,.!?»"—-]|$)/giu;
const ORPHAN_ORDINAL_SUFFIX =
  /(?:^|[\s,.«"—-])\s*[-–—]?(?:й|го|м|х|е|ем|ом)(?=[\s,.!?»"—-]|$)/giu;

const ENGLISH_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bshow\b/gi, 'концерт'],
  [/\bfeedback\b/gi, 'свист'],
  [/\bengineers\b/gi, 'звукорежиссёры'],
  [/\bmonitors\b/gi, 'мониторы'],
  [/\blive\b/gi, 'живой'],
  [/\bstage\b/gi, 'сцена'],
  [/\bstudio\b/gi, 'студия'],
];

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function allowedDigitSequences(artist: string, title: string): Set<string> {
  const combined = `${artist} ${title}`;
  const matches = combined.match(/\d+/g) ?? [];
  return new Set(matches);
}

export function findForbiddenNumbers(
  script: string,
  artist: string,
  title: string,
): string | null {
  const allowed = allowedDigitSequences(artist, title);

  const digits = script.match(/\d+/g) ?? [];
  for (const seq of digits) {
    if (!allowed.has(seq)) {
      return `digit "${seq}" not allowed`;
    }
  }

  if (DIGIT_ORDINAL_SUFFIX.test(script)) {
    DIGIT_ORDINAL_SUFFIX.lastIndex = 0;
    return 'digit ordinal like "65-й"';
  }

  if (SPELLED_YEAR_PATTERN.test(script)) {
    SPELLED_YEAR_PATTERN.lastIndex = 0;
    return 'spelled-out year or decade';
  }

  return null;
}

export function sanitizeScriptForTts(script: string, artist: string, title: string): string {
  const allowed = allowedDigitSequences(artist, title);
  let result = script.trim();

  for (const [pattern, replacement] of ENGLISH_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  result = result.replace(DIGIT_ORDINAL_SUFFIX, ' тогда ');
  DIGIT_ORDINAL_SUFFIX.lastIndex = 0;
  result = result.replace(/\d+/g, (match) => (allowed.has(match) ? match : ''));
  result = result.replace(ORPHAN_ORDINAL_SUFFIX, ' тогда ');
  ORPHAN_ORDINAL_SUFFIX.lastIndex = 0;
  result = result.replace(SPELLED_YEAR_PATTERN, ' тогда ');
  SPELLED_YEAR_PATTERN.lastIndex = 0;
  result = result.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();

  return result;
}

export function validateStoryScript(
  script: string,
  lengthId: StoryLengthId = DEFAULT_STORY_LENGTH,
  artist = '',
  title = '',
  options: { strictLength?: boolean } = {},
): { ok: true } | { ok: false; reason: string } {
  const limits = getStoryLengthPreset(lengthId);
  const strictLength = options.strictLength ?? true;
  const trimmed = script.trim();
  if (!trimmed) return { ok: false, reason: 'empty script' };

  for (const pattern of BANNED_SCRIPT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { ok: false, reason: `banned pattern: ${pattern.source}` };
    }
  }

  if (ENGLISH_LEAK_PATTERN.test(trimmed)) {
    return { ok: false, reason: 'english words in Russian narration' };
  }

  const numberIssue = findForbiddenNumbers(trimmed, artist, title);
  if (numberIssue) {
    return { ok: false, reason: `forbidden numbers: ${numberIssue}` };
  }

  const waterIssue = findWateryContent(trimmed);
  if (waterIssue) {
    return { ok: false, reason: waterIssue };
  }

  const words = countWords(trimmed);
  const minWords = strictLength ? limits.wordsMin : Math.max(30, limits.wordsMin - 15);

  if (words < minWords) {
    return { ok: false, reason: `too short (${words} words, need ${minWords}+)` };
  }
  if (words > limits.wordsMax + 25) {
    return { ok: false, reason: `too long (${words} words, max ~${limits.wordsMax})` };
  }

  return { ok: true };
}

/** Reject generic filler without concrete detail. */
export function findWateryContent(script: string): string | null {
  const genericOpeners = [
    /^«?\s*я (?:сидел|вспоминаю) (?:в )?студии/i,
    /^«?\s*сквозь миганье лампочек/i,
  ];
  for (const pattern of genericOpeners) {
    if (pattern.test(script)) {
      return 'generic studio opener — start with a concrete fact';
    }
  }

  const concreteSignals =
    /\b(сэмпл|sample|перезапис|дубль|лейбл|продюсер|радио|телевиз|клип|чарт|billboard|гитар|барабан|клавиш|оркестр|сакс|труб|скрипк|микрофон|пластинк|кассет|vinyl|prado|pérez|перес|перез|кавер|cover|remix|plagiar|запрет|скандал|штраф|плагиат|первый раз|в эфир|на сцене|в раздевалке|backstage|soundcheck|монтаж|монтажн|сведени|master|микш|репетиц|фestival|фестив|Apollo|Монтр|Abbey|Sun Records|Columbia|EMI|Def Jam|Яндекс|Spotify|MTV|Grammy|«[^»]{3,}»)\b/i;
  if (!concreteSignals.test(script)) {
    return 'no concrete fact — need sample, place, person, instrument, label, or scandal detail';
  }

  return null;
}
