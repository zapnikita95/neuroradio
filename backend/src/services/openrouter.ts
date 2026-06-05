import {
  buildStoryUserPrompt,
  buildSystemPrompt,
  buildPersonaForNarrator,
} from './prompts.js';
import { resolveStoryNarrator, StoryNarratorId } from './story-narrator.js';
import { YandexVoiceId, voiceForYear } from './voices.js';
import {
  countWords,
  sanitizeScriptForTts,
  validateStoryScript,
} from './story-quality.js';
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
import type { GenerateStoryInput, StoryScript } from './groq.js';
import { logRejectedScript } from './story-reject-log.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_ATTEMPTS = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function parseStoryJson(raw: string): StoryScript | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<StoryScript>;
    if (!parsed.script || typeof parsed.script !== 'string') return null;
    return {
      script: parsed.script.trim(),
      word_count: parsed.word_count ?? countWords(parsed.script),
      voiceId: (parsed.voiceId as YandexVoiceId) ?? 'zahar',
    };
  } catch {
    return null;
  }
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
  const systemPrompt = buildSystemPrompt(persona, lengthPreset);
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

  for (const model of models) {
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const userPrompt = buildStoryUserPrompt({
          ...input,
          voiceId,
          storyLength,
          previousScripts,
          selectedReferenceFact: input.selectedReferenceFact,
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
            `[openrouter] model=${model} invalid JSON, snippet=${content.slice(0, 160).replace(/\s+/g, ' ')}`,
          );
          break;
        }

        story.voiceId = voiceId;
        story.word_count = countWords(story.script);
        const qOpts = qualityOptionsForOpenRouterAttempt(attempt, MAX_ATTEMPTS, referenceFacts);
        qOpts.previousScripts = previousScripts;

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
        );
        const sanitizedQuality = validateGeneratedStory(
          sanitized,
          storyLength,
          input.artist,
          input.title,
          qOpts,
        );
        if (sanitizedQuality.ok) {
          console.warn(`Story sanitized after attempt ${attempt + 1}: ${quality.reason}`);
          return finalizeStory({ ...story, script: sanitized }, { ...input, voiceId }, storyLength);
        }

        lastCandidate = { ...story, script: sanitized };
        const rejectReason = sanitizedQuality.reason ?? quality.reason ?? 'quality';
        const isPersonaOnly =
          /^(?:persona cliche|generic fiction|cliche filler):/i.test(rejectReason);
        if (isPersonaOnly && qOpts.skipPersonaCliches) {
          console.log(
            `[openrouter] persona-style note (not rejected in production): ${rejectReason}`,
          );
          return finalizeStory({ ...story, script: sanitized }, { ...input, voiceId }, storyLength);
        }
        logRejectedScript(
          'OpenRouter quality reject (single-shot)',
          sanitized,
          rejectReason,
        );
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      if (!isOpenRouterRateLimitError(err) && !/quality reject/i.test(msg)) {
        console.warn(`[openrouter] model=${model} failed: ${msg.slice(0, 160)}`);
      }
    }
  }

  const fallback = finalizeAfterQualityLoop(
    lastCandidate,
    { artist: input.artist, title: input.title },
    (s) => finalizeStory(s, { ...input, voiceId }, storyLength),
    referenceFacts,
    { relaxForWeakLlm: referenceFacts.length > 0 },
  );
  if (fallback) return fallback;

  throw new Error(
    lastCandidate
      ? 'OpenRouter could not produce a usable story'
      : lastError?.message ?? 'OpenRouter returned invalid story',
  );
}
