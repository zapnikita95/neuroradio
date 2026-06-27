import {
  DEFAULT_STORY_LENGTH,
  getStoryLengthPreset,
  StoryLengthId,
  StoryLengthPreset,
} from './story-length.js';
import { COVER_CONTEXT_RE, factMentionsArtist, factMentionsTitle, hasTrackContextSignal, storyMentionsPerformingArtist, storyNamesForeignArtist } from './fact-relevance.js';
import { hasRussianLeak } from './story-english-language.js';
import { repairRussianScriptLanguage } from './story-russian-language.js';
import type { StoryLanguageId } from './story-language.js';
import { prepareStoryScriptLanguage } from './story-english-normalize.js';
import { applyForeignPronunciation } from './tts-foreign-pronounce.js';
import {
  genericizeScriptForVoiceover,
  phraseVariants,
  scriptContainsLatinTrackCitation,
  shouldStripLatinTrackNames,
} from './tts-generic-script.js';
import { isTruncatedMarketingSnippet, isSpeakableReferenceFact } from './web-snippet-accept.js';
import {
  interestScore,
  isAlbumListingSeed,
  isListeningStatsFact,
  isThinReleaseCatalogSeed,
  isStudioEquipmentCatalogSeed,
} from './reference-fact-quality.js';
import { isWeakSnippetSeed } from './search-snippet-salvage.js';
import { fixSoloArtistPronounsRu } from './artist-grammar.js';
import { fixTtsGrammarIssues } from './tts-grammar-fixes.js';
import { isVoiceoverWithoutTrackNames, scriptLeaksVoiceoverNames } from './voiceover-no-names.js';
import { primaryArtistName } from './artist-primary.js';
import { resolveStoryNarrator, type StoryNarratorId } from './story-narrator.js';
import { isStaleClosingCliche, sanitizeClosingTail } from './story-closing-phrases.js';
import { findQuoteSpeakerDrift } from './fact-quote-attribution.js';
import {
  buildArtistScopeStoryPromptBlockRu,
  findArtistBioTrackFalseLinkage,
} from './artist-bio-track-framing.js';

export { DEFAULT_STORY_LENGTH, getStoryLengthPreset };
export type { StoryLengthId, StoryLengthPreset };

/** Podcast-style openers — always reject. */
export const PODCAST_OPENER_PATTERNS: RegExp[] = [
  /^«?\s*знаю\s+(интересн|один|такой|факт)/i,
  /^«?\s*интересн/i,
  /^«?\s*вот что/i,
  /^«?\s*факт\s*:/i,
  /^«?\s*слушай[,]?\s*(факт|интересн)/i,
];

/** Invented first-person scenes — fact grounding violation, not ampoua style. */
export const FABRICATED_SCENE_PATTERNS: RegExp[] = [
  /стоял у мониторов,\s*звукорежиссёры краснели/i,
  /зал замолчал на первой ноте/i,
  /стоял у радиолы/i,
  /помню студию — при записи/i,
  /фанат\s+\S+\s+настояли/i,
  /микрофон еле остыл/i,
  /(?:^|[.!?…]\s*)я (?:сидел|вспоминаю) (?:в )?студии[,]?\s+где/i,
  /^я (?:был|была) в клубе/i,
  /^на сцене артист начинает/i,
  /я помню студию/i,
  /мы были в клубе/i,
  /я стоял у мониторов/i,
  /собирались по вечерам/i,
  /забыл обо вс[её]м/i,
  /танцевали на стульях/i,
  /запах\s+(?:сигарет|кофе)/i,
  /записывал\s+.*\s+он\s+пел/i,
  /в\s+студии\s+тогда/i,
  /слушайте,.*взрывает/i,
];

/** System/meta leaks in narration. */
export const META_LEAK_PATTERNS: RegExp[] = [/music story/i, /\bwikipedia\b/i];

/**
 * Hard rejects: hallucinations, fake scenes, podcast framing.
 * Not ampoua clichés — «согласно», «уникальный», «легендарный» belong in PERSONA or prompt only.
 */
export const HARD_SCRIPT_REJECT_PATTERNS: RegExp[] = [
  ...PODCAST_OPENER_PATTERNS,
  ...FABRICATED_SCENE_PATTERNS,
  ...META_LEAK_PATTERNS,
  /зал просто сходит с ума/i,
  /зрители в экстазе/i,
  /разорв\w*\s+кабин/i,
  /разорвёт\s+кабин/i,
  /заставляет\s+задуматься\s+о\s+важности/i,
  /тем[аыу]\s+расизм/i,
  /наполнен\w*\s+темой\s+расизм/i,
  /личн\w*\s+опыт\w*\s+с\s+расизмом/i,
  /элвис в огне/i,
  /\bдостав(?:ка|ки|кой|ку|ок)\b/i,
  /подсказывает\s+[A-Z]/i,
  /подсказывает\s+«?[A-Za-z]/i,
  /готическ(?:ий|ого)\s+роман/i,
  /конца\s+xix\s+века|xix\s+век/i,
  /гонения\s+на\s+евреев|разрушение\s+храма/i,
  /ради\s+чего\s+\S+\s+(?:оставал\w*|задерживал\w*)\s+после/i,
  /Первые\s+(?:секунды|кадры|ноты|такты|аккорды)\s*[—–-]\s*то,\s*ради\s+чего/i,
  /(?:монтаж|микш)\w*\s+(?:оставал\w*|задерживал\w*)\s+после\s+(?:смены|монтажа)/i,
  /После такой истории\s+трек\s+звучит\s+не\s+как/i,
  /звучит\s+не\s+как\s+(?:filler|филлер)/i,
  /отделяют\s+хит\s+от\s+filler/i,
  /отделяют\s+хит\s+от\s+филлер/i,
  /\bне\s+как\s+filler,\s*а\s+как\s+событие/i,
];

/**
 * Ampoua / narrator clichés — только подсказки в промпте.
 * В production (skipPersonaCliches) не режут текст: «согласно», «уникальный», «не просто трек» допустимы,
 * если история опирается на seed-факт.
 */
export const PERSONA_CLICHE_PATTERNS: RegExp[] = [
  /вкладывает душу/i,
  /магия музыки/i,
  /влия(?:ет|ли|ющ)/i,
  /легендарн/i,
  /уникальн/i,
  /согласно/i,
  /суть в том, что/i,
  /суть\s+в\s+том/i,
  /понял[а]?, что музыка/i,
  /музыка может соедин/i,
  /чрезвычайно влия/i,
  /сделает.*классик/i,
  /характерный.*рифф/i,
  /мало кто знает/i,
  /стал[аи]?\s+легенд/i,
  /зал[ауе]?\s+слав/i,
  /трогает\s+сердц/i,
  /заслуженн\w*\s+место/i,
  /получил[аи]?\s+заслуженн/i,
  /до\s+сих\s+пор\s+трогает/i,
  /именно\s+здесь[^.]{0,40}легенд/i,
  /место\s+в\s+истории\s+музык/i,
  /потрясающ\w*\s+песн\w*,\s+которая\s+заставляет/i,
  /действительно\s+потрясающ/i,
  /скрыты(?:й|ого)\s+смысл/i,
  /истори(?:я|ю)\s+о\s+(?:свобод|любви)/i,
  /взрывает\s+сцен/i,
  /пел\s+с\s+огон/i,
  /зрител(?:и|ей)\s+сход/i,
  /не\s+просто\s+весёлы/i,
  /не\s+просто\s+весел/i,
  /не\s+просто\s+рок/i,
  /не\s+просто\s+(?:трек|песн|рок|групп)/i,
  /откроешь\s+новую\s+гран/i,
  /новую\s+грань\s+в\s+творчеств/i,
  /фанаты\s+спорят\s+о\s+происхожден/i,
  /фанаты\s+спорят,\s+почему/i,
  /звучало\s+как\s+революц/i,
  /продюсер\s+добавля/i,
  /ломал\w*\s+микрофон/i,
  /сошл\w*\s+с\s+ума/i,
  /настоящ\w*\s+бунт/i,
  /бунт\s+против/i,
  /\bбунт\b/i,
  /взорвал\w*\s+эфир/i,
  /чистая\s+эмоци/i,
  /безумн\w*\s+терпени/i,
  /телефонн\w*\s+лин/i,
  /заставил\w*\s+всех\s+петь/i,
  /никакой\s+маги/i,
  /гений\s+не\s+укладывается/i,
  /настоящ\w*\s+взрыв/i,
  /памятник\s+эпох/i,
  /перевернул\w*\s+(?:всё|мир|музык)/i,
  /изменил\w*\s+.*\s+навсегда/i,
  /ни\s+в\s+один\s+стандарт/i,
  /вызов\s+всем\s+правил/i,
  /путешествие\s+в\s+мир/i,
  /не\s+все\s+замечают:.*не\s+просто\s+поп/i,
  /отражение\s+настроений/i,
  /хит-?пара[дт]\w*\s+христиан\w*\s+музык/i,
  /христиан\w*\s+хит-?пара[дт]/i,
  /возглавил\w*\s+.*христиан\w*\s+чарт/i,
  /настоящ(?:им|ый|ей)\s+прорыв/i,
  /прорыв(?:ом)?\s+для\s+(?:группы|коллектива|артист)/i,
  /вступлени(?:е|я)\s+держит\s+внимание/i,
  /лучше\s+любого\s+джингла/i,
  /не\s+пролистываешь/i,
  /на\s+эфире\s+такие\s+вступлен/i,
  /замираю\s+—\s+будто\s+снова\s+в\s+тех\s+годах/i,
];

/** @deprecated Prefer HARD_SCRIPT_REJECT_PATTERNS + PERSONA_CLICHE_PATTERNS. */
export const BANNED_SCRIPT_PATTERNS: RegExp[] = [
  ...HARD_SCRIPT_REJECT_PATTERNS,
  ...PERSONA_CLICHE_PATTERNS,
];

export function findHardScriptViolation(script: string): string | null {
  for (const pattern of HARD_SCRIPT_REJECT_PATTERNS) {
    if (pattern.test(script)) {
      return `hard reject: ${pattern.source}`;
    }
  }
  return null;
}

const EN_HARD_SCRIPT_REJECT_PATTERNS: RegExp[] = [
  /\bpitchfork\s+nailed\s+it\b/i,
  /\bnailed\s+it\s+when\s+they\b/i,
  /\bthat\s+pitchfork\s+review\s+nailed\b/i,
  /\bjill\s+mapes\s+nailed\b/i,
  /\b(?:the\s+)?review\s+nailed\s+it\b/i,
];

const EN_UNGROUNDED_FICTION_PATTERNS: Array<{ claim: RegExp; factHint: RegExp }> = [
  { claim: /\b(?:my\s+)?vinyl\s+copy\b/i, factHint: /\bvinyl\b/i },
  { claim: /\bscouring\s+record\s+stores\b/i, factHint: /\brecord\s+store\b/i },
  { claim: /\bworn[- ]out\s+tour\s+tee\b/i, factHint: /\btour\s+tee\b/i },
  { claim: /\btiny\s+apartment\b/i, factHint: /\bapartment\b/i },
  { claim: /\bmotel\s+room/i, factHint: /\bmotel\b/i },
  { claim: /\b(?:between|in)\s+tour\s+van/i, factHint: /\btour\s+van\b/i },
  { claim: /\byou\s+can\s+hear\s+it\s+live\b/i, factHint: /\blive\b/i },
  { claim: /\bindefinite\s+hiatus\b/i, factHint: /\bhiatus\b/i },
];

export function findEnglishScriptViolation(
  script: string,
  referenceFacts: string[] = [],
): string | null {
  for (const pattern of EN_HARD_SCRIPT_REJECT_PATTERNS) {
    if (pattern.test(script)) {
      return `english hard reject: ${pattern.source}`;
    }
  }
  const factsText = referenceFacts.join(' ');
  for (const { claim, factHint } of EN_UNGROUNDED_FICTION_PATTERNS) {
    if (claim.test(script) && (referenceFacts.length === 0 || !factHint.test(factsText))) {
      return `english ungrounded fiction: ${claim.source}`;
    }
  }
  return null;
}

export function findPersonaCliche(script: string): string | null {
  for (const pattern of PERSONA_CLICHE_PATTERNS) {
    if (pattern.test(script)) {
      return `persona cliche: ${pattern.source}`;
    }
  }
  return null;
}

const CYR = '[а-яё]+';
const SPELLED_YEAR_PATTERN = new RegExp(
  `(?:^|[\\s,.«"—-])(?:тысяча\\s+девятьсот(?:\\s+${CYR})?|двухтысяч${CYR}|пятидесят${CYR}|шестидесят${CYR}|семидесят${CYR}|восьмидесят${CYR}|девяност${CYR})(?=[\\s,.!?»"—-]|$)`,
  'giu',
);

const DIGIT_ORDINAL_SUFFIX =
  /\d+\s*[-–—]?\s*(?:й|го|м|х|е|ем|ом|ую|ая|ые|ых)(?=[\s,.!?»"—-]|$)/giu;
/** Do not treat «-х» in «80-х» as orphan — hyphen after digit is decade ordinal, not a separator. */
const ORPHAN_ORDINAL_SUFFIX =
  /(?:^|(?<!\d)[\s,.«"—-])\s*[-–—]?(?:й|го|м|х|е|ем|ом)(?=[\s,.!?»"—-]|$)/giu;

const DECADE_ORDINAL_RE = /\b((?:19|20)?\d{2})\s*[-–—]?\s*х\b/giu;
const DECADE_SLOT = '\uE014D';
const DECADE_SLOT_END = '\uE015D';

function maskDecadeOrdinals(text: string): { masked: string; decades: string[] } {
  const decades: string[] = [];
  const masked = text.replace(DECADE_ORDINAL_RE, (match) => {
    const idx = decades.length;
    decades.push(match);
    return `${DECADE_SLOT}${idx}${DECADE_SLOT_END}`;
  });
  return { masked, decades };
}

function unmaskDecadeOrdinals(text: string, decades: string[]): string {
  return text.replace(
    new RegExp(`${DECADE_SLOT}(\\d+)${DECADE_SLOT_END}`, 'g'),
    (_, index) => decades[Number(index)] ?? '',
  );
}

function isDecadeOrdinalMatch(match: string): boolean {
  return /^(?:19|20)?\d{2}\s*[-–—]?\s*х$/iu.test(match.trim());
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const INCOMPLETE_TRAILING_CLAUSE_RE =
  /\s+(?:как|что|где|когда|чтобы|если|пока|хотя|котор(?:ый|ая|ое|ые)|и|а|но|или)\s*$/iu;

/** Script ends mid-sentence — LLM token cut or bad fallback; must not go to TTS. */
export function findIncompleteEnding(script: string): string | null {
  const trimmed = script.trim();
  if (!trimmed) return 'empty script';
  if (/[.!?…]$/.test(trimmed)) return null;
  if (INCOMPLETE_TRAILING_CLAUSE_RE.test(trimmed)) return 'incomplete trailing clause';
  if (/[,;:—–-]\s*$/.test(trimmed)) return 'incomplete trailing punctuation';
  return 'missing sentence ending';
}

/** Drop unfinished tail after the last complete sentence (TTS safety net). */
export function trimToLastCompleteSentence(script: string): string {
  const trimmed = script.trim();
  if (/[.!?…]$/.test(trimmed)) return trimmed;

  let lastEnd = -1;
  for (const ch of ['.', '!', '?', '…']) {
    lastEnd = Math.max(lastEnd, trimmed.lastIndexOf(ch));
  }
  if (lastEnd >= 40) {
    return trimmed.slice(0, lastEnd + 1).trim();
  }
  return trimmed;
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

const QUOTED_PASSAGE_RE = /«[^»]+»|[\u201c""][^\u201d""]+[\u201d""]|"[^"]+"/g;
const QUOTE_PLACEHOLDER = '\uE000Q';
const QUOTE_PLACEHOLDER_END = '\uE001';

function maskQuotedPassages(text: string): { masked: string; quotes: string[] } {
  const quotes: string[] = [];
  const masked = text.replace(QUOTED_PASSAGE_RE, (quote) => {
    const idx = quotes.length;
    quotes.push(quote);
    return `${QUOTE_PLACEHOLDER}${idx}${QUOTE_PLACEHOLDER_END}`;
  });
  return { masked, quotes };
}

function unmaskQuotedPassages(text: string, quotes: string[]): string {
  return text.replace(
    new RegExp(`${QUOTE_PLACEHOLDER}(\\d+)${QUOTE_PLACEHOLDER_END}`, 'g'),
    (_, index) => quotes[Number(index)] ?? '',
  );
}

export function stripTrackTitleGuillemets(script: string, title: string): string {
  const variants = [
    title.trim(),
    title.replace(/\s*\([^)]*\)\s*/g, ' ').trim(),
  ].filter((v, i, arr) => v.length >= 2 && arr.indexOf(v) === i);

  let result = script;
  for (const variant of variants) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`«\\s*${escaped}\\s*»`, 'gi'), variant);
    result = result.replace(new RegExp(`[\\u201c""]\\s*${escaped}\\s*[\\u201d""]`, 'gi'), variant);
    result = result.replace(new RegExp(`'\\s*${escaped}\\s*'`, 'gi'), variant);
  }
  return result;
}

const STAGE_NAME_RE = /\b[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+\b/gi;
const STAGE_NAME_PLACEHOLDER = '\uE010SN';
const STAGE_NAME_END = '\uE011';

function maskDottedStageNames(text: string): { masked: string; names: string[] } {
  const names: string[] = [];
  const masked = text.replace(STAGE_NAME_RE, (name) => {
    const idx = names.length;
    names.push(name);
    return `${STAGE_NAME_PLACEHOLDER}${idx}${STAGE_NAME_END}`;
  });
  return { masked, names };
}

function unmaskDottedStageNames(text: string, names: string[]): string {
  return text.replace(
    new RegExp(`${STAGE_NAME_PLACEHOLDER}(\\d+)${STAGE_NAME_END}`, 'g'),
    (_, index) => names[Number(index)] ?? '',
  );
}

export function sanitizeScriptForTts(
  script: string,
  artist: string,
  title: string,
  referenceFacts: string[] = [],
  options?: {
    speakTrackNamesInVoiceover?: boolean;
    trackArtist?: string;
    trackTitle?: string;
    storyLanguage?: StoryLanguageId;
    /** Edge TTS: не транслитерировать латиницу в кириллицу — EN-голос Edge. */
    skipForeignPhonetic?: boolean;
  },
): string {
  if (options?.storyLanguage === 'en') {
    let result = script.trim().replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
    result = sanitizeClosingTail(result, 'en');
    return stripBannedFluff(result);
  }
  let result = stripLlmStressLeakage(sanitizeClosingTail(script.trim(), 'ru'));
  const allowed = allowedDigitSequences(artist, title, referenceFacts);
  const blockArtist = options?.trackArtist ?? artist;
  const blockTitle = options?.trackTitle ?? title;
  const speakNames = options?.speakTrackNamesInVoiceover === true;
  const { text: localized } = prepareStoryScriptLanguage(result, {
    artist: blockArtist,
    title: blockTitle,
    referenceFacts,
    speakTrackNamesInVoiceover: speakNames,
  });
  result = stripTrackTitleGuillemets(localized, title);

  const { masked: decadeMasked, decades: decadeSlots } = maskDecadeOrdinals(result);
  result = decadeMasked;

  result = result.replace(DIGIT_ORDINAL_SUFFIX, (match) => {
    DECADE_ORDINAL_RE.lastIndex = 0;
    if (isDecadeOrdinalMatch(match)) return match;
    const digits = match.match(/\d+/)?.[0];
    return digits && shouldKeepDigit(digits, allowed) ? match : ' тогда ';
  });
  DIGIT_ORDINAL_SUFFIX.lastIndex = 0;
  result = result.replace(/\d+/g, (match) => (shouldKeepDigit(match, allowed) ? match : ''));
  const { masked: stageMasked, names: stageNames } = maskDottedStageNames(result);
  const { masked, quotes } = maskQuotedPassages(stageMasked);
  result = unmaskQuotedPassages(masked, quotes);
  result = unmaskDottedStageNames(result, stageNames);
  result = result.replace(ORPHAN_ORDINAL_SUFFIX, ' тогда ');
  ORPHAN_ORDINAL_SUFFIX.lastIndex = 0;
  result = unmaskDecadeOrdinals(result, decadeSlots);
  result = repairOrphanDatePhrases(result, referenceFacts);

  if (
    !speakNames &&
    (shouldStripLatinTrackNames(blockArtist) || shouldStripLatinTrackNames(blockTitle))
  ) {
    result = genericizeScriptForVoiceover(result, blockArtist, blockTitle);
  }

  // Yandex: кириллическая фонетика для латиницы. Edge: skipForeignPhonetic + native EN voice.
  if (!speakNames && !options?.skipForeignPhonetic) {
    result = applyForeignPronunciation(result, '', '');
  }

  result = result.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
  result = stripBannedFluff(result);
  result = fixSoloArtistPronounsRu(result, blockArtist);
  result = fixTtsGrammarIssues(result, { artist: blockArtist, title: blockTitle });

  return result;
}

/** TTS cleanup — whitespace only; do not rewrite grounded wording («уникальный», «согласно»). */
export function stripBannedFluff(text: string): string {
  return text.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
}

/** LLM sometimes leaks Yandex SpeechKit «+» stress marks into story text — never store them. */
export function stripLlmStressLeakage(text: string): string {
  return text.replace(/\+/g, '');
}

/** Soft flags for client/logs — story still ships but may need user scrutiny. */
export function detectStoryQualityWarnings(
  script: string,
  referenceFacts: string[] = [],
): string[] {
  const warnings: string[] = [];
  const seed = referenceFacts.join(' ').toLowerCase();
  const lower = script.toLowerCase();

  const liveQuote =
    /(?:встал перед (?:аудиторией|публикой|концертом)|сказал (?:аудитории|публике|толпе)|объявил (?:перед )?(?:аудитории|публике))/i;
  if (liveQuote.test(script) && !liveQuote.test(seed)) {
    warnings.push('possible_unverified_live_quote');
  }

  if (
    /(?:божеств|богин|мифolog|archer|легенд(?:а|e) о лучник)/i.test(lower) &&
    !/(?:божеств|мифolog|archer|mytholog)/i.test(seed) &&
    /misheard|misinterpret|неправильно слыш|misheard and vastly/i.test(seed)
  ) {
    warnings.push('possible_fact_misread');
  }

  return warnings;
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

/** «почти тысяч» / «около миллион» — количество без числа, TTS скипнет. */
export function findOrphanQuantityPhrase(script: string): string | null {
  const broken =
    /(?:^|[\s,.«"—-])(?:почти|около|более|свыше|примерно)\s+(?:тысяч|миллион|миллиона|миллионов|сот(?:ен)?)(?=[\s,.!?»"—-]|$)/iu;
  if (!broken.test(script)) return null;
  const withNumber =
    /(?:^|[\s,.«"—-])(?:один|одна|одно|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать|тринадцать|четырнадцать|пятнадцать|шестнадцать|семнадцать|восемнадцать|девятнадцать|двадцать|тридцать|сорок|пятьдесят|шестьдесят|семьдесят|восемьдесят|девяносто|сто|двести|триста|четыреста|пятьсот|шестьсот|семьсот|восемьсот|девятьсот|полтора|полмиллиона|миллиард)\s+(?:тысяч|миллион)/iu;
  if (withNumber.test(script)) return null;
  return 'orphan quantity phrase without number';
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
  if (/видеоклип|music\s+video|directed\s+by|режисс[ёе]р|снял\s+клип/i.test(trimmed)) return true;
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
  {
    factPattern: /9\/11|september 11|influenced by the events|war on terror/i,
    scriptTokens: ['сентябр', 'террор', 'трагед', 'атак', 'конфликт', 'войн', 'договор', 'мир'],
  },
  {
    factPattern: /gerard way|new york|teenagers|youth culture/i,
    scriptTokens: ['gerard', 'джерард', 'нью', 'йорк', 'подрост', 'молод', 'толп', 'сверст'],
  },
  { factPattern: /history album|histrory|anti-?semit|nazi/i, scriptTokens: ['history', 'истори', 'альбом', 'скандал', 'клип'] },
  { factPattern: /jackson|michael/i, scriptTokens: ['джексон', 'мichael', 'king of pop', 'поп'] },
  {
    factPattern: /cover|haiducii|permission|betrayal|without.*consent|кавer|предатель|разрешен/i,
    scriptTokens: ['кавer', 'haiducii', 'предатель', 'разрешен', 'соглас', 'без спрос', 'перепел', 'cover'],
  },
  {
    factPattern: /disband|break.?up|announced.*leav/i,
    scriptTokens: ['распад', 'disband', 'разошл', 'покинул', 'ушли', 'распал'],
  },
  { factPattern: /\bluminate\b/i, scriptTokens: ['luminate', 'люмин'] },
  {
    factPattern: /stream|on-?demand|audio stream|plays?\b/i,
    scriptTokens: ['стрим', 'прослуш', 'поток', 'потоков'],
  },
  {
    factPattern: /billion|\d+\.\d+\s*b\b|\d+\s*billion/i,
    scriptTokens: ['миллиард', 'млрд', 'billion', 'полтора', 'полутора'],
  },
  {
    factPattern: /million|\d+\.\d+\s*m\b|\d+\s*million/i,
    scriptTokens: ['миллион', 'million'],
  },
  {
    factPattern: /second biggest|#\s*2|no\.?\s*2|top two|2nd\b/i,
    scriptTokens: ['втор', 'second', 'два'],
  },
  {
    factPattern: /midyear|mid-?year|first half|half.?year|six months/i,
    scriptTokens: ['полугод', 'середин', 'шесть месяц', 'полгода', 'midyear'],
  },
  {
    factPattern: /youtube|music video|\bviews?\b|billion views|million views/i,
    scriptTokens: ['youtube', 'ютуб', 'клип', 'просмотр', 'видео'],
  },
  {
    factPattern: /\bdirected\b|co-?direct|music video|video clip/i,
    scriptTokens: ['режисс', 'клип', 'видеоклип', 'снял', 'видео', 'постанов', 'ролик', 'кадр'],
  },
  {
    factPattern: /j[eéè]rome\s+guiot|guiot/i,
    scriptTokens: ['гио', 'guiot', 'жером', 'ж+ером', 'ж+ероме'],
  },
  {
    factPattern: /paul\s+van\s+haver|stromae/i,
    scriptTokens: ['stromae', 'стром', 'parker', 'паркер', 'van haver'],
  },
  {
    factPattern: /rwand|belgian|belgium|brussels|parents?|born in|raised in|childhood/i,
    scriptTokens: [
      'руанд',
      'бельг',
      'брюсс',
      'родил',
      'семь',
      'корн',
      'происх',
      'отец',
      'мать',
      'детств',
      'вырос',
    ],
  },
  {
    factPattern: /collaborat|featur|guest|duet|together with|wrote with|co-?writ/i,
    scriptTokens: ['коллаб', 'feat', 'дуэт', 'вместе', 'соавтор', 'приглас', 'записал'],
  },
  {
    factPattern: /sampled|sampling|sample from|based on|interpolation/i,
    scriptTokens: ['сэмпл', 'sample', 'основ', 'заимств', 'перезапис', 'фрагмент'],
  },
  {
    factPattern: /france|french|ultratop|sncf|french charts?/i,
    scriptTokens: ['франц', 'чарт', 'строчк', 'топ'],
  },
  {
    factPattern: /basement|home studio|\$\d+|microphone|cheap mic/i,
    scriptTokens: ['подвал', 'домашн', 'микрофон', 'студи', 'бюджет', 'дешёв', 'дешев'],
  },
];

const GENERIC_FACT_WORDS = new Set([
  'about',
  'after',
  'audio',
  'became',
  'being',
  'biggest',
  'billion',
  'demand',
  'during',
  'earning',
  'first',
  'from',
  'globally',
  'global',
  'have',
  'million',
  'midyear',
  'music',
  'number',
  'report',
  'second',
  'since',
  'song',
  'stream',
  'streams',
  'that',
  'their',
  'third',
  'through',
  'video',
  'views',
  'which',
  'with',
  'world',
]);

function distinctiveLatinTokens(fact: string): string[] {
  const tokens = new Set<string>();
  for (const match of fact.matchAll(/\b[A-Za-z][A-Za-z0-9'.-]{2,}\b/g)) {
    const raw = match[0]!;
    const lower = raw.toLowerCase().replace(/['']s$/i, '');
    if (lower.length >= 4 && !GENERIC_FACT_WORDS.has(lower)) {
      tokens.add(lower);
    }
  }
  return [...tokens];
}

function matchesLatinBrandAnchor(fact: string, scriptNorm: string): boolean {
  return distinctiveLatinTokens(fact).some((token) => scriptNorm.includes(token));
}

function matchesNumericBridge(fact: string, script: string): boolean {
  const scriptLower = script.toLowerCase();
  if (/\d[\d.,]*\s*(?:billion|million|миллиард|миллион|млрд)\b/i.test(scriptLower)) {
    if (/\d[\d.,]*\s*(?:billion|million)\b/i.test(fact)) return true;
    if (/\bmillion\b|\bbillion\b/i.test(fact)) return true;
  }
  if (/миллиард|млрд/i.test(scriptLower) && /\bbillion\b/i.test(fact)) return true;
  if (/миллион/i.test(scriptLower) && /\bmillion\b/i.test(fact)) return true;
  return false;
}

function matchesConceptBridge(fact: string, scriptWords: Set<string>): boolean {
  const words = [...scriptWords];
  return CONCEPT_BRIDGES.some(
    (bridge) =>
      bridge.factPattern.test(fact) &&
      bridge.scriptTokens.some((token) => words.some((word) => word.includes(token))),
  );
}

/** Skip anchor check when reference facts are SEO junk — LLM may still produce valid lore. */
export function referenceFactsAreAnchorable(
  referenceFacts: string[],
  artist = '',
  title = '',
): boolean {
  return referenceFacts.some((f) => {
    if (isListeningStatsFact(f) || isAlbumListingSeed(f) || isWeakSnippetSeed(f, interestScore(f), title)) {
      return false;
    }
    if (!isSpeakableReferenceFact(f, artist, title)) return false;
    if (artist.trim() && title.trim()) {
      const mentionsArtist = factMentionsArtist(f, artist);
      const mentionsTitle = factMentionsTitle(f, title);
      if (!mentionsArtist && !mentionsTitle && !hasTrackContextSignal(f)) return false;
    }
    return true;
  });
}

/** Script must reflect at least one reference fact (Wikipedia anchor). */
export function anchorsReferenceFact(script: string, referenceFacts: string[]): boolean {
  if (referenceFacts.length === 0) return true;
  const scriptNorm = normalizeForMatch(script);
  const scriptWordSet = new Set(significantWords(script));
  for (const token of significantTokens(script)) {
    if (token.length >= 4) scriptWordSet.add(token);
  }

  return referenceFacts.some((fact) => {
    if (matchesConceptBridge(fact, scriptWordSet)) return true;
    if (matchesLatinBrandAnchor(fact, scriptNorm)) return true;
    if (matchesNumericBridge(fact, script)) return true;
    const factTokens = [
      ...significantWords(fact),
      ...significantTokens(fact).filter((t) => t.length >= 4),
    ];
    const uniqueFact = [...new Set(factTokens)];
    if (uniqueFact.length === 0) return false;

    const hits = uniqueFact.filter((word) => scriptNorm.includes(word)).length;
    if (hits >= 2) return true;
    if (uniqueFact.length <= 3 && hits >= 1) return true;
    const required = Math.max(2, Math.ceil(uniqueFact.length * 0.25));
    return hits >= required;
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
    /** Production: skip ampoua clichés when facts anchor the story. */
    skipPersonaCliches?: boolean;
    skipEnglishCheck?: boolean;
    skipRussianCheck?: boolean;
    storyLanguage?: StoryLanguageId;
    /** Override minimum word count (e.g. flash-lite models). */
    minWordsOverride?: number;
    previousScripts?: string[];
    speakTrackNamesInVoiceover?: boolean;
    storyNarrator?: StoryNarratorId;
  } = {},
): { ok: true } | { ok: false; reason: string } {
  const limits = getStoryLengthPreset(lengthId);
  const strictLength = options.strictLength ?? true;
  const skipWatery = options.skipWatery ?? false;
  const skipReferenceAnchor = options.skipReferenceAnchor ?? false;
  const skipFirstSentenceAnchor = options.skipFirstSentenceAnchor ?? false;
  const skipBannedPatterns = options.skipBannedPatterns ?? false;
  const skipPersonaCliches = options.skipPersonaCliches ?? false;
  const skipEnglishCheck =
    options.skipEnglishCheck ?? options.storyLanguage === 'en';
  const skipRussianCheck =
    options.skipRussianCheck ?? options.storyLanguage !== 'en';
  const referenceFacts = options.referenceFacts ?? [];
  const previousScripts = options.previousScripts ?? [];
  const noTrackNames = isVoiceoverWithoutTrackNames(options.speakTrackNamesInVoiceover);
  const storyLang = options.storyLanguage ?? 'ru';
  let trimmed = stripLlmStressLeakage(sanitizeClosingTail(script.trim(), storyLang));
  if (!trimmed) return { ok: false, reason: 'empty script' };

  if (storyLang === 'ru' && !skipEnglishCheck) {
    trimmed = repairRussianScriptLanguage(trimmed, artist, title, referenceFacts);
  }

  if (noTrackNames) {
    const leak = scriptLeaksVoiceoverNames(trimmed, artist, title);
    if (leak) return { ok: false, reason: leak };
  }

  if (previousScripts.length > 0 && isDuplicateScript(trimmed, previousScripts)) {
    return { ok: false, reason: 'duplicate of previous script for this track' };
  }

  const templateClosing = /После такой истории\s+трек\s+звучит|звучит\s+не\s+как\s+(?:filler|филлер)|отделяют\s+хит\s+от\s+(?:filler|филлер)/i;
  if (templateClosing.test(trimmed)) {
    return { ok: false, reason: 'template closing phrase — write a fresh reaction to the seed fact' };
  }
  if (isStaleClosingCliche(trimmed)) {
    return {
      ok: false,
      reason:
        'stale radio closing cliché — keep the idea (strong fact for air) but rephrase in fresh words',
    };
  }
  const quoteDrift = findQuoteSpeakerDrift(trimmed, referenceFacts[0] ?? '');
  if (quoteDrift) {
    return { ok: false, reason: quoteDrift };
  }
  if (
    previousScripts.some((prev) => templateClosing.test(prev)) &&
    /(?:не\s+как\s+(?:filler|филлер)|а\s+как\s+событие)/i.test(trimmed)
  ) {
    return { ok: false, reason: 'repeated filler/событие closing from a previous story' };
  }

  if (referenceFacts.length === 0) {
    return { ok: false, reason: 'no reference facts — story must be grounded in sources' };
  }

  if (storyNamesForeignArtist(trimmed, artist, title, referenceFacts)) {
    return { ok: false, reason: 'story names a different artist than the track' };
  }

  const coverStory = referenceFacts.some((f) => COVER_CONTEXT_RE.test(f));
  if (
    !noTrackNames &&
    !coverStory &&
    !storyMentionsPerformingArtist(trimmed, artist, title)
  ) {
    return { ok: false, reason: 'story does not mention the performing artist' };
  }

  if (
    !noTrackNames &&
    (shouldStripLatinTrackNames(artist) || shouldStripLatinTrackNames(title)) &&
    !scriptContainsLatinTrackCitation(trimmed, artist, title)
  ) {
    return {
      ok: false,
      reason: 'voiceover names mode requires Latin artist or track name in script',
    };
  }

  if (!noTrackNames && artist.trim() && title.trim()) {
    const nameRep = findExcessiveNameRepetition(
      trimmed,
      artist,
      title,
      options.storyNarrator,
      options.speakTrackNamesInVoiceover,
    );
    if (nameRep) {
      return { ok: false, reason: nameRep };
    }
  }

  if (!skipBannedPatterns) {
    const hard = findHardScriptViolation(trimmed);
    if (hard) {
      return { ok: false, reason: hard };
    }
    if (options.storyLanguage === 'en') {
      const enHard = findEnglishScriptViolation(trimmed, referenceFacts);
      if (enHard) {
        return { ok: false, reason: enHard };
      }
    }
    if (!skipPersonaCliches) {
      const persona = findPersonaCliche(trimmed);
      if (persona) {
        return { ok: false, reason: persona };
      }
    }
  }

  if (!skipRussianCheck && hasRussianLeak(trimmed, artist, title)) {
    return { ok: false, reason: 'cyrillic in English narration' };
  }

  const numberIssue = findForbiddenNumbers(trimmed, artist, title, referenceFacts);
  if (numberIssue) {
    return { ok: false, reason: `forbidden numbers: ${numberIssue}` };
  }

  const orphanQty = findOrphanQuantityPhrase(trimmed);
  if (orphanQty) {
    return { ok: false, reason: orphanQty };
  }

  if (!skipWatery) {
    const garbage = findLlmGarbage(trimmed, {
      allowVoiceoverPlaceholders: noTrackNames,
      skipHitMemoryWhenGrounded: true,
      referenceFacts,
    });
    if (garbage) {
      return { ok: false, reason: garbage };
    }
    const platformMismatch =
      referenceFacts.length > 0 ? findFactPlatformMismatch(trimmed, referenceFacts) : null;
    if (platformMismatch) {
      return { ok: false, reason: platformMismatch };
    }
    const trackMisattribution = findArtistSeedTrackMisattribution(trimmed, title, referenceFacts);
    if (trackMisattribution) {
      return { ok: false, reason: trackMisattribution };
    }
    const bioTrackLinkage = findArtistBioTrackFalseLinkage(trimmed, title, referenceFacts);
    if (bioTrackLinkage) {
      return { ok: false, reason: bioTrackLinkage };
    }
    const newsBleed = findNewsSeedBleedIntoRecordingStory(trimmed, title, referenceFacts);
    if (newsBleed) {
      return { ok: false, reason: newsBleed };
    }
    const offSeed = findOffSeedInvention(trimmed, referenceFacts);
    if (offSeed) {
      return { ok: false, reason: offSeed };
    }
    const fictionIssue = skipPersonaCliches ? null : findGenericFiction(trimmed);
    if (fictionIssue) {
      return { ok: false, reason: fictionIssue };
    }
    const ungrounded = findUngroundedClaims(trimmed, referenceFacts, {
      storyNarrator: options.storyNarrator,
    });
    if (ungrounded) {
      return { ok: false, reason: ungrounded };
    }
    const waterIssue = findWateryContent(trimmed, artist, title, referenceFacts, {
      skipPersonaCliches,
      storyNarrator: options.storyNarrator,
    });
    if (waterIssue) {
      return { ok: false, reason: waterIssue };
    }
    const nostalgiaFluff = findNostalgiaFluffOnThinSeed(trimmed, referenceFacts, options.storyNarrator);
    if (nostalgiaFluff) {
      return { ok: false, reason: nostalgiaFluff };
    }
    const accidentalSingle = findAccidentalSingleClicheOnThinSeed(trimmed, referenceFacts);
    if (accidentalSingle) {
      return { ok: false, reason: accidentalSingle };
    }
    const gearSpam = findStudioGearBrandSpam(trimmed, referenceFacts);
    if (gearSpam) {
      return { ok: false, reason: gearSpam };
    }
    const studioWater = findStudioProductionWater(trimmed, referenceFacts);
    if (studioWater) {
      return { ok: false, reason: studioWater };
    }
  }

  if (
    !skipReferenceAnchor &&
    referenceFactsAreAnchorable(referenceFacts, artist, title) &&
    !anchorsReferenceFact(trimmed, referenceFacts)
  ) {
    return { ok: false, reason: 'story ignores reference facts' };
  }
  if (
    referenceFactsAreAnchorable(referenceFacts, artist, title) &&
    !skipFirstSentenceAnchor &&
    !openingAnchoredToFact(trimmed, referenceFacts)
  ) {
    return { ok: false, reason: 'first sentence is not anchored to seed fact' };
  }

  const words = countWords(trimmed);
  /** Hard reject only for empty/garbage — target word budget is a prompt hint; TTS speed sets duration. */
  const absoluteMin = options.minWordsOverride ?? 12;
  if (words < absoluteMin) {
    return { ok: false, reason: `too short (${words} words, need at least ${absoluteMin})` };
  }

  const incomplete = findIncompleteEnding(trimmed);
  if (incomplete) {
    return { ok: false, reason: incomplete };
  }

  if (strictLength) {
    const minWords = options.minWordsOverride ?? limits.wordsMin;
    if (words < minWords) {
      return { ok: false, reason: `too short (${words} words, need ${minWords}+)` };
    }
    if (words > limits.wordsMax + 25) {
      return { ok: false, reason: `too long (${words} words, max ~${limits.wordsMax})` };
    }
  }

  return { ok: true };
}

/** First 1–2 sentences — hooks often split anchor across two short phrases. */
export function openingBlockForAnchor(script: string): string {
  const sentences = script.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length === 0) return '';
  return sentences.slice(0, 2).join(' ').trim();
}

/** Opening anchor: same bridges as full script, but on the hook block (not just sentence 1). */
export function openingAnchoredToFact(script: string, referenceFacts: string[]): boolean {
  if (referenceFacts.length === 0) return true;
  const opening = openingBlockForAnchor(script);
  if (opening.length < 12) return false;
  return anchorsReferenceFact(opening, referenceFacts);
}

/** @deprecated alias — use openingAnchoredToFact */
export function firstSentenceAnchoredToFact(script: string, referenceFacts: string[]): boolean {
  return openingAnchoredToFact(script, referenceFacts);
}

/** @deprecated Alias for PERSONA_CLICHE_PATTERNS — kept for test imports only. */
const GENERIC_FICTION_PATTERNS: RegExp[] = PERSONA_CLICHE_PATTERNS;

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
  {
    claim: /он\s+же\s+[А-ЯA-ZЁ][\p{L}\p{N}'-]*/u,
    factHint: /он\s+же|aka|also known|псевдоним|stage name|известен как|known as/i,
  },
  {
    claim: /(?:практически\s+)?(?:случайно|неожиданно)\s*—?\s*как\s+импровизац/i,
    factHint: /improvis|импровиз|случайн|accident|off the cuff/i,
  },
  {
    claim: /звучал\w*\s+на\s+митинг/i,
    factHint: /митинг|rally|protest|demonstration/i,
  },
  {
    claim: /стал\s+гимном\s+для/i,
    factHint: /anthem|гимн|hymn|protest song/i,
  },
  {
    claim: /(?:^|[\s,.!?«»])я\s+обожаю\b/i,
    factHint: /я\s+обожаю|i love|obsessed with/i,
  },
  {
    claim: /летн(?:ий|ем)\s+бриз|смешав\s+.*(?:бит|гитар)|электронн\w*\s+бит.*гитар/i,
    factHint: /breeze|guitar|studio|recorded|spotify|stream|chart|bit|electronic/i,
  },
  {
    claim: /(?:записывал(?:ся|ась|и)|в\s+студии\s+все|между\s+турами|в\s+перерывах\s+между)/i,
    factHint: /record|studio|tour|recorded|between tour|перерыв/i,
  },
  {
    claim: /синтезатор|шёпот|шепот|электроник\w*\s+и\s+шёпот|осколк\w*\s+электроник/i,
    factHint: /synth|electronic|deathtronica|electronicore|scream|hardcore|metalcore|шёпот|шепот|синтез|guitar|вокал/i,
  },
  {
    claim: /(?:стал\s+)?саундтреком\s+(?:лета|фильма|кино)(?=[\s,.!?…]|$)|\bsoundtrack\s+of\s+(?:the\s+)?summer\b/i,
    factHint: /soundtrack|film|movie|фильм|кино|сериал|video game|саундтрек/i,
  },
  {
    claim: /отголоски того периода|переход из дуэта в сольное/i,
    factHint: /отголоск|дуэт|duo|period|период|transition|solo/i,
  },
  {
    claim: /ощущени(?:е|я)\s+эпох/i,
    factHint: /эпох|era|epoch|decade|season|время|year/i,
  },
  {
    claim: /(?:^|[\s,.!?«»])(?:у\s+меня\s+)?(?:до\s+сих\s+пор\s+)?мурашк/i,
    factHint: /мураш|goosebump|chill|shiver/i,
  },
  {
    claim: /электронн\w*\s+бит\w*|меланхоличн\w*\s+гитар|сочета(?:ют|ются)\s+.*(?:бит|гuitar)|такой\s+микс\s+редко/i,
    factHint: /electronic|guitar|bit|instrument|sound|жанр|синтез|гитар|бит/i,
  },
  {
    claim: /режисс(?:ё|е)р\s+показал|внутренний\s+рост\s+через\s+метафор|визуализировал\s+эту\s+идею/i,
    factHint: /director|режисс|metaphor|visual|script|сценари|visuals?/i,
  },
  {
    claim: /буквально\s+взорвал\s+зал|взорвал\s+зал\s+на\s+концерт|стало\s+легендарным:\s*энергия/i,
    factHint: /crowd|audience|riot|arrest|legendary|historic|standing ovation|sold out|взорвал|зал/i,
  },
  {
    claim: /настоящ(?:им|ый|ей)\s+прорыв(?:ом)?|стал[аи]?\s+(?:настоящ(?:им|ей|ым)\s+)?прорыв|прорыв(?:ом)?\s+для\s+(?:группы|коллектива|артист)/i,
    factHint: /breakthrough|прорыв|debut|first hit|kara'?s flowers|unknown artist/i,
  },
  {
    claim: /вступлени(?:е|я)\s+держит\s+внимание|лучше\s+любого\s+джингла|держит\s+внимание\s+лучше/i,
    factHint: /intro|opening|вступлен|jingle|джингл|hook/i,
  },
  {
    claim: /(?:^|[.!?…]\s+)вступлени(?:е|я)\s+(?:держит|цепляет|замира)/i,
    factHint: /intro|opening|вступлен|first (?:note|second|beat)/i,
  },
  {
    claim: /с\s+годами\s+не\s+выцветает|вступлени(?:е|я)\s+по-прежнему\s+цепляет/i,
    factHint: /intro|opening|вступлен|fade|year|age|outdat/i,
  },
  {
    claim: /два\s+мира\s+столкнулись|на\s+одном\s+дыхании/i,
    factHint: /world|мир|breath|one take|improvis|дыхан/i,
  },
  // «визитной карточкой» — устойчивая фан-речь из voiceover-no-names.ts, не факт-галлюцинация.
  {
    claim: /(?:за|в)\s+одн[ую]\s+ноч|одной\s+ночью|за\s+ночь/i,
    factHint: /one night|overnight|за\s+ноч|одной\s+ноч|insomnia|бессон|не\s+спал|couldn't sleep|could not sleep/i,
  },
  {
    claim: /бессон|не\s+мог\s+уснут/i,
    factHint: /insomnia|бессон|couldn't sleep|could not sleep|sleepless|не\s+спал/i,
  },
  {
    claim: /портативн\w*\s+магнитофон/i,
    factHint: /portable|tape recorder|магнитофон|recorder|demo tape|кассет/i,
  },
  {
    claim: /(?:среди|посреди)\s+ночи/i,
    factHint: /middle of the night|midnight|среди\s+ноч|посреди\s+ноч|at night|ночью/i,
  },
  {
    claim: /(?:утром|на\s+утро)\s+прин(?:ё|е)с/i,
    factHint: /next morning|brought.*studio|утром|studio.*morning|прин[ёе]с.*студи/i,
  },
  {
    claim: /записал\w*\s+демо/i,
    factHint: /demo|демо|tape|магнитофон|recorder|home record/i,
  },
  {
    claim: /(?:не\s+)?(?:в\s+)?результате\s+долг(?:их|ие)\s+сесс/i,
    factHint: /session|сесс|studio|weeks|months|recorded|запис/i,
  },
  {
    claim: /лёгкий\s+поп-?звук\s+с\s+неожиданно\s+глубокой/i,
    factHint: /pop|lyric|deep|sound|жанр/i,
  },
  {
    claim: /электронн\w*\s+бит\w*\s+и\s+гитарн\w*\s+риф|атмосферу\s+ночных\s+поездок/i,
    factHint: /electronic|bit|guitar|rif|night|drive|поезд|road/i,
  },
  {
    claim: /саундтреком?\s+к\s+взрослению/i,
    factHint: /soundtrack|взросл|growing up|coming of age/i,
  },
  {
    claim: /(?:истори\w*\s+групп|в\s+истории\s+групп|групп\w*\s+(?:записал|выпустил|написал))/i,
    factHint: /\b(?:the band|the group|band members?|their (?:album|song|debut)|групп)\b/i,
  },
  {
    claim: /(?:написал\s+не\s+сам\s+артист|не\s+сам\s+артист\s+написал|трек\s+написал\s+не\s+сам)/i,
    factHint: /(?:not written by|song not written|recorded a song not written|чуж\w*\s+(?:текст|слова|автор))/i,
  },
  {
    claim: /(?:стал[аи]?\s+(?:одним\s+из\s+)?(?:самых\s+)?(?:узнаваем|известн)|стала\s+хитом)/i,
    factHint: /(?:\bhit\b|chart|billboard|top\s+\d|platinum|gold|million|хит|чарт)/i,
  },
  {
    claim: /фанаты\s+(?:буквально\s+)?заставил/i,
    factHint: /fans\s+(?:demand|forced|request)|фанаты\s+(?:потребовал|заставил|просил)/i,
  },
  {
    claim: /не\s+планировал\w*\s+(?:выпускать|выпустить)(?:\s+эту\s+песню)?(?:\s+отдельно|\s+как\s+сингл)?/i,
    factHint: /not\s+(?:originally\s+)?(?:planned|intended)|не\s+планировал\w*\s+выпускать/i,
  },
  {
    claim: /просто\s+была\s+частью\s+пластинки/i,
    factHint: /not\s+(?:originally\s+)?(?:planned|intended)|part\s+of\s+the\s+album|не\s+планировал/i,
  },
];

export function findUngroundedClaims(
  script: string,
  referenceFacts: string[] = [],
  options: { storyNarrator?: StoryNarratorId } = {},
): string | null {
  const factsText = referenceFacts.join(' ');
  const fanPersona =
    options.storyNarrator === 'fan' || options.storyNarrator === 'contemporary';
  const nightDjPersona = options.storyNarrator === 'night_dj';
  const seedHasReleaseContext =
    /\b(?:single|released|capitol|records|album|chart|april|2018|synth|guitar|pop punk)\b/i.test(
      factsText,
    );
  const seedHasProductionHints =
    /\b(?:synth|guitar|vocal|drum|бит|гитар|синтез|вокал|produc|recorded|studio)\b/i.test(
      factsText,
    );
  for (const { claim, factHint } of UNGROUNDED_CLAIM_CHECKS) {
    if (!claim.test(script)) continue;
    if (referenceFacts.length === 0 || factHint.test(factsText)) continue;
    if (fanPersona && seedHasReleaseContext) {
      if (/(?:мурашк|гитарн\w*\s+риф|электронн\w*\s+бит)/i.test(claim.source)) continue;
    }
    if (nightDjPersona && !seedHasProductionHints) {
      if (/(?:синтезатор|шёпот|шепот|электроник)/i.test(claim.source)) continue;
    }
    return `ungrounded claim: ${claim.source}`;
  }
  return null;
}

const NOSTALGIA_FLUFF_PATTERNS: RegExp[] = [
  /помню,\s*как\s+впервые/i,
  /глоток\s+свежего\s+воздуха/i,
  /всё\s+казалось\s+проще/i,
  /включали\s+(?:его|её|на\s+вечерин)/i,
  /искали\s+что-то\s+простое/i,
  /отвлечь\s+от\s+бесконечного/i,
  /не\s+было\s+пафоса/i,
  /везде\s+звучал\s+уместно/i,
];

/** Современник/фанат на слабом «N-й сингл с альбома» — отклоняем ностальгию без факта. */
export function findNostalgiaFluffOnThinSeed(
  script: string,
  referenceFacts: string[] = [],
  storyNarrator?: StoryNarratorId,
): string | null {
  if (storyNarrator !== 'fan' && storyNarrator !== 'contemporary') return null;
  const seed = referenceFacts.find((f) => f.trim()) ?? '';
  if (!seed || !isThinReleaseCatalogSeed(seed)) return null;
  const hits = NOSTALGIA_FLUFF_PATTERNS.filter((p) => p.test(script)).length;
  if (hits >= 2) {
    return 'nostalgia fluff on thin release seed — anchor on artist/group fact from sources';
  }
  return null;
}

const ACCIDENTAL_SINGLE_CLICHE_PATTERNS: RegExp[] = [
  /не\s+планировал\w*\s+(?:выпускать|выпустить)/i,
  /(?:изначально|сначала)\s+(?:группа\s+)?не\s+планировал/i,
  /фанаты\s+(?:буквально\s+)?заставил/i,
  /просто\s+была\s+частью\s+пластинки/i,
  /не\s+был(?:а|и)?\s+написан(?:а|ы)?\s+как\s+(?:явный\s+)?хит/i,
  /(?:простота|искренност\w*)\s+.*(?:сделал(?:а|и)?|цепля)/i,
  /сам(?:ые|ая)\s+неожиданн\w*\s+(?:вещ\w*|истор\w*)\s+станов/i,
  /аудитория\s+сама\s+сделала\s+хит/i,
  /not\s+(?:originally\s+)?(?:planned|intended)\s+(?:as\s+a\s+)?(?:single|release)/i,
  /fans\s+(?:literally\s+)?(?:forced|made|demanded)/i,
];

/** Шаблон «не планировали сингл → фанаты заставили» на каталожном семени — для всех дикторов. */
export function findAccidentalSingleClicheOnThinSeed(
  script: string,
  referenceFacts: string[] = [],
): string | null {
  const seed = referenceFacts.find((f) => f.trim()) ?? '';
  if (!seed || !isThinReleaseCatalogSeed(seed)) return null;
  const hits = ACCIDENTAL_SINGLE_CLICHE_PATTERNS.filter((p) => p.test(script)).length;
  if (
    hits >= 2 ||
    /фанаты\s+(?:буквально\s+)?заставил/i.test(script) ||
    /не\s+планировал\w*\s+(?:выпускать|выпустить)\s+(?:эту\s+песню\s+)?(?:отдельно|как\s+сингл)/i.test(
      script,
    )
  ) {
    return 'accidental-single cliche on thin release seed — pick a narrative fact, not album placement';
  }
  return null;
}

const GEAR_BRAND_RE =
  /\b(?:Yamaha|Gibson|Mesa Boogie|Line 6|Sterling Sound|Groovemaster|Bogner|Sabian|Evans|Digitech|Sennheiser|Dean Markley|Pro Mark|Lakland)\b/gi;

/** Озвучка с перечислением брендов из Discogs — паузы и вода. */
export function findStudioGearBrandSpam(
  script: string,
  referenceFacts: string[] = [],
): string | null {
  const seed = referenceFacts.find((f) => f.trim()) ?? '';
  if (!seed || !isStudioEquipmentCatalogSeed(seed)) return null;
  const hits = (script.match(GEAR_BRAND_RE) ?? []).length;
  if (hits >= 2) {
    return 'studio gear brand list — use artist quote or song story, not equipment catalog';
  }
  return null;
}

export function findGenericFiction(script: string): string | null {
  const persona = findPersonaCliche(script);
  if (!persona) return null;
  return persona.replace('persona cliche:', 'generic fiction:');
}

/** «этот артист» / «этот исполнитель» — штатная экономия имён, не llm garbage (см. voiceover-no-names.ts). */

/** Штамп «хит в памяти» — бракуем только если нет якоря в seed-фактах. */
const HIT_MEMORY_CLICHE_PATTERNS: RegExp[] = [
  /стал\s+[а-яё]*\s*хитом[^.]{0,55}в\s+памят/i,
  /хитом\s+[^.]{0,45}в\s+памят/i,
  /не\s+только\s+в\s+чарте[^.]{0,45}в\s+памят/i,
];

const LLM_GARBAGE_PATTERNS: RegExp[] = [
  /крутить\s+к\s+блюду/i,
  /\bзвуким\b/i,
  /шлал\s+вспоминать/i,
  /в\s+шаблоне/i,
  /не\s+слух,\s*а\s+чувство/i,
  /звон\s+к\s+памяти/i,
  /\bзвеньолок\b/i,
  /\bревокаци/i,
  /пробил[аи]?\s+деньги/i,
  /шл[её]л\s+по\s+студ/i,
  /старая\s+мама/i,
  /живые\s+эскизы/i,
  /звук\s+шл/i,
  /это\s+время\s*[—–-]?\s*это\s+время/i,
  /(?:^|[.!?…]\s+)это\s+был\s+момент[^.]{0,80}это\s+был\s+момент/i,
  /не\s+просто\s+(?:канал|музык|трек)[аи]?[^.]{0,40}не\s+просто/i,
  /(?:^|[\s,.!?«»])я\s+(?:слышал[аи]?|слышали)\s*,?\s*как\s/i,
  /(?:^|[\s,.!?«»])мне\s+(?:рассказывал[аи]?|говорил[аи]?)\s*,?\s*что\s/i,
  /(?:^|[\s,.!?«»])я\s+(?:вложил|вложила|заплатил|заплатила|инвестировал[аи]?)\s[^.]{0,70}(?:миллион|тысяч|полмиллион|сот\s+тысяч|доллар)/i,
  /(?:^|[\s,.!?«»])меня\s+(?:до\s+сих\s+пор\s+)?мурашки\s+бегут/i,
  /переписывал[аи]?\s+кассет/i,
  /псевдонимом\s+этот/i,
  /—\s*в\s+треке\s*[.!?]?$/i,
  /\+\s*б\s+\+\s*б/i,
  /\+[а-яё]/i,
  /\bвоукал/i,
];

export interface LlmGarbageOptions {
  /** @deprecated — placeholders («этот артист») never treated as garbage */
  allowVoiceoverPlaceholders?: boolean;
  /** Не резать «хит в памяти», если текст опирается на seed-факты. */
  skipHitMemoryWhenGrounded?: boolean;
  referenceFacts?: string[];
}

export function findLlmGarbage(script: string, options?: LlmGarbageOptions): string | null {
  const sets = [...LLM_GARBAGE_PATTERNS];
  void options?.allowVoiceoverPlaceholders;
  const skipHit =
    options?.skipHitMemoryWhenGrounded &&
    (options.referenceFacts?.length ? anchorsReferenceFact(script, options.referenceFacts) : false);
  if (!skipHit) {
    sets.push(...HIT_MEMORY_CLICHE_PATTERNS);
  }
  for (const pattern of sets) {
    if (pattern.test(script)) {
      return `llm garbage: ${pattern.source}`;
    }
  }
  return null;
}

const ARTIST_HEALTH_SEED_PATTERNS =
  /\b(?:surgery|an operation|chemotherapy|prolong (?:his|her|their) life|rejected (?:surgery|treatment|the operation)|refused (?:surgery|treatment)|was told that (?:he|she|they) would require|terminal cancer|lung cancer)\b/i;

const HEALTH_LINKED_TO_RECORDING_PATTERNS =
  /(?:записал\w*|записывал\w*|recorded|recording|в\s+студи|ст\+?уди|микрофон|скальпел|больничн|операц|hospital|could not appear|мог\s+бы\s+(?:и\s+)?не\s+появиться|выбрал\w*\s+музык|instead of (?:the )?hospital|вместо\s+больничн)/i;

/** Artist-level milestone in seed but story credits the requested track — e.g. Grammy via «Mama's Gun». */
export function findArtistSeedTrackMisattribution(
  script: string,
  title: string,
  referenceFacts: string[],
): string | null {
  if (!title.trim() || referenceFacts.length === 0) return null;
  const primary = referenceFacts[0]?.trim() ?? '';
  if (!primary || factMentionsTitle(primary, title)) return null;

  const titleNorm = normalizeForMatch(title.replace(/\s*\([^)]*\)\s*/g, ' '));
  if (!titleNorm || !normalizeForMatch(script).includes(titleNorm)) return null;

  if (ARTIST_HEALTH_SEED_PATTERNS.test(primary) && HEALTH_LINKED_TO_RECORDING_PATTERNS.test(script)) {
    return 'artist health fact misattributed to track recording';
  }

  const milestoneInSeed =
    /\b(?:Grammy|Oscar|Emmy|Brit Award|MTV Video Music)\b/i.test(primary) ||
    /\bnominated for\b/i.test(primary) ||
    /\breceived (?:their|his|her) first\b/i.test(primary);
  if (!milestoneInSeed) return null;

  if (
    /(?:прин[ёе]с|принес\w*| brought| earned|получил\w*|дал\w*).{0,55}(?:grammy|номинац|прем|наград)/i.test(
      script,
    )
  ) {
    return 'artist milestone misattributed to track';
  }
  const titleNearAward = new RegExp(
    `${titleNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.]{0,90}(?:grammy|номинац|прем|наград)`,
    'i',
  );
  if (titleNearAward.test(script)) {
    return 'artist milestone misattributed to track';
  }
  return null;
}

const NEWS_POLITICS_SEED_RE =
  /teachers?\s*union|забастовк\w*|учител\w*\s+забастовк|chicago\s+public\s+schools/i;
const RECORDING_STUDIO_SCRIPT_RE =
  /(?:запис\w*|студи|гитар|van\s+halen|рифф|thriller|beat\s*it|дубль|\bsolo\b|сolo|вокал|музыкант\w*\s+не\s+мог\w*\s+репетир)/i;

/** Script invents detail absent from seed (e.g. teachers strike hallucinated for Beat It). */
export function findOffSeedInvention(script: string, referenceFacts: string[] = []): string | null {
  if (referenceFacts.length === 0) return null;
  const seed = referenceFacts.join(' ');
  if (NEWS_POLITICS_SEED_RE.test(script) && !NEWS_POLITICS_SEED_RE.test(seed)) {
    return 'invented detail not in seed: teachers strike';
  }
  const collectorInvention =
    /\b(?:7-inch|7 inch|B-side has studio banter|limited edition.*vinyl|rewriting the chorus three times|studio banter about this exact moment)\b/i;
  if (collectorInvention.test(script) && !collectorInvention.test(seed) && !/\bvinyl|7-inch|B-side|banter|press\b/i.test(seed)) {
    return 'invented collector detail not in seed';
  }
  if (
    /(?:ассистент\w*|без упоминания в кредитах|остал\w*\s+без\s+упоминания|кто именно нажимал)/i.test(script) &&
    !/\bAssistant at\b/i.test(seed)
  ) {
    return 'invented studio credit drama not in seed';
  }
  return null;
}

/** Сведение/мастеринг/студии в тексте при слабом Discogs-семени — не история. */
export function findStudioProductionWater(
  script: string,
  referenceFacts: string[] = [],
): string | null {
  const seed = referenceFacts.find((f) => f.trim()) ?? '';
  if (!seed) return null;
  const studioHits = [
    /(?:сведени\w*|мастеринг\w*|микширов\w*)/i.test(script),
    /(?:RAK|Psalm|Sterling|Groovemaster)\b/i.test(script),
    /(?:ассистент\w*|кредит\w*|внутренн\w*\s+конверт)/i.test(script),
    /(?:оборудован\w*|арсенал\w*\s+для\s+идеальн\w*\s+звук)/i.test(script),
  ].filter(Boolean).length;
  if (studioHits >= 2 && isStudioEquipmentCatalogSeed(seed)) {
    return 'studio production trivia — use song meaning or band story from sources';
  }
  if (isStudioEquipmentCatalogSeed(seed) && studioHits >= 1) {
    return 'studio liner-notes seed — do not narrate mixing/mastering credits';
  }
  return null;
}

/** News/politics seed without track anchor woven into a recording-session story. */
export function findNewsSeedBleedIntoRecordingStory(
  script: string,
  title: string,
  referenceFacts: string[],
): string | null {
  const primary = referenceFacts[0]?.trim() ?? '';
  if (!primary || factMentionsTitle(primary, title)) return null;
  if (!NEWS_POLITICS_SEED_RE.test(primary)) return null;
  if (RECORDING_STUDIO_SCRIPT_RE.test(script)) {
    return 'news/politics seed incorrectly woven into track recording story';
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

/**
 * Абстрактная «лекция о жанре» — только для strict/local проверок (!skipPersonaCliches).
 * Лексика фаната («я обожаю») сюда НЕ входит — она задаётся промптом амплуа, не гейтом.
 */
const GENRE_WATER_PATTERNS: RegExp[] = [
  /истори[яю]\s+о\s+том,\s+как/i,
  /истори[яю]\s+о\s+фузии/i,
  /жанров(?:ая|ой)\s+механик/i,
  /механик\w*\s+успеха/i,
  /визитной\s+карточкой\s+жанра/i,
  /это\s+не\s+просто\s+(?:песн|трек|рок|групп)/i,
  /музык\w*,\s+которая\s+не\s+требует/i,
  /звуковой\s+фон\s+для\s+размышлен/i,
  /лоу-?фай\s+эстетик/i,
  /минимализм\w*\s+в\s+продакшн/i,
];

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
  /независим\w*\s+артист[^.]{0,80}не\s+ради\s+чарт/i,
  /не\s+ради\s+чартов[^.]{0,60}ради\s+самого\s+процесса/i,
  /разговор\s+по\s+душам/i,
  /чистый\s+эксперимент[^.]{0,40}(?:ритм|бит|жанр)/i,
  /эпох[ауе]\s+стриминг/i,
  /уникальност\w*\s+материал/i,
  /это\s+тот\s+случай[^.]{0,50}независим/i,
  /визитн\w*\s+карточк\w*\s+артист/i,
  /скрыт\w*\s+глубин/i,
  /превраща\w*\s+обычн\w*\s+истори/i,
  /вот\s+как-?то\s+так,\s+друзья/i,
  /отличного\s+прослушивания/i,
  /я\s+обожаю/i,
  /до\s+сих\s+пор\s+не\s+могу\s+оторваться/i,
  /бетонного\s+леса/i,
  /энергия\s+буквально\s+врезается/i,
];

export function findGenreWater(script: string): string | null {
  for (const pattern of GENRE_WATER_PATTERNS) {
    if (pattern.test(script)) {
      return `genre water: ${pattern.source}`;
    }
  }
  return null;
}

/** LLM invents indie lore when there is no grounded seed (сингл без рекламы, минимал-бит…). */
const INVENTED_INDIE_FILLER_PATTERNS: RegExp[] = [
  /минималистичн\w*\s+бит/i,
  /без\s+громкой\s+рекламной\s+кампании/i,
  /слушател\w*\s+быстро\s+подхватил\w*/i,
  /словно\s+разговор\s+с\s+самим\s+собой/i,
  /отсюда\s+и\s+название/i,
  /многие\s+узнал\w*\s+в\s+этой\s+музыке\s+что-то\s+своё/i,
  /сразу\s+привлёк\s+внимание/i,
  /глубок\w*\s+эмоциональн\w*\s+подач/i,
];

export function findInventedIndieFiller(
  script: string,
  referenceFacts: string[] = [],
  artist = '',
  title = '',
): string | null {
  if (referenceFactsAreAnchorable(referenceFacts, artist, title)) return null;
  for (const pattern of INVENTED_INDIE_FILLER_PATTERNS) {
    if (pattern.test(script)) {
      return `invented indie filler: ${pattern.source}`;
    }
  }
  return null;
}

export function findClicheFiller(script: string): string | null {
  for (const pattern of CLICHE_FILLER_PATTERNS) {
    if (pattern.test(script)) {
      return `cliche filler: ${pattern.source}`;
    }
  }
  return null;
}

/** Подсказка retry: чужая лексика амплуа (не гейт — только в промпт перегенерации). */
export function personaLexiconRetryHint(
  script: string,
  narrator: StoryNarratorId | undefined,
): string | undefined {
  const id = resolveStoryNarrator(narrator);
  if (id === 'fan' || id === 'contemporary') return undefined;
  if (/я\s+обожаю/i.test(script)) {
    return 'Без «я обожаю» — это голос фаната; у твоего амплуа другая лексика.';
  }
  if ((id === 'expert' || id === 'radio_host') && /удивил\w*\s+всех/i.test(script)) {
    return 'Без «удивил всех» — начни с конкретного факта из семени, не с восторженного вступления.';
  }
  if (id === 'expert' && /жанров(?:ая|ой)\s+механик/i.test(script)) {
    return 'Без лекции «жанровая механика» — жанр одним словом, остальное факты из семени.';
  }
  return undefined;
}

/** Подсказка модели при retry после брака quality gate. */
export function buildStoryRetryDirective(
  reason: string | undefined,
  minWords: number,
  options: { script?: string; storyNarrator?: StoryNarratorId } = {},
): string | undefined {
  const personaHint =
    options.script?.trim() ?
      personaLexiconRetryHint(options.script, options.storyNarrator)
    : undefined;
  if (!reason?.trim() && !personaHint) return undefined;
  const lower = (reason ?? '').toLowerCase();
  const parts: string[] = [];
  if (reason?.trim()) parts.push(`ПРИЧИНА БРАКА: ${reason}`);
  if (personaHint) parts.push(personaHint);
  if (lower.includes('no concrete fact') || lower.includes('genre water') || lower.includes('cliche filler')) {
    parts.push(
      'Убери воду про жанр и «уникальность». Каждое предложение — факт из семени: имя, событие, платформа, инструмент, курьёз.',
    );
  }
  if (lower.includes('first sentence')) {
    parts.push('Первая фраза = конкретный якорь из семени (не «эта группа — история о том»).');
  }
  if (lower.includes('ignores reference') || lower.includes('reference fact')) {
    parts.push('Минимум два якоря из семени: имена людей, события, платформы — дословно из факта.');
  }
  if (lower.includes('voiceover names leak')) {
    parts.push('Не называй артиста и трек — только «эта группа», «этот исполнитель», «эта песня».');
  }
  if (lower.includes('excessive name repetition')) {
    parts.push(
      'Имя трека — один раз в начале; артист — максимум два раза. Дальше «они», «этот трек», «их альбом» — не повторяй имя в каждом предложении.',
    );
  }
  if (lower.includes('too short')) {
    parts.push(`Добей до ${minWords}+ слов одной новой деталью из семени, не водой.`);
  }
  if (lower.includes('english')) {
    parts.push('Только русский: переведи обычные английские слова.');
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** Reject generic filler — artist name alone is not enough. */
export function countPhraseMentions(script: string, phrase: string): number {
  const p = phrase.trim();
  if (p.length < 2) return 0;
  let max = 0;
  for (const variant of phraseVariants(p)) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = script.match(new RegExp(`\\b${escaped}\\b`, 'gi'));
    max = Math.max(max, matches?.length ?? 0);
  }
  return max;
}

/** Soft gate: artist/title hammered in every sentence — prompt should prevent this. */
export function findExcessiveNameRepetition(
  script: string,
  artist: string,
  title: string,
  storyNarrator?: StoryNarratorId,
  speakTrackNamesInVoiceover?: boolean,
): string | null {
  const primary = primaryArtistName(artist);
  const artistCount = countPhraseMentions(script, primary);
  if (artistCount > 2) {
    return `excessive name repetition: artist "${primary}" ${artistCount}× (max 2)`;
  }
  const titleCount = countPhraseMentions(script, title);
  const titleMax =
    storyNarrator === 'fan' ||
    storyNarrator === 'contemporary' ||
    speakTrackNamesInVoiceover === true
      ? 2
      : 1;
  if (titleCount > titleMax) {
    return `excessive name repetition: track "${title}" ${titleCount}× (max ${titleMax})`;
  }
  return null;
}

export function findWateryContent(
  script: string,
  artist = '',
  title = '',
  referenceFacts: string[] = [],
  options: { skipPersonaCliches?: boolean; speakTrackNamesInVoiceover?: boolean; storyNarrator?: StoryNarratorId } = {},
): string | null {
  const skipPersona = options.skipPersonaCliches ?? false;
  const noTrackNames = isVoiceoverWithoutTrackNames(options.speakTrackNamesInVoiceover);
  const nostalgiaFluff = findNostalgiaFluffOnThinSeed(script, referenceFacts, options.storyNarrator);
  if (nostalgiaFluff) return nostalgiaFluff;
  const accidentalSingle = findAccidentalSingleClicheOnThinSeed(script, referenceFacts);
  if (accidentalSingle) return accidentalSingle;
  const inventedIndie = findInventedIndieFiller(script, referenceFacts, artist, title);
  if (inventedIndie) return inventedIndie;
  if (options.speakTrackNamesInVoiceover === true && artist.trim() && title.trim()) {
    const nameRep = findExcessiveNameRepetition(
      script,
      artist,
      title,
      options.storyNarrator,
      options.speakTrackNamesInVoiceover,
    );
    if (nameRep) return nameRep;
  }
  if (!skipPersona) {
    const genreWater = findGenreWater(script);
    if (genreWater) return genreWater;
  }

  const garbage = findLlmGarbage(script, {
    allowVoiceoverPlaceholders: noTrackNames,
    skipHitMemoryWhenGrounded: true,
    referenceFacts,
  });
  if (garbage) return garbage;

  if (referenceFacts.length > 0) {
    const platformMismatch = findFactPlatformMismatch(script, referenceFacts);
    if (platformMismatch) return platformMismatch;
    if (skipPersona && anchorsReferenceFact(script, referenceFacts)) {
      return null;
    }
  }

  if (!skipPersona) {
    const fiction = findGenericFiction(script);
    if (fiction) return fiction;

    const cliche = findClicheFiller(script);
    if (cliche) return cliche;
  }

  let stripped = script;
  for (const token of [...significantTokens(artist), ...significantTokens(title)]) {
    if (token.length >= 3) {
      stripped = stripped.replace(new RegExp(`\\b${token}\\b`, 'gi'), ' ');
    }
  }
  if (!skipPersona && findClicheFiller(stripped)) {
    return 'only artist/title with cliche filler';
  }

  const anchorable =
    referenceFacts.length > 0 && referenceFactsAreAnchorable(referenceFacts, artist, title);

  if (referenceFacts.length > 0 && anchorsReferenceFact(script, referenceFacts)) {
    return null;
  }

  if (anchorable) {
    const words = countWords(script);
    if (
      words >= 36 &&
      storyMentionsPerformingArtist(script, artist, title) &&
      referenceFacts.some((f) => interestScore(f) >= 12 || /wrote|written|influenced|написал|вдохнов/i.test(f))
    ) {
      return null;
    }
    return 'no concrete fact — use detail from seed fact (instrument, label, scandal, sample)';
  }

  const words = countWords(script);
  if (words >= 65 && hasConcreteFact(script, artist, title) && !findGenreWater(script)) {
    return null;
  }

  if (hasConcreteFact(stripped, '', '') && !findGenreWater(script)) return null;
  return 'no concrete fact — use detail from seed fact (instrument, label, scandal, sample)';
}

/** @deprecated alias for scripts/tests */
export function hasFictionPattern(script: string): boolean {
  return (
    findHardScriptViolation(script) !== null ||
    findGenericFiction(script) !== null ||
    findPersonaCliche(script) !== null
  );
}
