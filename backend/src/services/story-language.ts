export type StoryLanguageId = 'ru' | 'en';

export const DEFAULT_STORY_LANGUAGE: StoryLanguageId = 'ru';

export function resolveStoryLanguage(value: unknown): StoryLanguageId {
  if (value === 'en' || value === 'EN') return 'en';
  if (value === 'ru' || value === 'RU') return 'ru';
  return DEFAULT_STORY_LANGUAGE;
}

export function isEnglishStoryLanguage(lang: StoryLanguageId): boolean {
  return lang === 'en';
}
