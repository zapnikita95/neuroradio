import type { StoryLengthId } from './story-length.js';
import type { StoryLanguageId } from './story-language.js';
import {
  countWords,
  findHardScriptViolation,
  findIncompleteEnding,
  findLlmGarbage,
  findNewsSeedBleedIntoRecordingStory,
  findOffSeedInvention,
  findWateryContent,
  findUngroundedClaims,
  anchorsReferenceFact,
  referenceFactsAreAnchorable,
  sanitizeScriptForTts,
  stripBannedFluff,
  trimToLastCompleteSentence,
  validateStoryScript,
} from './story-quality.js';
import { storyNamesForeignArtist, COVER_CONTEXT_RE, factMentionsArtist, storyMentionsPerformingArtist } from './fact-relevance.js';
import { isMetadataOnlyFallbackFact } from './metadata-facts.js';
import { isWeakSnippetSeed } from './search-snippet-salvage.js';
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
  skipRussianCheck?: boolean;
  storyLanguage?: StoryLanguageId;
  minWordsOverride?: number;
  previousScripts?: string[];
  speakTrackNamesInVoiceover?: boolean;
}

/** Production story checks — no word-count gate; length is a prompt/TTS concern. */
export function qualityOptionsForProductionAttempt(
  referenceFacts: string[],
  storyLanguage: StoryLanguageId = 'ru',
): StoryQualityAttemptOptions {
  const hasFacts = referenceFacts.length > 0;
  return {
    strictLength: false,
    skipWatery: false,
    skipReferenceAnchor: !hasFacts,
    skipFirstSentenceAnchor: true,
    skipBannedPatterns: false,
    skipPersonaCliches: true,
    skipEnglishCheck: storyLanguage === 'en',
    skipRussianCheck: storyLanguage !== 'en',
    storyLanguage,
    referenceFacts: hasFacts ? referenceFacts : [],
  };
}

export function qualityOptionsForAttempt(
  _attempt: number,
  _maxAttempts: number,
  referenceFacts: string[],
  storyLanguage: StoryLanguageId = 'ru',
): StoryQualityAttemptOptions {
  return qualityOptionsForProductionAttempt(referenceFacts, storyLanguage);
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
  storyLanguage: StoryLanguageId = 'ru',
): StoryQualityAttemptOptions {
  return qualityOptionsForProductionAttempt(referenceFacts, storyLanguage);
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
  input: { artist: string; title: string; speakTrackNamesInVoiceover?: boolean },
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
      { speakTrackNamesInVoiceover: input.speakTrackNamesInVoiceover },
    ),
  );
  const wordCount = countWords(sanitized);
  if (wordCount < ABSOLUTE_MIN_STORY_WORDS) {
    logRejectedScript('last script rejected as too short after retries', sanitized, `${wordCount} words`);
    return null;
  }
  const water = findWateryContent(sanitized, input.artist, input.title, referenceFacts, {
    skipPersonaCliches: true,
    speakTrackNamesInVoiceover: input.speakTrackNamesInVoiceover,
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
  const garbage = findLlmGarbage(sanitized, {
    allowVoiceoverPlaceholders: input.speakTrackNamesInVoiceover !== true,
    skipHitMemoryWhenGrounded: true,
    referenceFacts,
  });
  if (garbage) {
    logRejectedScript('last script rejected as llm garbage', sanitized, garbage);
    return null;
  }
  const ungrounded = findUngroundedClaims(sanitized, referenceFacts);
  if (ungrounded) {
    logRejectedScript('last script rejected (ungrounded claim)', sanitized, ungrounded);
    return null;
  }
  const newsBleed = findNewsSeedBleedIntoRecordingStory(sanitized, input.title, referenceFacts);
  if (newsBleed) {
    logRejectedScript('last script rejected (news seed bleed)', sanitized, newsBleed);
    return null;
  }
  const offSeed = findOffSeedInvention(sanitized, referenceFacts);
  if (offSeed) {
    logRejectedScript('last script rejected (off-seed invention)', sanitized, offSeed);
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
  if (referenceFacts.every((f) => isWeakSnippetSeed(f))) {
    logRejectedScript('last script rejected', sanitized, 'lyrics/junk seed — not grounded');
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
    !storyMentionsPerformingArtist(sanitized, input.artist, input.title)
  ) {
    logRejectedScript('last script rejected', sanitized, 'does not mention performing artist');
    return null;
  }
  const grounded = referenceFactsAreAnchorable(referenceFacts, input.artist, input.title)
    ? anchorsReferenceFact(sanitized, referenceFacts)
    : true;
  if (!grounded) {
    if (
      !referenceFactsAreAnchorable(referenceFacts, input.artist, input.title) &&
      !referenceFacts.every((f) => isWeakSnippetSeed(f)) &&
      factMentionsArtist(sanitized, input.artist) &&
      !findLlmGarbage(sanitized, {
        allowVoiceoverPlaceholders: input.speakTrackNamesInVoiceover !== true,
        skipHitMemoryWhenGrounded: true,
        referenceFacts,
      })
    ) {
      console.warn('[story] accepting last script — junk seed, artist lore ok');
    } else {
      logRejectedScript('last script rejected on finalize', sanitized, 'not grounded in reference facts');
      return null;
    }
  }
  const story = { ...lastCandidate, script: sanitized };
  console.warn('[story] accepting last script after quality retries exhausted');
  return finalize(story);
}
