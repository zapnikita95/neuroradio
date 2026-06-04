import type { StoryLengthId } from './story-length.js';
import {
  BANNED_SCRIPT_PATTERNS,
  countWords,
  findWateryContent,
  sanitizeScriptForTts,
  stripBannedFluff,
  validateStoryScript,
} from './story-quality.js';
import { logRejectedScript } from './story-reject-log.js';

/** Below this — empty/garbage, not a story. Normal length is enforced by TTS speed + preset in prompt only. */
const ABSOLUTE_MIN_STORY_WORDS = 12;

export interface StoryQualityAttemptOptions {
  strictLength?: boolean;
  skipWatery?: boolean;
  referenceFacts?: string[];
  skipReferenceAnchor?: boolean;
  skipFirstSentenceAnchor?: boolean;
  skipBannedPatterns?: boolean;
  skipEnglishCheck?: boolean;
  minWordsOverride?: number;
  previousScripts?: string[];
}

/** Production story checks — no word-count gate; length is a prompt/TTS concern. */
export function qualityOptionsForProductionAttempt(
  referenceFacts: string[],
): StoryQualityAttemptOptions {
  const hasFacts = referenceFacts.length > 0;
  return {
    strictLength: false,
    skipWatery: false,
    skipReferenceAnchor: !hasFacts,
    skipFirstSentenceAnchor: false,
    skipBannedPatterns: false,
    skipEnglishCheck: false,
    referenceFacts: hasFacts ? referenceFacts : [],
  };
}

export function qualityOptionsForAttempt(
  _attempt: number,
  _maxAttempts: number,
  referenceFacts: string[],
): StoryQualityAttemptOptions {
  return qualityOptionsForProductionAttempt(referenceFacts);
}

/** Local Ollama: never relax fiction/anchor checks — bad story is worse than no story. */
export function qualityOptionsForLocalAttempt(
  attempt: number,
  maxAttempts: number,
  referenceFacts: string[],
): StoryQualityAttemptOptions {
  const isLast = attempt >= maxAttempts - 1;
  const hasFacts = referenceFacts.length > 0;
  return {
    strictLength: !isLast,
    skipWatery: false,
    skipReferenceAnchor: false,
    skipFirstSentenceAnchor: false,
    skipBannedPatterns: false,
    skipEnglishCheck: false,
    referenceFacts: hasFacts ? referenceFacts : [],
  };
}

/** @deprecated alias */
export function qualityOptionsForOpenRouterAttempt(
  _attempt: number,
  _maxAttempts: number,
  referenceFacts: string[],
): StoryQualityAttemptOptions {
  return qualityOptionsForProductionAttempt(referenceFacts);
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

/** If strict checks fail on all attempts, still ship the last sanitized script when grounded. */
export function finalizeAfterQualityLoop<T extends { script: string }>(
  lastCandidate: T | null,
  input: { artist: string; title: string },
  finalize: (story: T) => T,
  referenceFacts: string[] = [],
  _options: { relaxForWeakLlm?: boolean } = {},
): T | null {
  if (!lastCandidate?.script?.trim()) return null;
  const sanitized = stripBannedFluff(
    sanitizeScriptForTts(
      lastCandidate.script,
      input.artist,
      input.title,
      referenceFacts,
    ),
  );
  const wordCount = countWords(sanitized);
  if (wordCount < ABSOLUTE_MIN_STORY_WORDS) {
    logRejectedScript('last script rejected as too short after retries', sanitized, `${wordCount} words`);
    return null;
  }
  const water = findWateryContent(sanitized, input.artist, input.title, referenceFacts);
  if (water) {
    logRejectedScript('last script rejected as water', sanitized, water);
    return null;
  }
  for (const pattern of BANNED_SCRIPT_PATTERNS) {
    if (pattern.test(sanitized)) {
      logRejectedScript('last script rejected as banned', sanitized, pattern.source);
      return null;
    }
  }
  if (referenceFacts.length === 0) {
    logRejectedScript('last script rejected', sanitized, 'no reference facts');
    return null;
  }
  const anchorCheck = validateStoryScript(sanitized, '60s', input.artist, input.title, {
    strictLength: false,
    referenceFacts,
    skipBannedPatterns: true,
    skipEnglishCheck: false,
    skipWatery: true,
    skipReferenceAnchor: false,
    skipFirstSentenceAnchor: true,
  });
  if (!anchorCheck.ok) {
    logRejectedScript('last script rejected on finalize', sanitized, anchorCheck.reason ?? 'quality');
    return null;
  }
  const story = { ...lastCandidate, script: sanitized };
  console.warn('[story] accepting last script after quality retries exhausted');
  return finalize(story);
}
