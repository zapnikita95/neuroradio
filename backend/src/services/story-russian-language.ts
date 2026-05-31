import {
  buildAllowedLatinTokens,
  replaceGenericEnglish,
} from './story-english-normalize.js';
const FORBIDDEN_PHRASES: RegExp[] = [
  /#\s*\d/,
];

const LATIN_WORD = /\b[a-z]{3,}\b/i;

/** Leave disallowed Latin for detection; mask allowed tokens and hyphen hybrids. */
function textForEnglishLeakCheck(
  text: string,
  allowed: ReturnType<typeof buildAllowedLatinTokens>,
): string {
  let result = text.replace(/«[^»]*»/g, ' ');
  result = result.replace(/\b[a-z]{2,}\b/gi, (match) => {
    return allowed.has(match.toLowerCase()) ? ' ' : match;
  });
  result = result.replace(/\b[a-z]{2,}(?=-[\u0400-\u04FF])/gi, '');
  return result;
}

export function hasEnglishLeak(
  script: string,
  artist = '',
  title = '',
  options: { referenceFacts?: string[] } = {},
): boolean {
  const referenceFacts = options.referenceFacts ?? [];
  const normalized = replaceGenericEnglish(script.trim());
  if (FORBIDDEN_PHRASES.some((pattern) => pattern.test(normalized))) return true;

  const allowed = buildAllowedLatinTokens(artist, title, referenceFacts, normalized);
  const remaining = textForEnglishLeakCheck(normalized, allowed);
  return LATIN_WORD.test(remaining);
}

export const RUSSIAN_LANGUAGE_PROMPT_BLOCK = `ЯЗЫК — ТОЛЬКО РУССКИЙ, ДЛЯ ОЗВУЧКИ:
- Основной текст по-русски. Имена собственные лatinицей МОЖНО и НУЖНО сохранять: Billboard, Cash Box, Rolling Stone, названия групп и треков в «кавычках».
- НЕ переводи названия журналов, лейблов, артистов и песен — это имена собственные.
- Обычные английские слова (chart, band, single, live, hit, mainstream) переводи по смыслу: чарт, группа, сингл, живой, хит.
- ПЛОХО: «viral hit на top-5» без перевода обычных слов.
- ХОРОШО: «Billboard назвал трек одним из лучших поп-релизов года», «Redbone получил рецензию в Cash Box».
- Запрещены гибриды latin+кириллица (guitarist, brazilian) — переводи корень.`;
