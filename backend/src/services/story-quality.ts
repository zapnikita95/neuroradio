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
];

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function validateStoryScript(
  script: string,
  lengthId: StoryLengthId = DEFAULT_STORY_LENGTH,
): { ok: true } | { ok: false; reason: string } {
  const limits = getStoryLengthPreset(lengthId);
  const trimmed = script.trim();
  if (!trimmed) return { ok: false, reason: 'empty script' };

  const words = countWords(trimmed);
  if (words < limits.wordsMin) {
    return { ok: false, reason: `too short (${words} words, need ${limits.wordsMin}+)` };
  }
  if (words > limits.wordsMax + 20) {
    return { ok: false, reason: `too long (${words} words, max ~${limits.wordsMax})` };
  }

  for (const pattern of BANNED_SCRIPT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { ok: false, reason: `banned pattern: ${pattern.source}` };
    }
  }

  return { ok: true };
}
