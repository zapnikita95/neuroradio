import type { StoryLengthId } from './story-length.js';
import {
  countWords,
  findHardScriptViolation,
  findIncompleteEnding,
  findWateryContent,
  anchorsReferenceFact,
  sanitizeScriptForTts,
  stripBannedFluff,
  trimToLastCompleteSentence,
  validateStoryScript,
} from './story-quality.js';
import { storyNamesForeignArtist, COVER_CONTEXT_RE, factMentionsArtist } from './fact-relevance.js';
import { isMetadataOnlyFallbackFact } from './metadata-facts.js';
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
  skipPersonaCliches?: boolean;
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
    skipFirstSentenceAnchor: true,
    skipBannedPatterns: false,
    skipPersonaCliches: true,
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
  let scriptBody = lastCandidate.script;
  if (findIncompleteEnding(scriptBody)) {
    const trimmed = trimToLastCompleteSentence(scriptBody);
    if (findIncompleteEnding(trimmed)) {
      logRejectedScript('last script rejected', scriptBody, 'incomplete ending');
      return null;
    }
    console.warn('[story] trimmed incomplete ending before finalize');
    scriptBody = trimmed;
  }
  const sanitized = stripBannedFluff(
    sanitizeScriptForTts(
      scriptBody,
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
  const water = findWateryContent(sanitized, input.artist, input.title, referenceFacts, {
    skipPersonaCliches: true,
  });
  if (water) {
    logRejectedScript('last script rejected (watery/ungrounded)', sanitized, water);
    return null;
  }
  const hard = findHardScriptViolation(sanitized);
  if (hard) {
    logRejectedScript('last script rejected as hard violation', sanitized, hard);
    return null;
  }
  if (referenceFacts.length === 0) {
    logRejectedScript('last script rejected', sanitized, 'no reference facts');
    return null;
  }
  if (referenceFacts.every(isMetadataOnlyFallbackFact)) {
    logRejectedScript('last script rejected', sanitized, 'metadata-only placeholder facts');
    return null;
  }
  if (
    storyNamesForeignArtist(
      sanitized,
      input.artist,
      input.title,
      referenceFacts,
    )
  ) {
    logRejectedScript('last script rejected (foreign artist)', sanitized, 'wrong artist in script');
    return null;
  }
  if (
    !referenceFacts.some((f) => COVER_CONTEXT_RE.test(f)) &&
    !factMentionsArtist(sanitized, input.artist)
  ) {
    logRejectedScript('last script rejected', sanitized, 'does not mention performing artist');
    return null;
  }
  const grounded = anchorsReferenceFact(sanitized, referenceFacts);
  if (!grounded) {
    logRejectedScript('last script rejected on finalize', sanitized, 'not grounded in reference facts');
    return null;
  }
  const story = { ...lastCandidate, script: sanitized };
  console.warn('[story] accepting last script after quality retries exhausted');
  return finalize(story);
}
