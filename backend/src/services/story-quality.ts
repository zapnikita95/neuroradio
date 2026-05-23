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

  const words = countWords(trimmed);
  const minWords = strictLength ? limits.wordsMin : Math.max(30, limits.wordsMin - 15);

  if (words < minWords) {
    return { ok: false, reason: `too short (${words} words, need ${minWords}+)` };
  }
  if (words > limits.wordsMax + 25) {
    return { ok: false, reason: `too long (${words} words, max ~${limits.wordsMax})` };
  }

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

  return { ok: true };
}
