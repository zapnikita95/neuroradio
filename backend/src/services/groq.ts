import fetch from 'node-fetch';
import {
  buildStoryUserPrompt,
  buildSystemPrompt,
  buildPersonaForNarrator,
  pickAngle,
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

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_ATTEMPTS = 3;

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
  selectedReferenceFact?: { fact: string; scope: 'artist' | 'track'; scopeLabelRu: string };
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
    temperature: useJsonMode ? 0.72 : 0.65,
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
): Promise<{ content: string; model: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

  const models = resolveGroqModelOrder();
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
  const sanitized = sanitizeScriptForTts(story.script, input.artist, input.title);
  return {
    ...story,
    script: sanitized,
    word_count: countWords(sanitized),
    voiceId: input.voiceId ?? story.voiceId,
  };
}

export function hasGroqApiKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export async function generateStoryScript(
  input: GenerateStoryInput,
): Promise<StoryScript> {
  const previousScripts = input.previousScripts ?? [];
  const storyLength = input.storyLength ?? DEFAULT_STORY_LENGTH;
  const lengthPreset = getStoryLengthPreset(storyLength);
  const angle = pickAngle(previousScripts.length);
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

  let retryReason: string | undefined;
  let groqModelIndex = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const userPrompt = buildStoryUserPrompt({
      ...input,
      voiceId,
      angle,
      storyLength,
      previousScripts,
      retryReason,
      selectedReferenceFact: input.selectedReferenceFact,
    });

    let content: string;
    try {
      const result = await callGroq(systemPrompt, userPrompt, lengthPreset.maxTokens, groqModelIndex);
      content = result.content;
      const idx = resolveGroqModelOrder().indexOf(result.model);
      if (idx >= 0) groqModelIndex = idx;
    } catch (err) {
      if (err instanceof GroqApiError && err.status === 429 && groqModelIndex + 1 < resolveGroqModelOrder().length) {
        groqModelIndex += 1;
        console.warn(`[groq] quality attempt ${attempt + 1}: rotating to model index ${groqModelIndex}`);
        continue;
      }
      throw err;
    }
    const story = parseStoryJson(content);
    if (!story) {
      retryReason = 'invalid JSON';
      continue;
    }

    story.voiceId = voiceId;
    story.word_count = countWords(story.script);

    const quality = validateStoryScript(
      story.script,
      storyLength,
      input.artist,
      input.title,
      {
        strictLength: attempt === MAX_ATTEMPTS - 1 ? false : true,
        skipWatery: attempt === MAX_ATTEMPTS - 1,
        referenceFacts,
      },
    );
    if (quality.ok) {
      return finalizeStory(story, { ...input, voiceId }, storyLength);
    }

    const sanitized = sanitizeScriptForTts(story.script, input.artist, input.title);
    const sanitizedQuality = validateStoryScript(
      sanitized,
      storyLength,
      input.artist,
      input.title,
      {
        strictLength: attempt === MAX_ATTEMPTS - 1 ? false : true,
        skipWatery: attempt === MAX_ATTEMPTS - 1,
        referenceFacts,
      },
    );
    if (sanitizedQuality.ok) {
      console.warn(`Story sanitized after attempt ${attempt + 1}: ${quality.reason}`);
      return finalizeStory({ ...story, script: sanitized }, { ...input, voiceId }, storyLength);
    }

    retryReason = sanitizedQuality.reason ?? quality.reason;
    console.warn(`Story quality reject (attempt ${attempt + 1}): ${retryReason}`);
  }

  throw new Error('Could not produce a usable story');
}
