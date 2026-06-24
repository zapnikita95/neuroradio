import {
  buildAllowedLatinTokens,
  foldLatinAscii,
  replaceGenericEnglish,
} from './story-english-normalize.js';

const FORBIDDEN_PHRASES: RegExp[] = [/#\s*\d/];

/** Latin letters including é, ü, ñ — not ASCII-only [a-z]. */
const LATIN_TOKEN = /\p{Script=Latin}{2,}/gu;
const LATIN_WORD = /\p{Script=Latin}{3,}/u;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAllowedLatinToken(token: string, allowed: ReturnType<typeof buildAllowedLatinTokens>): boolean {
  const lower = token.toLowerCase();
  if (allowed.has(lower)) return true;
  if (allowed.has(foldLatinAscii(token))) return true;
  return false;
}

/** Mask full artist/title before token scan — avoids «journée» → false «journ» leak. */
function maskTrackMetadata(text: string, artist: string, title: string): string {
  let result = text;
  const phrases = [title, artist]
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    result = result.replace(new RegExp(escapeRegExp(phrase), 'giu'), ' ');
  }
  return result;
}

/** Leave disallowed Latin for detection; mask allowed tokens and hyphen hybrids. */
function textForEnglishLeakCheck(
  text: string,
  allowed: ReturnType<typeof buildAllowedLatinTokens>,
  artist = '',
  title = '',
): string {
  let result = text.replace(/«[^»]*»/g, ' ');
  result = maskTrackMetadata(result, artist, title);
  result = result.replace(LATIN_TOKEN, (match) => {
    return isAllowedLatinToken(match, allowed) ? ' ' : match;
  });
  result = result.replace(/\p{Script=Latin}{2,}(?=-[\u0400-\u04FF])/giu, '');
  return result;
}

export function hasEnglishLeak(
  script: string,
  artist = '',
  title = '',
  options: { referenceFacts?: string[]; blockTrackLatin?: boolean } = {},
): boolean {
  const referenceFacts = options.referenceFacts ?? [];
  const normalized = replaceGenericEnglish(script.trim());
  if (FORBIDDEN_PHRASES.some((pattern) => pattern.test(normalized))) return true;

  const allowed = buildAllowedLatinTokens(artist, title, referenceFacts, normalized, {
    blockTrackLatin: options.blockTrackLatin === true,
  });
  const remaining = textForEnglishLeakCheck(normalized, allowed, artist, title);
  LATIN_TOKEN.lastIndex = 0;
  return LATIN_WORD.test(remaining);
}

export const RUSSIAN_LANGUAGE_PROMPT_BLOCK = `ЯЗЫК — ТОЛЬКО РУССКИЙ, ДЛЯ ОЗВУЧКИ:
- Основной текст по-русски. Имена собственные лatinицей МОЖНО и НУЖНО сохранять: Billboard, Cash Box, Rolling Stone, названия групп и треков БЕЗ кавычек (просто Smooth, Hollywood Tonight).
- НЕ переводи названия журналов, лейблов, артистов и песен — это имена собственные.
- Знаковые термины и приёмы — тоже лatin/English, НЕ калки: moonwalk, anti-gravity lean, robot (танец MJ). ПЛОХО: «луноход», «робот», «наклон без гравитации» вместо moonwalk.
- Обычные английские слова (chart, band, single, live, hit, mainstream) переводи по смыслу: чарт, группа, сингл, живой, хит.
- Pop, Rock, Rap и другие жанры С ЗАГЛАВНОЙ в псевдонимах и именах — НЕ переводи: Jimmy Pop, Kid Rock, Lil Wayne. Жанры в тексте — слитно для озвучки: «хипхоп», «попрок», «фолкрок» (НЕ «хип-хоп», «поп-рок» — TTS ломает).
- Музыкальный термин flow — пиши «флоу» (как слышится по-английски), НЕ «поток» и НЕ «флоу» с другим ударением.
- Англ. delivery (подача/манера вокала) — «подача» или «манера исполнения». КАТЕГОРИЧЕСКИ НЕЛЬЗЯ «доставка».
- vocals / vocal — только «вокал» (единственное число). НЕ «воукалz», НЕ «вокалы», НЕ «вокалов» — даже если певцов несколько.
- ПЛОХО: «viral hit на top-5» без перевода обычных слов.
- ХОРОШО: «Billboard назвал трек одним из лучших поп-релизов года», «Redbone получил рецензию в Cash Box».
- Запрещены гибриды latin+кириллица (guitarist, brazilian) — переводи корень.
- Факты из семени — прямо: «продажи выросли в семь раз», НЕ «я слышал, как продажи выросли» и НЕ «мне рассказывали, что…».
- Хит — в чарте, в эфире; в памяти трек остаётся, запоминается. НЕ «стал хитом в памяти», НЕ «хит в памяти миллионов».
- Деньги/инвестиции из семени — это артист или лейбл («он вложил», «Jackson вложил»), не «я вложил», если в семени не про рассказчика.
- «У меня мурашки бегут» / «у меня до сих пор мурашки» — НЕ «меня мурашки бегут».`;
