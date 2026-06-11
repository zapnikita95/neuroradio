import type { StoryLanguageId } from './story-language.js';

/**
 * Facts that explain Russian names/words to English speakers — only for EN stories.
 * In RU stories «Кино (Kino, Russian for "cinema")» sounds idiotic.
 */
const ENGLISH_ONLY_RUSSIAN_META_PATTERNS: RegExp[] = [
  /\bRussian for\b/i,
  /\bmeans\s+["'][^"']+["']\s+in\s+Russian\b/i,
  /\bin\s+Russian\s+means\b/i,
  /\bthe\s+Russian\s+word\b/i,
  /\bRussian\s+word\s+for\b/i,
  /\bfrom\s+the\s+Russian\b/i,
  /,\s*Russian for\s+["']/i,
  /\(\s*Russian for\b/i,
  /\btranslat(?:es?|ed|ion)\b.*\b(?:Russian|Cyrillic)\b/i,
  /\bCyrillic\b.*\bmeans\b/i,
  /\bRussian for\s+["']?(?:cinema|movie|blood|sun|dream)/i,
];

/** RU SEO lyric-analysis boilerplate — not a radio seed in any language. */
const LYRIC_SEO_JUNK_PATTERNS: RegExp[] = [
  /что означает песня/i,
  /смысл песни.*анализ/i,
  /полный анализ текст/i,
  /текст и смысл песни/i,
  /откройте глубокий смысл/i,
  /на основе ИИ/i,
];

export function isEnglishOnlyRussianMetaFact(fact: string): boolean {
  const trimmed = fact.trim();
  if (!trimmed) return false;
  return ENGLISH_ONLY_RUSSIAN_META_PATTERNS.some((p) => p.test(trimmed));
}

export function isLyricSeoJunkFact(fact: string): boolean {
  return LYRIC_SEO_JUNK_PATTERNS.some((p) => p.test(fact));
}

/** Whether a reference fact may be used for the given story language. */
export function factFitsStoryLanguage(fact: string, lang: StoryLanguageId): boolean {
  const trimmed = fact.trim();
  if (!trimmed) return false;
  if (isLyricSeoJunkFact(trimmed)) return false;
  if (lang === 'ru' && isEnglishOnlyRussianMetaFact(trimmed)) return false;
  return true;
}

export function filterFactsForStoryLanguage(facts: string[], lang: StoryLanguageId): string[] {
  return facts.filter((f) => factFitsStoryLanguage(f, lang));
}

export function filterBundleForStoryLanguage(
  bundle: { trackFacts: string[]; artistFacts: string[] },
  lang: StoryLanguageId,
): { trackFacts: string[]; artistFacts: string[] } {
  return {
    trackFacts: filterFactsForStoryLanguage(bundle.trackFacts, lang),
    artistFacts: filterFactsForStoryLanguage(bundle.artistFacts, lang),
  };
}
