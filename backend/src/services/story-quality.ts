import {
  DEFAULT_STORY_LENGTH,
  getStoryLengthPreset,
  StoryLengthId,
  StoryLengthPreset,
} from './story-length.js';
import { storyNamesForeignArtist } from './fact-relevance.js';
import { hasEnglishLeak } from './story-russian-language.js';
import { prepareStoryScriptLanguage } from './story-english-normalize.js';

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
  /разорв\w*\s+кабин/i,
  /разорвёт\s+кабин/i,
  /заставляет\s+задуматься\s+о\s+важности/i,
  /тем[аыу]\s+расизм/i,
  /наполнен\w*\s+темой\s+расизм/i,
  /личн\w*\s+опыт\w*\s+с\s+расизмом/i,
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
  /\bдостав(?:ка|ки|кой|ку|ок)\b/i,
  /^я (?:был|была) в клубе/i,
  /^я (?:помню|был|была), когда впервые/i,
  /^на сцене артист начинает/i,
  /я помню студию/i,
  /мы были в клубе/i,
  /я стоял у мониторов/i,
  // /^я помню/i — removed: valid opener, caused false rejects
];

const CYR = '[а-яё]+';
const SPELLED_YEAR_PATTERN = new RegExp(
  `(?:^|[\\s,.«"—-])(?:тысяча\\s+девятьсот(?:\\s+${CYR})?|двухтысяч${CYR}|пятидесят${CYR}|шестидесят${CYR}|семидесят${CYR}|восьмидесят${CYR}|девяност${CYR})(?=[\\s,.!?»"—-]|$)`,
  'giu',
);

const DIGIT_ORDINAL_SUFFIX =
  /\d+\s*[-–—]?\s*(?:й|го|м|х|е|ем|ом|ую|ая|ые|ых)(?=[\s,.!?»"—-]|$)/giu;
const ORPHAN_ORDINAL_SUFFIX =
  /(?:^|[\s,.«"—-])\s*[-–—]?(?:й|го|м|х|е|ем|ом)(?=[\s,.!?»"—-]|$)/giu;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function allowedDigitSequences(
  artist: string,
  title: string,
  referenceFacts: string[] = [],
): Set<string> {
  const combined = `${artist} ${title} ${referenceFacts.join(' ')}`;
  const matches = combined.match(/\d+/g) ?? [];
  return new Set(matches);
}

function shouldKeepDigit(match: string, allowed: Set<string>): boolean {
  if (allowed.has(match)) return true;
  if (/^(19|20)\d{2}$/.test(match)) return true;
  if (/^[1-9]\d?$/.test(match)) return true;
  return false;
}

function repairOrphanDatePhrases(text: string, referenceFacts: string[]): string {
  let result = text;
  const source = referenceFacts.join(' ');
  const years = [...source.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => m[0]);
  if (years.length === 0) return result;
  const year = years[0]!;
  result = result.replace(/\bв\s+году\b/gi, `в ${year} году`);
  result = result.replace(
    /\b(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)\w*\s+года\b/gi,
    (month) => `${month} ${year} года`,
  );
  return result.replace(/\s{2,}/g, ' ').trim();
}

export function sanitizeScriptForTts(
  script: string,
  artist: string,
  title: string,
  referenceFacts: string[] = [],
): string {
  const allowed = allowedDigitSequences(artist, title, referenceFacts);
  const { text: localized, allowedLatin } = prepareStoryScriptLanguage(script, {
    artist,
    title,
    referenceFacts,
  });
  let result = localized;

  result = result.replace(DIGIT_ORDINAL_SUFFIX, (match) => {
    const digits = match.match(/\d+/)?.[0];
    return digits && shouldKeepDigit(digits, allowed) ? match : ' тогда ';
  });
  DIGIT_ORDINAL_SUFFIX.lastIndex = 0;
  result = result.replace(/\d+/g, (match) => (shouldKeepDigit(match, allowed) ? match : ''));
  result = result.replace(/\b[a-z]{2,}\b/gi, (match) => {
    return allowedLatin.has(match.toLowerCase()) ? match : '';
  });
  result = result.replace(ORPHAN_ORDINAL_SUFFIX, ' тогда ');
  ORPHAN_ORDINAL_SUFFIX.lastIndex = 0;
  result = repairOrphanDatePhrases(result, referenceFacts);
  result = result.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
  result = stripBannedFluff(result);

  return result;
}

/** Replace LLM fluff words instead of hard-rejecting the whole story. */
export function stripBannedFluff(text: string): string {
  return text
    .replace(/\bуникальн(?:ый|ая|ое|ые|ом|ой|ую)\b/gi, 'особый')
    .replace(/\bлегендарн\w+\b/gi, 'известный')
    .replace(/\bмагия музыки\b/gi, '')
    .replace(/\bчто[- ]то уникальн\w+\b/gi, 'что-то особенное')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

export function findForbiddenNumbers(
  script: string,
  artist: string,
  title: string,
  referenceFacts: string[] = [],
): string | null {
  const allowed = allowedDigitSequences(artist, title, referenceFacts);

  const digits = script.match(/\d+/g) ?? [];
  for (const seq of digits) {
    if (!shouldKeepDigit(seq, allowed)) {
      return `digit "${seq}" not allowed`;
    }
  }

  if (DIGIT_ORDINAL_SUFFIX.test(script)) {
    DIGIT_ORDINAL_SUFFIX.lastIndex = 0;
    const ordinals = script.match(DIGIT_ORDINAL_SUFFIX) ?? [];
    for (const ord of ordinals) {
      const seq = ord.match(/\d+/)?.[0];
      if (seq && !shouldKeepDigit(seq, allowed)) {
        return `digit ordinal like "${ord.trim()}"`;
      }
    }
    DIGIT_ORDINAL_SUFFIX.lastIndex = 0;
  }

  return null;
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
    /\b(сэмпл|перезапис|дубль|лейбл|продюсер|радио|телевиз|клип|чарт|гитар|барабан|клавиш|оркестр|сакс|труб|скрипк|микрофон|пластинк|кассет|кавер|remix|plagiar|запрет|скандал|плагиат|первый раз|в эфир|на сцене|в раздевалке|сведени|master|микш|репетиц|фестив|Apollo|Abbey|Columbia|EMI|MTV|Grammy|сингл|куплет|мелоди|исполн|запис|верси|оркестр|джаз|свинг|рок|блюз|саксоф|фортеп|ударн|вокал|хор|дириж|композ|оригинал|перевод|эфир|премьер|релиз|дебют|soundtrack|винил|радиол|припев|бридж|solo|соло|ссср|совет|пионер|президент|мозамб|болливуд|железн|латино|реггетон|сальса|бачата|фламенко|танго|серенад|баллад)\b/i;
  return concreteSignals.test(trimmed);
}

function significantWords(text: string): string[] {
  return normalizeForMatch(text)
    .split(' ')
    .filter((word) => word.length >= 5);
}

const CONCEPT_BRIDGES: Array<{ factPattern: RegExp; scriptTokens: string[] }> = [
  { factPattern: /native american/i, scriptTokens: ['индейск', 'коренн', 'плем'] },
  { factPattern: /billboard|hot 100|\bchart\b/i, scriptTokens: ['чарт', 'хит', 'парад'] },
  { factPattern: /\bspotify\b/i, scriptTokens: ['spotify', 'спотиф'] },
  { factPattern: /top five|top 5|top-five|top ten|top 10/i, scriptTokens: ['пятёрк', 'пятер', 'десятк', 'топ'] },
  { factPattern: /number one|#\s*1|no\.?\s*1\b|only.*#1/i, scriptTokens: ['перв', 'единствен', 'лидер', 'номер'] },
  { factPattern: /\bbootleg/i, scriptTokens: ['бутлег', 'подпол', 'нелегал', 'магнит'] },
  { factPattern: /segregat|racial|integrat/i, scriptTokens: ['сегрегац', 'расов', 'интегр', 'черн'] },
  { factPattern: /\bminer|\bcoal|\bmining/i, scriptTokens: ['шахт', 'уголь', 'шахтёр'] },
  { factPattern: /overdub|multi-?track|tape generation/i, scriptTokens: ['дубл', 'плёнк', 'налож', 'поколен'] },
  { factPattern: /shock rock|macabre|theatrical/i, scriptTokens: ['шок', 'театр', 'сцен', 'безум', 'реквиз'] },
  { factPattern: /\bviral\b|reddit|discord/i, scriptTokens: ['вирус', 'reddit', 'discord', 'ажиотаж', 'форум'] },
  { factPattern: /cobain|pixies|pop song/i, scriptTokens: ['кобейн', 'pixies', 'поп', 'панк'] },
  { factPattern: /\bband\b|\bgroup\b/i, scriptTokens: ['групп', 'коллект'] },
  { factPattern: /u\.?\s?s\.?\s?ssr|soviet|eastern bloc|iron curtain/i, scriptTokens: ['ссср', 'совет', 'пионер', 'подпол', 'железн'] },
  { factPattern: /equality|president|black or white|hafanana|take it easy/i, scriptTokens: ['президент', 'равн', 'чёрн', 'бел', 'хафанан', 'равен'] },
  { factPattern: /bollywood|hindi cinema|rd burman|anu malik/i, scriptTokens: ['болливуд', 'индий', 'болlywood', 'кино'] },
  { factPattern: /mozambique|african musician|iron curtain/i, scriptTokens: ['мозамб', 'африк', 'афр'] },
  { factPattern: /bossa nova|jorge ben|mas que nada|samba/i, scriptTokens: ['босса', 'самба', 'жорж', 'бен', 'ритм', 'удар'] },
  { factPattern: /instrumental|wordless|no lyrics/i, scriptTokens: ['без слов', 'инструмент', 'свист', 'крик'] },
  { factPattern: /protest|controvers|prison|police brutality|don't care about us/i, scriptTokens: ['протест', 'тюрьм', 'полиц', 'скандал', 'обществ'] },
  { factPattern: /history album|histrory|anti-?semit|nazi/i, scriptTokens: ['history', 'истори', 'альбом', 'скандал', 'клип'] },
  { factPattern: /jackson|michael/i, scriptTokens: ['джексон', 'мichael', 'king of pop', 'поп'] },
];

function matchesConceptBridge(fact: string, scriptWords: Set<string>): boolean {
  const words = [...scriptWords];
  return CONCEPT_BRIDGES.some(
    (bridge) =>
      bridge.factPattern.test(fact) &&
      bridge.scriptTokens.some((token) => words.some((word) => word.includes(token))),
  );
}

/** Script must reflect at least one reference fact (Wikipedia anchor). */
export function anchorsReferenceFact(script: string, referenceFacts: string[]): boolean {
  if (referenceFacts.length === 0) return true;
  const scriptWords = new Set(significantWords(script));
  return referenceFacts.some((fact) => {
    const factWords = significantWords(fact);
    if (factWords.length > 0) {
      const hits = factWords.filter((word) => scriptWords.has(word)).length;
      const required = factWords.length <= 2 ? factWords.length : Math.max(2, Math.ceil(factWords.length * 0.35));
      if (hits >= required) return true;
    }
    return matchesConceptBridge(fact, scriptWords);
  });
}

export function scriptSimilarity(a: string, b: string): number {
  const wordsA = a.toLowerCase().split(/\s+/).filter(Boolean);
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (wordsA.length === 0 || wordsB.size === 0) return 0;
  const intersection = wordsA.filter((word) => wordsB.has(word)).length;
  return intersection / Math.max(wordsA.length, wordsB.size);
}

export function isDuplicateScript(script: string, previousScripts: string[]): boolean {
  const normalized = script.trim().toLowerCase();
  return previousScripts.some((prev) => {
    const p = prev.trim().toLowerCase();
    return p === normalized || scriptSimilarity(p, normalized) > 0.78;
  });
}

export function validateStoryScript(
  script: string,
  lengthId: StoryLengthId = DEFAULT_STORY_LENGTH,
  artist = '',
  title = '',
  options: {
    strictLength?: boolean;
    skipWatery?: boolean;
    referenceFacts?: string[];
    skipReferenceAnchor?: boolean;
    skipFirstSentenceAnchor?: boolean;
    skipBannedPatterns?: boolean;
    skipEnglishCheck?: boolean;
    /** Override minimum word count (e.g. flash-lite models). */
    minWordsOverride?: number;
    previousScripts?: string[];
  } = {},
): { ok: true } | { ok: false; reason: string } {
  const limits = getStoryLengthPreset(lengthId);
  const strictLength = options.strictLength ?? true;
  const skipWatery = options.skipWatery ?? false;
  const skipReferenceAnchor = options.skipReferenceAnchor ?? false;
  const skipFirstSentenceAnchor = options.skipFirstSentenceAnchor ?? false;
  const skipBannedPatterns = options.skipBannedPatterns ?? false;
  const skipEnglishCheck = options.skipEnglishCheck ?? false;
  const referenceFacts = options.referenceFacts ?? [];
  const previousScripts = options.previousScripts ?? [];
  const trimmed = script.trim();
  if (!trimmed) return { ok: false, reason: 'empty script' };

  if (previousScripts.length > 0 && isDuplicateScript(trimmed, previousScripts)) {
    return { ok: false, reason: 'duplicate of previous script for this track' };
  }

  if (referenceFacts.length === 0) {
    return { ok: false, reason: 'no reference facts — story must be grounded in sources' };
  }

  if (storyNamesForeignArtist(trimmed, artist, title, referenceFacts)) {
    return { ok: false, reason: 'story names a different artist than the track' };
  }

  if (!skipBannedPatterns) {
    for (const pattern of BANNED_SCRIPT_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { ok: false, reason: `banned pattern: ${pattern.source}` };
      }
    }
  }

  if (!skipEnglishCheck && hasEnglishLeak(trimmed, artist, title, { referenceFacts })) {
    return { ok: false, reason: 'english words in Russian narration' };
  }

  const numberIssue = findForbiddenNumbers(trimmed, artist, title, referenceFacts);
  if (numberIssue) {
    return { ok: false, reason: `forbidden numbers: ${numberIssue}` };
  }

  if (!skipWatery) {
    const garbage = findLlmGarbage(trimmed);
    if (garbage) {
      return { ok: false, reason: garbage };
    }
    const platformMismatch =
      referenceFacts.length > 0 ? findFactPlatformMismatch(trimmed, referenceFacts) : null;
    if (platformMismatch) {
      return { ok: false, reason: platformMismatch };
    }
    const fictionIssue = findGenericFiction(trimmed);
    if (fictionIssue) {
      return { ok: false, reason: fictionIssue };
    }
    const ungrounded = findUngroundedClaims(trimmed, referenceFacts);
    if (ungrounded) {
      return { ok: false, reason: ungrounded };
    }
    const waterIssue = findWateryContent(trimmed, artist, title, referenceFacts);
    if (waterIssue) {
      return { ok: false, reason: waterIssue };
    }
  }

  if (
    !skipReferenceAnchor &&
    referenceFacts.length > 0 &&
    !anchorsReferenceFact(trimmed, referenceFacts)
  ) {
    return { ok: false, reason: 'story ignores Wikipedia reference facts' };
  }
  if (referenceFacts.length > 0 && !skipFirstSentenceAnchor && !firstSentenceAnchoredToFact(trimmed, referenceFacts)) {
    return { ok: false, reason: 'first sentence is not anchored to seed fact' };
  }

  const words = countWords(trimmed);
  const minWords =
    options.minWordsOverride ??
    (strictLength ? limits.wordsMin : Math.max(30, limits.wordsMin - 15));

  if (words < minWords) {
    return { ok: false, reason: `too short (${words} words, need ${minWords}+)` };
  }
  if (words > limits.wordsMax + 25) {
    return { ok: false, reason: `too long (${words} words, max ~${limits.wordsMax})` };
  }

  return { ok: true };
}

export function firstSentenceAnchoredToFact(script: string, referenceFacts: string[]): boolean {
  if (referenceFacts.length === 0) return true;
  const firstSentence = script.split(/(?<=[.!?…])\s+/).find(Boolean)?.trim() ?? '';
  if (firstSentence.length < 12) return false;
  return anchorsReferenceFact(firstSentence, referenceFacts);
}

const GENERIC_FICTION_PATTERNS: RegExp[] = [
  /запах\s+(?:сигарет|кофе)/i,
  /на\s+моей\s+полке/i,
  /скрыты(?:й|ого)\s+смысл/i,
  /истори(?:я|ю)\s+о\s+(?:свобод|любви)/i,
  /взрывает\s+сцен/i,
  /пел\s+с\s+огон/i,
  /зрител(?:и|ей)\s+сход/i,
  /не\s+просто\s+весёлы/i,
  /не\s+просто\s+весел/i,
  /откроешь\s+новую\s+гран/i,
  /новую\s+грань\s+в\s+творчеств/i,
  /фанаты\s+спорят\s+о\s+происхожден/i,
  /звучало\s+как\s+революц/i,
  /разорв\w*\s+кабин/i,
  /продюсер\s+добавля/i,
  /записывал\s+.*\s+он\s+пел/i,
  /в\s+студии\s+тогда/i,
  /слушайте,.*взрывает/i,
  /политически\s+неправиль/i,
  /запрещен[аы]?\s+на\s+радио/i,
  /сломал[аи]?\s+правил/i,
  /двойн(?:ую|ой)\s+сесси/i,
  /сотни\s+дубл/i,
  /сотен\s+дубл/i,
  /ломал\w*\s+микрофон/i,
  /сошл\w*\s+с\s+ума/i,
  /настоящ\w*\s+бунт/i,
  /бунт\s+против/i,
  /взорвал\w*\s+эфир/i,
  /нарушил\w*\s+все\s+правил/i,
  /чистая\s+эмоци/i,
  /безумн\w*\s+терпени/i,
  /телефонн\w*\s+лин/i,
  /заставил\w*\s+всех\s+петь/i,
  /никакой\s+маги/i,
  /не\s+просто\s+рок/i,
  /гений\s+не\s+укладывается/i,
  /\bбунт\b/i,
  /не\s+просто\s+(?:трек|песн|рок)/i,
  /настоящ\w*\s+взрыв/i,
  /памятник\s+эпох/i,
  /перевернул\w*\s+(?:всё|мир|музык)/i,
  /изменил\w*\s+.*\s+навсегда/i,
  /ни\s+в\s+один\s+стандарт/i,
  /вызов\s+всем\s+правил/i,
  /фанаты\s+спорят,\s+почему/i,
  /гонения\s+на\s+евреев|разрушение\s+храма/i,
  /готическ(?:ий|ого)\s+роман/i,
  /конца\s+xix\s+века|xix\s+век/i,
  /путешествие\s+в\s+мир/i,
  /не\s+все\s+замечают:.*не\s+просто\s+поп/i,
  /отражение\s+настроений/i,
  /хит-?пара[дт]\w*\s+христиан\w*\s+музык/i,
  /христиан\w*\s+хит-?пара[дт]/i,
  /возглавил\w*\s+.*христиан\w*\s+чарт/i,
];

const UNGROUNDED_CLAIM_CHECKS: Array<{ claim: RegExp; factHint: RegExp }> = [
  {
    claim: /расизм|расист|дискриминац|ксенофоб|равенств\w*\s+и\s+справедливост|важност\w*\s+равенств/i,
    factHint: /racis|discriminat|xenophob|equal|justice|равенств|справедлив|дискримин|расизм/i,
  },
  {
    claim: /политически\s+неправиль|запрещен[аы]?\s+на\s+радио/i,
    factHint: /banned|forbidden|censored|politic|запрет|цензур/i,
  },
  {
    claim: /двойн(?:ую|ой)\s+сесси|сотни\s+дубл|сотен\s+дубл/i,
    factHint: /double\s+session|overdub|hundred|\bдубл|\bсесси/i,
  },
  { claim: /сломал[аи]?\s+правил/i, factHint: /rules?\b|правил/i },
  {
    claim: /хит-?пара[дт]\w*\s+христиан\w*\s+музык|христиан\w*\s+хит-?пара[дт]|христиан\w*\s+чарт/i,
    factHint: /christian|gospel|ccb|christian chart|религиозн|госпел/i,
  },
];

export function findUngroundedClaims(script: string, referenceFacts: string[] = []): string | null {
  const factsText = referenceFacts.join(' ');
  for (const { claim, factHint } of UNGROUNDED_CLAIM_CHECKS) {
    if (claim.test(script) && (referenceFacts.length === 0 || !factHint.test(factsText))) {
      return `ungrounded claim: ${claim.source}`;
    }
  }
  return null;
}

export function findGenericFiction(script: string): string | null {
  for (const pattern of GENERIC_FICTION_PATTERNS) {
    if (pattern.test(script)) {
      return `generic fiction: ${pattern.source}`;
    }
  }
  return null;
}

const LLM_GARBAGE_PATTERNS: RegExp[] = [
  /крутить\s+к\s+блюду/i,
  /\bзвуким\b/i,
  /шлал\s+вспоминать/i,
  /в\s+шаблоне/i,
  /не\s+слух,\s*а\s+чувство/i,
  /звон\s+к\s+памяти/i,
];

export function findLlmGarbage(script: string): string | null {
  for (const pattern of LLM_GARBAGE_PATTERNS) {
    if (pattern.test(script)) {
      return `llm garbage: ${pattern.source}`;
    }
  }
  return null;
}

function findFactPlatformMismatch(script: string, referenceFacts: string[]): string | null {
  const factsText = referenceFacts.join(' ');
  const scriptNorm = normalizeForMatch(script);
  const pairs: Array<{ fact: RegExp; scriptWrong: RegExp; scriptOk: RegExp }> = [
    {
      fact: /\bspotify\b/i,
      scriptWrong: /\bbillboard\b/i,
      scriptOk: /\bspotify\b|\bспотиф/i,
    },
    {
      fact: /\bbillboard\b/i,
      scriptWrong: /\bspotify\b|\bспотиф/i,
      scriptOk: /\bbillboard\b/i,
    },
  ];
  for (const { fact, scriptWrong, scriptOk } of pairs) {
    if (fact.test(factsText) && scriptWrong.test(scriptNorm) && !scriptOk.test(scriptNorm)) {
      return 'platform mismatch between seed fact and story';
    }
  }
  return null;
}

const CLICHE_FILLER_PATTERNS: RegExp[] = [
  /мало кто знает/i,
  /стал[аи]?\s+легенд/i,
  /зал[ауе]?\s+слав/i,
  /трогает\s+сердц/i,
  /суть\s+в\s+том/i,
  /заслуженн\w*\s+место/i,
  /получил[аи]?\s+заслуженн/i,
  /до\s+сих\s+пор\s+трогает/i,
  /именно\s+здесь[^.]{0,40}легенд/i,
  /место\s+в\s+истории\s+музык/i,
  /потрясающ\w*\s+песн\w*,\s+которая\s+заставляет/i,
  /действительно\s+потрясающ/i,
];

export function findClicheFiller(script: string): string | null {
  for (const pattern of CLICHE_FILLER_PATTERNS) {
    if (pattern.test(script)) {
      return `cliche filler: ${pattern.source}`;
    }
  }
  return null;
}

/** Reject generic filler — artist name alone is not enough. */
export function findWateryContent(
  script: string,
  artist = '',
  title = '',
  referenceFacts: string[] = [],
): string | null {
  const garbage = findLlmGarbage(script);
  if (garbage) return garbage;

  if (referenceFacts.length > 0) {
    const platformMismatch = findFactPlatformMismatch(script, referenceFacts);
    if (platformMismatch) return platformMismatch;
  }

  const fiction = findGenericFiction(script);
  if (fiction) return fiction;

  const cliche = findClicheFiller(script);
  if (cliche) return cliche;

  let stripped = script;
  for (const token of [...significantTokens(artist), ...significantTokens(title)]) {
    if (token.length >= 3) {
      stripped = stripped.replace(new RegExp(`\\b${token}\\b`, 'gi'), ' ');
    }
  }
  if (findClicheFiller(stripped)) {
    return 'only artist/title with cliche filler';
  }

  if (referenceFacts.length > 0 && anchorsReferenceFact(script, referenceFacts)) {
    return null;
  }

  const words = countWords(script);
  if (words >= 65 && hasConcreteFact(script, artist, title)) {
    return null;
  }

  if (hasConcreteFact(stripped, '', '')) return null;
  if (hasConcreteFact(script, artist, title)) {
    const scriptNorm = normalizeForMatch(stripped);
    if (scriptNorm.split(' ').filter((w) => w.length >= 5).length >= 3) return null;
  }
  return 'no concrete fact — use detail from seed fact (instrument, label, scandal, sample)';
}
