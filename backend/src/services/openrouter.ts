import {
  buildStoryUserPrompt,
  buildSystemPrompt,
  buildPersonaForNarrator,
} from './prompts.js';
import { resolveStoryNarrator, StoryNarratorId } from './story-narrator.js';
import { YandexVoiceId, voiceForYear } from './voices.js';
import {
  countWords,
  findArtistSeedTrackMisattribution,
  findHardScriptViolation,
  findLlmGarbage,
  findNewsSeedBleedIntoRecordingStory,
  findOffSeedInvention,
  findUngroundedClaims,
  findPersonaCliche,
  findNostalgiaFluffOnThinSeed,
  findWateryContent,
  hasConcreteFact,
  anchorsReferenceFact,
  referenceFactsAreAnchorable,
  buildStoryRetryDirective,
  sanitizeScriptForTts,
  validateStoryScript,
} from './story-quality.js';
import { isGenericMusicVideoSeed, interestScore, isListeningStatsFact, isMetadataHarvestFact } from './reference-fact-quality.js';
import { isArtistLateLifeHealthFactWithoutTrack } from './fact-track-anchor.js';
import { factMentionsArtist, storyMentionsPerformingArtist } from './fact-relevance.js';
import {
  DEFAULT_STORY_LENGTH,
  getStoryLengthPreset,
  StoryLengthId,
} from './story-length.js';
import { resolveOpenRouterModel } from './openrouter-models.js';
import { callOpenAiChatCompletion, OpenAiChatError } from './llm-openai-chat.js';
import {
  qualityOptionsForOpenRouterAttempt,
  validateGeneratedStory,
  finalizeAfterQualityLoop,
} from './story-generate-loop.js';
import { isWeakSnippetSeed } from './search-snippet-salvage.js';
import type { GenerateStoryInput, StoryScript } from './groq.js';
import { logRejectedScript } from './story-reject-log.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_ATTEMPTS = 2;

function openRouterHeaders(): Record<string, string> {
  return {
    'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER?.trim() || 'https://music-story.app',
    'X-Title': 'Music Story',
  };
}

export function hasOpenRouterApiKey(clientKey?: string): boolean {
  return Boolean(clientKey?.trim() || process.env.OPEN_ROUTER_API_KEY?.trim());
}

export function isOpenRouterRateLimitError(err: unknown): boolean {
  if (err instanceof OpenAiChatError) return err.status === 429;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|rate.?limit/i.test(msg);
}

function extractScriptFieldLoose(raw: string): string | null {
  const match = raw.match(/"script"\s*:\s*"((?:[^"\\]|\\.)*)/s);
  if (!match?.[1]) return null;
  const unescaped = match[1]
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();
  return unescaped.length >= 40 ? unescaped : null;
}

function isTrivialScript(script: string): boolean {
  const s = script.trim();
  if (s.length < 12) return true;
  if (/^[\.\u2026…\s]+$/.test(s)) return true;
  return countWords(s) < 12;
}

function parseStoryJson(raw: string): StoryScript | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<StoryScript>;
      if (parsed.script && typeof parsed.script === 'string') {
        const script = parsed.script.trim();
        if (isTrivialScript(script)) return null;
        return {
          script,
          word_count: parsed.word_count ?? countWords(script),
          voiceId: (parsed.voiceId as YandexVoiceId) ?? 'zahar',
        };
      }
    } catch {
      // fall through to loose extract
    }
  }
  const loose = extractScriptFieldLoose(trimmed);
  if (loose && !isTrivialScript(loose)) {
    return {
      script: loose,
      word_count: countWords(loose),
      voiceId: 'zahar',
    };
  }
  return null;
}

function finalizeStory(
  story: StoryScript,
  input: GenerateStoryInput,
  storyLength: StoryLengthId,
): StoryScript {
  const sanitized = sanitizeScriptForTts(
    story.script,
    input.artist,
    input.title,
    input.referenceFacts ?? [],
    {
      storyLanguage: input.storyLanguage,
      speakTrackNamesInVoiceover: input.speakTrackNamesInVoiceover,
    },
  );
  return {
    ...story,
    script: sanitized,
    word_count: countWords(sanitized),
    voiceId: input.voiceId ?? story.voiceId,
  };
}

async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  model: string,
  apiKeyOverride?: string,
): Promise<string> {
  const apiKey = apiKeyOverride?.trim() || process.env.OPEN_ROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPEN_ROUTER_API_KEY is not configured');

  return callOpenAiChatCompletion({
    url: OPENROUTER_API_URL,
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    maxTokens,
    temperature: 0.48,
    useJsonMode: true,
    extraHeaders: openRouterHeaders(),
    label: 'OpenRouter',
    timeoutMs: 75_000,
  });
}

export async function generateStoryScript(
  input: GenerateStoryInput,
): Promise<StoryScript> {
  const previousScripts = input.previousScripts ?? [];
  const storyLength = input.storyLength ?? DEFAULT_STORY_LENGTH;
  const lengthPreset = getStoryLengthPreset(storyLength);
  const referenceFacts = input.referenceFacts ?? [];
  const narratorId = resolveStoryNarrator(input.storyNarrator);
  const persona = buildPersonaForNarrator(
    narratorId,
    input.year,
    input.genre,
    input.artist,
    input.title,
    input.countryCode,
  );
  const storyLanguage = input.storyLanguage ?? 'ru';
  const systemPrompt = buildSystemPrompt(persona, lengthPreset, storyLanguage, {
    speakTrackNamesInVoiceover: input.speakTrackNamesInVoiceover,
    artist: input.artist,
    title: input.title,
  });
  const voiceId = input.voiceId ?? voiceForYear(input.year, input.genre);

  const models = [
    ...new Set(
      [input.openRouterModel, ...(input.openRouterModels ?? [])].filter((m): m is string =>
        Boolean(m?.trim()),
      ),
    ),
  ];
  if (models.length === 0) {
    throw new Error('No OpenRouter model configured');
  }
  console.log(`[openrouter] story model chain: ${models.join(' → ')}`);

  let lastCandidate: StoryScript | null = null;
  let lastError: Error | undefined;
  let lastRejectReason: string | undefined;

  for (const model of models) {
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const userPrompt = buildStoryUserPrompt({
          ...input,
          voiceId,
          storyLength,
          previousScripts,
          selectedReferenceFact: input.selectedReferenceFact,
          storyLanguage,
          speakTrackNamesInVoiceover: input.speakTrackNamesInVoiceover,
          retryReason: buildStoryRetryDirective(lastRejectReason, lengthPreset.wordsMin, {
            script: lastCandidate?.script,
            storyNarrator: narratorId,
          }),
        });

        const content = await callOpenRouter(
          systemPrompt,
          userPrompt,
          lengthPreset.maxTokens,
          model,
          input.clientOpenRouterApiKey,
        );
        console.log(`[openrouter] single-shot story model=${model}`);

        const story = parseStoryJson(content);
        if (!story) {
          console.warn(
            `[openrouter] model=${model} invalid JSON, snippet=${content.slice(0, 160).replace(/\s+/g, ' ')} — next model`,
          );
          break;
        }

        story.voiceId = voiceId;
        story.word_count = countWords(story.script);
        const qOpts = qualityOptionsForOpenRouterAttempt(
          attempt,
          MAX_ATTEMPTS,
          referenceFacts,
          storyLanguage,
        );
        qOpts.previousScripts = previousScripts;
        qOpts.speakTrackNamesInVoiceover = input.speakTrackNamesInVoiceover;
        qOpts.storyNarrator = narratorId;

        const quality = validateGeneratedStory(
          story.script,
          storyLength,
          input.artist,
          input.title,
          qOpts,
        );
        if (quality.ok) {
          return finalizeStory(story, { ...input, voiceId }, storyLength);
        }

        const sanitized = sanitizeScriptForTts(
          story.script,
          input.artist,
          input.title,
          input.referenceFacts ?? [],
          {
            storyLanguage,
            speakTrackNamesInVoiceover: input.speakTrackNamesInVoiceover,
          },
        );
        const sanitizedQuality = validateGeneratedStory(
          sanitized,
          storyLength,
          input.artist,
          input.title,
          qOpts,
        );
        if (sanitizedQuality.ok) {
          const originalReason = quality.ok ? '' : quality.reason;
          const sanitizedGarbage = findLlmGarbage(sanitized, {
            allowVoiceoverPlaceholders: input.speakTrackNamesInVoiceover !== true,
            skipHitMemoryWhenGrounded: true,
            referenceFacts,
          });
          const rejectSanitized =
            sanitizedGarbage != null ||
            originalReason.startsWith('no concrete fact') ||
            originalReason.startsWith('ungrounded claim:');
          if (rejectSanitized) {
            console.warn(
              `[openrouter] model=${model} sanitized rejected: ${sanitizedGarbage ?? originalReason}`,
            );
          } else {
            console.warn(
              `[openrouter] model=${model} sanitized ok (was: ${originalReason || 'ok'}) words=${countWords(sanitized)}`,
            );
            return finalizeStory({ ...story, script: sanitized }, { ...input, voiceId }, storyLength);
          }
        } else if (!sanitizedQuality.ok) {
          console.warn(
            `[openrouter] model=${model} quality reject: ${sanitizedQuality.reason ?? (!quality.ok ? quality.reason : 'quality')}`,
          );
        }

        lastCandidate = { ...story, script: sanitized };
        const rejectReason =
          (!sanitizedQuality.ok ? sanitizedQuality.reason : undefined) ??
          (!quality.ok ? quality.reason : undefined) ??
          'quality';
        const isPersonaOnly =
          /^(?:persona cliche|generic fiction|cliche filler):/i.test(rejectReason);
        if (isPersonaOnly && qOpts.skipPersonaCliches) {
          console.log(
            `[openrouter] persona-style note (not rejected in production): ${rejectReason}`,
          );
          return finalizeStory({ ...story, script: sanitized }, { ...input, voiceId }, storyLength);
        }
        if (
          rejectReason === 'story ignores reference facts' &&
          !referenceFactsAreAnchorable(referenceFacts, input.artist, input.title) &&
          !referenceFacts.every((f) => isWeakSnippetSeed(f)) &&
          factMentionsArtist(sanitized, input.artist) &&
          !findLlmGarbage(sanitized, {
            allowVoiceoverPlaceholders: input.speakTrackNamesInVoiceover !== true,
            skipHitMemoryWhenGrounded: true,
            referenceFacts,
          })
        ) {
          console.warn(
            `[openrouter] accept story with junk seed — artist named, lore ok (${countWords(sanitized)} words)`,
          );
          return finalizeStory({ ...story, script: sanitized }, { ...input, voiceId }, storyLength);
        }
        lastRejectReason = rejectReason;
        logRejectedScript(
          'OpenRouter quality reject (single-shot)',
          sanitized,
          rejectReason,
        );
        console.warn(`[openrouter] model=${model} quality reject — next model`);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      if (isOpenRouterRateLimitError(err)) {
        console.warn(`[openrouter] model=${model} rate-limited — next model`);
        continue;
      }
      if (!/quality reject/i.test(msg)) {
        console.warn(`[openrouter] model=${model} failed: ${msg.slice(0, 160)} — next model`);
      }
    }
  }

  const fallback = finalizeAfterQualityLoop(
    lastCandidate,
    {
      artist: input.artist,
      title: input.title,
      speakTrackNamesInVoiceover: input.speakTrackNamesInVoiceover,
    },
    (s) => finalizeStory(s, { ...input, voiceId }, storyLength),
    referenceFacts,
  );
  if (fallback) return fallback;

  if (lastCandidate?.script?.trim()) {
    const garbageSeed =
      referenceFacts.length > 0 &&
      referenceFacts.every(
        (f) => isListeningStatsFact(f) || isMetadataHarvestFact(f) || interestScore(f) < 8,
      );
    if (garbageSeed) {
      throw new Error('OpenRouter could not produce a story grounded in reference facts');
    }
    const sanitized = sanitizeScriptForTts(
      lastCandidate.script,
      input.artist,
      input.title,
      referenceFacts,
      {
        storyLanguage,
        speakTrackNamesInVoiceover: input.speakTrackNamesInVoiceover,
      },
    );
    if (
      countWords(sanitized) >= 35 &&
      (storyMentionsPerformingArtist(sanitized, input.artist, input.title) ||
        hasConcreteFact(sanitized, input.artist, input.title) ||
        anchorsReferenceFact(sanitized, referenceFacts)) &&
      !findLlmGarbage(sanitized, {
        allowVoiceoverPlaceholders: input.speakTrackNamesInVoiceover !== true,
        skipHitMemoryWhenGrounded: true,
        referenceFacts,
      }) &&
      !findUngroundedClaims(sanitized, referenceFacts) &&
      !findOffSeedInvention(sanitized, referenceFacts) &&
      !findNewsSeedBleedIntoRecordingStory(sanitized, input.title, referenceFacts) &&
      !findWateryContent(sanitized, input.artist, input.title, referenceFacts, {
        skipPersonaCliches: input.storyNarrator !== 'fan' && input.storyNarrator !== 'contemporary',
        speakTrackNamesInVoiceover: input.speakTrackNamesInVoiceover,
        storyNarrator: input.storyNarrator,
      }) &&
      !findNostalgiaFluffOnThinSeed(sanitized, referenceFacts, input.storyNarrator) &&
      !findArtistSeedTrackMisattribution(sanitized, input.title, referenceFacts) &&
      !referenceFacts.some((f) => isArtistLateLifeHealthFactWithoutTrack(f, input.title)) &&
      !findHardScriptViolation(sanitized) &&
      !findPersonaCliche(sanitized) &&
      !referenceFacts.some((f) => isGenericMusicVideoSeed(f))
    ) {
      console.warn(
        `[openrouter] last-resort ship — quality gate waived (${countWords(sanitized)} words) artist="${input.artist}"`,
      );
      return finalizeStory({ ...lastCandidate, script: sanitized }, { ...input, voiceId }, storyLength);
    }
  }

  if (referenceFacts.length > 0) {
    throw new Error('OpenRouter could not produce a story grounded in reference facts');
  }
  throw new Error(
    lastCandidate
      ? 'OpenRouter could not produce a usable story'
      : lastError?.message ?? 'OpenRouter returned invalid story',
  );
}
