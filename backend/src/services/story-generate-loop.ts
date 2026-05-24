import type { StoryLengthId } from './story-length.js';
import { findWateryContent, sanitizeScriptForTts, validateStoryScript } from './story-quality.js';

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
  return {
    strictLength: !isLast,
    skipWatery: isLast,
    skipReferenceAnchor: isLast,
    skipBannedPatterns: isLast,
    skipEnglishCheck: isLast,
    referenceFacts: isLast ? [] : referenceFacts,
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
  const water = findWateryContent(sanitized, input.artist, input.title);
  if (water) {
    console.warn(`[story] last script rejected as water: ${water}`);
    return null;
  }
  const story = { ...lastCandidate, script: sanitized };
  console.warn('[story] accepting last script after quality retries exhausted');
  return finalize(story);
}
