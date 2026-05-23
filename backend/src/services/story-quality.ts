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
  /^я помню/i,
  /^я (?:был|была) в клубе/i,
  /^я (?:помню|был|была), когда впервые/i,
  /^на сцене артист начинает/i,
  /я помню студию/i,
  /мы были в клубе/i,
  /я стоял у мониторов/i,
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

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function significantTokens(raw: string): string[] {
  return normalizeForMatch(raw)
    .split(' ')
    .filter((part) => part.length >= 3);
}

/** Story mentions artist, title, or a concrete music detail — enough to pass quality gate. */
export function hasConcreteFact(script: string, artist = '', title = ''): boolean {
  const trimmed = script.trim();
  if (/«[^»]{2,}»/.test(trimmed)) return true;

  const scriptNorm = normalizeForMatch(trimmed);
  for (const token of significantTokens(artist)) {
    if (scriptNorm.includes(token)) return true;
  }
  for (const token of significantTokens(title)) {
    if (token.length >= 4 && scriptNorm.includes(token)) return true;
  }

  const concreteSignals =
    /\b(сэмпл|sample|перезапис|дубль|лейбл|продюсер|радио|телевиз|клип|чарт|billboard|гитар|барабан|клавиш|оркестр|сакс|труб|скрипк|микрофон|пластинк|кассет|vinyl|prado|pérez|перес|кавер|cover|remix|plagiar|запрет|скандал|плагиат|первый раз|в эфир|на сцене|в раздевалке|backstage|soundcheck|сведени|master|микш|репетиц|фестив|Apollo|Abbey|Columbia|EMI|MTV|Grammy|песн|трек|альбом|сингл|куплет|мелоди|исполн|запис|верси|оркестр|джаз|свинг|рок|блюз|саксоф|фортеп|ударн|вокал|хор|дириж|композ|arrang|оригинал|перевод|эфир|премьер|релиз|дебют|soundtrack|сцен|зал|студи|концерт|пластин|винил|кассет|радиол|припев|бридж|solo|соло)\b/i;
  return concreteSignals.test(trimmed);
}

function significantWords(text: string): string[] {
  return normalizeForMatch(text)
    .split(' ')
    .filter((word) => word.length >= 5);
}

/** Script must reflect at least one reference fact (Wikipedia anchor). */
export function anchorsReferenceFact(script: string, referenceFacts: string[]): boolean {
  if (referenceFacts.length === 0) return true;
  const scriptWords = new Set(significantWords(script));
  return referenceFacts.some((fact) => {
    const factWords = significantWords(fact);
    if (factWords.length === 0) return false;
    const hits = factWords.filter((word) => scriptWords.has(word)).length;
    return hits >= Math.min(2, factWords.length);
  });
}

export function validateStoryScript(
  script: string,
  lengthId: StoryLengthId = DEFAULT_STORY_LENGTH,
  artist = '',
  title = '',
  options: { strictLength?: boolean; skipWatery?: boolean; referenceFacts?: string[] } = {},
): { ok: true } | { ok: false; reason: string } {
  const limits = getStoryLengthPreset(lengthId);
  const strictLength = options.strictLength ?? true;
  const skipWatery = options.skipWatery ?? false;
  const referenceFacts = options.referenceFacts ?? [];
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

  if (!skipWatery) {
    const waterIssue = findWateryContent(trimmed, artist, title);
    if (waterIssue) {
      return { ok: false, reason: waterIssue };
    }
  }

  if (referenceFacts.length > 0 && !anchorsReferenceFact(trimmed, referenceFacts)) {
    return { ok: false, reason: 'story ignores Wikipedia reference facts' };
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
export function findWateryContent(script: string, artist = '', title = ''): string | null {
  if (hasConcreteFact(script, artist, title)) return null;
  return 'no concrete fact — mention artist, title, instrument, label, or recording detail';
}
