import {
  buildAllowedLatinTokens,
  extractProperNamePhrasesFromFacts,
  foldLatinAscii,
  replaceGenericEnglish,
} from './story-english-normalize.js';

const FORBIDDEN_PHRASES: RegExp[] = [/#\s*\d/];

/** Latin letters including é, ü, ñ — not ASCII-only [a-z]. */
const LATIN_TOKEN = /\p{Script=Latin}{2,}/gu;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAllowedLatinToken(
  token: string,
  allowed: ReturnType<typeof buildAllowedLatinTokens>,
): boolean {
  const lower = token.toLowerCase();
  if (allowed.has(lower)) return true;
  if (allowed.has(foldLatinAscii(token))) return true;
  return false;
}

/** MTV, ABBA, Stromae — not generic English jargon. */
function isLikelyProperNoun(token: string): boolean {
  if (/^\p{Lu}/u.test(token)) return true;
  if (/^[A-Z]{2,}$/.test(token)) return true;
  return false;
}

function maskPhrases(text: string, phrases: string[]): string {
  let result = text;
  const sorted = [...new Set(phrases.map((p) => p.trim()).filter((p) => p.length >= 2))].sort(
    (a, b) => b.length - a.length,
  );
  for (const phrase of sorted) {
    result = result.replace(new RegExp(escapeRegExp(phrase), 'giu'), ' ');
  }
  return result;
}

/** Mask artist/title and seed proper names — never score as English leak. */
function maskAllowedProperNames(
  text: string,
  artist: string,
  title: string,
  referenceFacts: string[],
): string {
  return maskPhrases(text, [
    title,
    artist,
    ...extractProperNamePhrasesFromFacts(referenceFacts),
  ]);
}

/** Leave disallowed generic Latin for detection; mask allowed tokens and hyphen hybrids. */
function textForEnglishLeakCheck(
  text: string,
  allowed: ReturnType<typeof buildAllowedLatinTokens>,
  artist = '',
  title = '',
  referenceFacts: string[] = [],
): string {
  let result = text.replace(/«[^»]*»/g, ' ');
  result = maskAllowedProperNames(result, artist, title, referenceFacts);
  result = result.replace(LATIN_TOKEN, (match) => {
    if (isAllowedLatinToken(match, allowed) || isLikelyProperNoun(match)) return ' ';
    return match;
  });
  result = result.replace(/\p{Script=Latin}{2,}(?=-[\u0400-\u04FF])/giu, '');
  return result;
}

/**
 * Detect generic English jargon in Russian narration — NOT artist/title/brand names.
 * Voiceover-without-names uses scriptLeaksVoiceoverNames(); do not pass blockTrackLatin here.
 */
export function hasEnglishLeak(
  script: string,
  artist = '',
  title = '',
  options: { referenceFacts?: string[]; blockTrackLatin?: boolean } = {},
): boolean {
  void options.blockTrackLatin;
  const referenceFacts = options.referenceFacts ?? [];
  const normalized = replaceGenericEnglish(script.trim());
  if (FORBIDDEN_PHRASES.some((pattern) => pattern.test(normalized))) return true;

  const allowed = buildAllowedLatinTokens(artist, title, referenceFacts, normalized, {
    blockTrackLatin: false,
  });
  const remaining = textForEnglishLeakCheck(normalized, allowed, artist, title, referenceFacts);
  LATIN_TOKEN.lastIndex = 0;
  for (const match of remaining.matchAll(LATIN_TOKEN)) {
    const token = match[0];
    if (isAllowedLatinToken(token, allowed) || isLikelyProperNoun(token)) continue;
    if (token.length >= 3) return true;
  }
  return false;
}

export const RUSSIAN_LANGUAGE_PROMPT_BLOCK = `ЯЗЫК — ТОЛЬКО РУССКИЙ, ДЛЯ ОЗВУЧКИ:
- Основной текст по-русски. Имена собственные лatinицей МОЖНО и НУЖНО сохранять: Billboard, Cash Box, Rolling Stone, MTV, названия групп и треков БЕЗ кавычек (просто Smooth, Hollywood Tonight).
- НЕ переводи названия журналов, лейблов, артистов и песен — это имена собственные.
- Знаковые термины и приёмы — тоже лatin/English, НЕ калки: moonwalk, anti-gravity lean, robot (танец MJ). ПЛОХО: «луноход», «робот», «наклон без гравитации» вместо moonwalk.
- Обычные английские слова (chart, band, single, live, hit, mainstream) переводи по смыслу: чарт, группа, сингл, живой, хит.
- Pop, Rock, Rap и другие жанры С ЗАГЛАВНОЙ в псевдонимах и именах — НЕ переводи: Jimmy Pop, Kid Rock, Lil Wayne. Жанры в тексте — слитно для озвучки: «хипхоп», «попрок», «фолкрок» (НЕ «хип-хоп», «поп-рок» — TTS ломает).
- Музыкальный термин flow — пиши «флоу» (как слышится по-английски), НЕ «поток» и НЕ «флоу» с другим ударением.
- Англ. delivery (подача/манера вокала) — «подача» или «манера исполнения». КАТЕГОРИЧЕСКИ НЕЛЬЗЯ «доставка».
- vocals / vocal — только «вокал» (единственное число). НЕ «воукалz», НЕ «вокалы», НЕ «вокалов» — даже если певцов несколько.
- ПЛОХО: «viral hit на top-5» без перевода обычных слов.
- ХОРОШО: «Billboard назвал трек одним из лучших поп-релизов года», «Redbone получил рецензию в Cash Box», «MTV крутил клип в эфир».
- Запрещены гибриды latin+кириллица (guitarist, brazilian) — переводи корень.
- Факты из семени — прямо: «продажи выросли в семь раз», НЕ «я слышал, как продажи выросли» и НЕ «мне рассказывали, что…».
- Хит — в чарте, в эфире; в памяти трек остаётся, запоминается. НЕ «стал хитом в памяти», НЕ «хит в памяти миллионов».
- Деньги/инвестиции из семени — это артист или лейбл («он вложил», «Jackson вложил»), не «я вложил», если в семени не про рассказчика.
- «У меня мурашки бегут» / «у меня до сих пор мурашки» — НЕ «меня мурашки бегут».`;
