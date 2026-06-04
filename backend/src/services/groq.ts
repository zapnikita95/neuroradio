import fetch from 'node-fetch';
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
import { resolveGroqModelOrder } from './groq-models.js';
import {
  finalizeAfterQualityLoop,
  qualityOptionsForAttempt,
  qualityOptionsForOpenRouterAttempt,
  validateGeneratedStory,
} from './story-generate-loop.js';
import { logRejectedScript } from './story-reject-log.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
/** One LLM HTTP call per story — no quality-retry spam (429 on shared Groq RPM). */
const MAX_ATTEMPTS = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGroqModelDecommissioned(err: unknown): boolean {
  if (!(err instanceof GroqApiError) || err.status !== 400) return false;
  return /model_decommissioned|has been decommissioned/i.test(err.bodySnippet);
}

export interface StoryScript {
  script: string;
  word_count: number;
  voiceId: YandexVoiceId;
}

export interface GenerateStoryInput {
  artist: string;
  title: string;
  year?: number;
  genre?: string;
  countryCode?: string;
  voiceId: YandexVoiceId;
  storyLength?: StoryLengthId;
  storyNarrator?: StoryNarratorId;
  previousScripts?: string[];
  referenceFacts?: string[];
  selectedReferenceFact?: { fact: string; scope: 'artist' | 'track' | 'album'; scopeLabelRu: string };
  /** Raw source snippets — model picks seed + writes story in one shot (no separate fact-hunt). */
  rawSnippets?: string[];
  groqModel?: string;
  openRouterModel?: string;
  openRouterModels?: string[];
  geminiModel?: string;
  /** User's key from the app — overrides server GROQ_API_KEY when set. */
  clientGroqApiKey?: string;
  clientGeminiApiKey?: string;
  clientOpenRouterApiKey?: string;
  /** Local Ollama over ZeroTier / LAN — from app or LOCAL_OLLAMA_BASE_URL on server. */
  localOllamaBaseUrl?: string;
  localOllamaModel?: string;
  /** major = rich sources; indie = metadata-only honest bio OK. */
  artistTier?: 'major' | 'indie';
}

export class GroqApiError extends Error {
  readonly status: number;
  readonly bodySnippet: string;
  readonly retryable: boolean;

  constructor(status: number, bodySnippet: string) {
    super(`Groq API error ${status}: ${bodySnippet}`);
    this.name = 'GroqApiError';
    this.status = status;
    this.bodySnippet = bodySnippet;
    this.retryable = status === 429 || status >= 500;
  }
}

export function isGroqRateLimitError(err: unknown): boolean {
  if (err instanceof GroqApiError) return err.status === 429;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|rate_limit_exceeded/i.test(msg);
}

export function isGroqStoryFailure(err: unknown): boolean {
  if (isGroqRateLimitError(err)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /could not produce a usable story|groq api error/i.test(msg);
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

function extractFailedGeneration(errorBody: string): string | null {
  try {
    const root = JSON.parse(errorBody) as { error?: { failed_generation?: string } };
    return root.error?.failed_generation?.trim() || null;
  } catch {
    return null;
  }
}

async function callGroqOnce(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  useJsonMode: boolean,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    temperature: useJsonMode ? 0.58 : 0.52,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
  if (useJsonMode) body.response_format = { type: 'json_object' };

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    if (useJsonMode && response.status === 400 && rawBody.includes('json_validate_failed')) {
      const recovered = extractFailedGeneration(rawBody);
      if (recovered) return recovered;
      return callGroqOnce(apiKey, model, systemPrompt, userPrompt, maxTokens, false);
    }
    throw new GroqApiError(response.status, rawBody.slice(0, 400));
  }

  const data = JSON.parse(rawBody) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty content');
  return content;
}

/** One Groq model per call — caller rotates index after 429. */
async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  modelIndex = 0,
  preferredModel?: string,
  apiKeyOverride?: string,
): Promise<{ content: string; model: string }> {
  const apiKey = apiKeyOverride?.trim() || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

  const models = resolveGroqModelOrder(preferredModel);
  const model = models[modelIndex];
  if (!model) throw new Error('All Groq models failed');

  try {
    const content = await callGroqOnce(
      apiKey,
      model,
      systemPrompt,
      userPrompt,
      maxTokens,
      true,
    );
    return { content, model };
  } catch (err) {
    const lastError = err instanceof Error ? err : new Error(String(err));
    const status = err instanceof GroqApiError ? err.status : 0;
    console.warn(
      `[groq] model ${model} failed (${status || 'err'}): ${lastError.message.slice(0, 120)}`,
    );
    throw lastError;
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

export function hasGroqApiKey(clientKey?: string): boolean {
  return Boolean(clientKey?.trim() || process.env.GROQ_API_KEY?.trim());
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

  let lastCandidate: StoryScript | null = null;
  const clientKey = input.clientGroqApiKey?.trim();
  const models = resolveGroqModelOrder(input.groqModel);
  const groqModelIndex = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const userPrompt = buildStoryUserPrompt({
      ...input,
      voiceId,
      storyLength,
      previousScripts,
      selectedReferenceFact: input.selectedReferenceFact,
    });

    const result = await callGroq(
      systemPrompt,
      userPrompt,
      lengthPreset.maxTokens,
      groqModelIndex,
      input.groqModel,
      clientKey,
    );
    console.log(`[groq] single-shot story model=${result.model}`);
    const content = result.content;
    const story = parseStoryJson(content);
    if (!story) {
      throw new Error('Groq returned invalid story JSON');
    }

    story.voiceId = voiceId;
    story.word_count = countWords(story.script);
    const qOpts =
      referenceFacts.length > 0
        ? qualityOptionsForOpenRouterAttempt(attempt, MAX_ATTEMPTS, referenceFacts)
        : qualityOptionsForAttempt(attempt, MAX_ATTEMPTS, referenceFacts);
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
    logRejectedScript('quality reject (single-shot)', sanitized, sanitizedQuality.reason ?? quality.reason ?? 'quality');
  }

  const fallback = finalizeAfterQualityLoop(
    lastCandidate,
    { artist: input.artist, title: input.title },
    (s) => finalizeStory(s, { ...input, voiceId }, storyLength),
    referenceFacts,
    { relaxForWeakLlm: referenceFacts.length > 0 },
  );
  if (fallback) return fallback;

  throw new Error('Could not produce a usable story');
}
