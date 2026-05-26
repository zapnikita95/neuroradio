import type { StoryLengthId } from './story-length.js';
import {
  countWords,
  findWateryContent,
  sanitizeScriptForTts,
  validateStoryScript,
} from './story-quality.js';

export interface StoryQualityAttemptOptions {
  strictLength?: boolean;
  skipWatery?: boolean;
  referenceFacts?: string[];
  skipReferenceAnchor?: boolean;
  skipBannedPatterns?: boolean;
  skipEnglishCheck?: boolean;
}

export function qualityOptionsForAttempt(
  attempt: number,
  maxAttempts: number,
  referenceFacts: string[],
): StoryQualityAttemptOptions {
  const isLast = attempt >= maxAttempts - 1;
  const hasFacts = referenceFacts.length > 0;
  return {
    strictLength: !isLast,
    skipWatery: false,
    skipReferenceAnchor: !hasFacts,
    skipBannedPatterns: false,
    skipEnglishCheck: false,
    referenceFacts: hasFacts ? referenceFacts : [],
  };
}

export function validateGeneratedStory(
  script: string,
  storyLength: StoryLengthId,
  artist: string,
  title: string,
  options: StoryQualityAttemptOptions,
) {
  return validateStoryScript(script, storyLength, artist, title, options);
}

/** If strict checks fail on all attempts, still ship the last sanitized script. */
export function finalizeAfterQualityLoop<T extends { script: string }>(
  lastCandidate: T | null,
  input: { artist: string; title: string },
  finalize: (story: T) => T,
): T | null {
  if (!lastCandidate?.script?.trim()) return null;
  const sanitized = sanitizeScriptForTts(lastCandidate.script, input.artist, input.title);
  const wordCount = countWords(sanitized);
  const water = findWateryContent(sanitized, input.artist, input.title);
  if (water) {
    console.warn(`[story] last script rejected as water: ${water}`);
    return null;
  }
  if (wordCount < 28) {
    console.warn(`[story] last script rejected as too short after retries: ${wordCount} words`);
    return null;
  }
  const story = { ...lastCandidate, script: sanitized };
  console.warn('[story] accepting last script after quality retries exhausted');
  return finalize(story);
}
