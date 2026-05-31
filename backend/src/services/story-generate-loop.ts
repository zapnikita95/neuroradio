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
    skipFirstSentenceAnchor: false,
    skipBannedPatterns: false,
    skipEnglishCheck: false,
    referenceFacts: hasFacts ? referenceFacts : [],
  };
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

/** Слабые free-мodelи (Liquid LFM): короче нормы по длине, якорь к факту — всегда. */
export function qualityOptionsForOpenRouterAttempt(
  _attempt: number,
  _maxAttempts: number,
  referenceFacts: string[],
): StoryQualityAttemptOptions {
  const hasFacts = referenceFacts.length > 0;
  return {
    strictLength: false,
    minWordsOverride: 88,
    skipWatery: false,
    skipReferenceAnchor: false,
    skipFirstSentenceAnchor: false,
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
  referenceFacts: string[] = [],
  options: { relaxForWeakLlm?: boolean } = {},
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
  const relax = options.relaxForWeakLlm ?? false;
  const anchorCheck = validateStoryScript(sanitized, '60s', input.artist, input.title, {
    strictLength: false,
    minWordsOverride: relax ? 88 : undefined,
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
  if (wordCount < 28) {
    logRejectedScript('last script rejected as too short after retries', sanitized, `${wordCount} words`);
    return null;
  }
  const story = { ...lastCandidate, script: sanitized };
  console.warn('[story] accepting last script after quality retries exhausted');
  return finalize(story);
}
