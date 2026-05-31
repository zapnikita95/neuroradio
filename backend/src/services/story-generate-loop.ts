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

/** Слабые free-модели (Liquid LFM): постепенно ослабляем якорь, но не карусель моделей. */
export function qualityOptionsForOpenRouterAttempt(
  attempt: number,
  maxAttempts: number,
  referenceFacts: string[],
): StoryQualityAttemptOptions {
  const isLast = attempt >= maxAttempts - 1;
  const isMid = attempt >= 1;
  const hasFacts = referenceFacts.length > 0;
  return {
    strictLength: !isLast,
    skipWatery: isLast,
    skipReferenceAnchor: isLast,
    skipFirstSentenceAnchor: isMid || isLast,
    skipBannedPatterns: false,
    skipEnglishCheck: isLast,
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

/** Hard failures — never accept even in weak-llm finalize. */
const FINALIZE_HARD_REJECT = (reason: string): boolean =>
  reason.includes('different artist') ||
  reason.includes('duplicate of previous') ||
  reason.includes('no reference facts') ||
  reason.includes('empty script') ||
  reason.includes('banned pattern') ||
  reason.includes('english words');

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
  const relax = options.relaxForWeakLlm ?? false;
  if (!relax) {
    const water = findWateryContent(sanitized, input.artist, input.title, referenceFacts);
    if (water) {
      logRejectedScript('last script rejected as water', sanitized, water);
      return null;
    }
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
    skipEnglishCheck: relax,
    skipWatery: relax,
    skipReferenceAnchor: relax,
    skipFirstSentenceAnchor: true,
  });
  if (!anchorCheck.ok && FINALIZE_HARD_REJECT(anchorCheck.reason ?? '')) {
    logRejectedScript('last script rejected (hard gate)', sanitized, anchorCheck.reason ?? 'quality');
    return null;
  }
  if (!anchorCheck.ok && !relax) {
    logRejectedScript('last script rejected on finalize', sanitized, anchorCheck.reason ?? 'quality');
    return null;
  }
  if (!anchorCheck.ok && relax) {
    const artistNorm = input.artist.trim().toLowerCase();
    const mentionsArtist =
      artistNorm.length >= 3 &&
      sanitized.toLowerCase().includes(artistNorm.split(/\s+/)[0] ?? '');
    if (!mentionsArtist && wordCount < 28) {
      logRejectedScript('last script rejected on finalize (weak llm)', sanitized, anchorCheck.reason ?? 'quality');
      return null;
    }
    console.warn(`[story] weak-llm finalize: accepting despite ${anchorCheck.reason}`);
  }
  if (wordCount < 28) {
    logRejectedScript('last script rejected as too short after retries', sanitized, `${wordCount} words`);
    return null;
  }
  const story = { ...lastCandidate, script: sanitized };
  console.warn('[story] accepting last script after quality retries exhausted');
  return finalize(story);
}
