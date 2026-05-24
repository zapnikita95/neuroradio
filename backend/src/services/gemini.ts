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
  DEFAULT_GEMINI_MODEL,
  GEMINI_FREE_MODELS,
  resolveGeminiModel,
} from './gemini-models.js';
import {
  DEFAULT_STORY_LENGTH,
  getStoryLengthPreset,
  StoryLengthId,
} from './story-length.js';
import {
  finalizeAfterQualityLoop,
  qualityOptionsForAttempt,
  validateGeneratedStory,
} from './story-generate-loop.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
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
  geminiModel?: string;
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

async function callGeminiOnce(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  useJsonMode: boolean,
): Promise<string> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const generationConfig: Record<string, unknown> = {
    temperature: useJsonMode ? 0.72 : 0.65,
    maxOutputTokens: maxTokens,
  };
  if (useJsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }
  if (model.startsWith('gemini-2.5')) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig,
    }),
    signal: AbortSignal.timeout(45000),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    if (useJsonMode && response.status === 400) {
      const recovered = extractTextFromGeminiBody(rawBody);
      if (recovered) return recovered;
    }
    const err = new Error(`Gemini API error ${response.status}: ${rawBody.slice(0, 400)}`) as Error & {
      status?: number;
      retryable?: boolean;
      tryNextModel?: boolean;
    };
    err.status = response.status;
    err.tryNextModel =
      response.status === 404 ||
      (response.status === 400 &&
        (rawBody.includes('location is not supported') ||
          rawBody.includes('not found') ||
          rawBody.includes('not supported'))) ||
      response.status === 429 ||
      rawBody.includes('limit: 0') ||
      rawBody.includes('RESOURCE_EXHAUSTED') ||
      rawBody.includes('quota');
    err.retryable = response.status === 429 || response.status >= 500;
    throw err;
  }

  const text = extractTextFromGeminiBody(rawBody);
  if (!text) throw new Error('Gemini returned empty content');
  return text;
}

function extractTextFromGeminiBody(rawBody: string): string | null {
  try {
    const data = JSON.parse(rawBody) as {
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    if (text) return text;
    if (candidate?.finishReason === 'SAFETY') {
      throw new Error('Gemini blocked response (safety filter)');
    }
    return null;
  } catch (err) {
    if (err instanceof Error && err.message.includes('safety')) throw err;
    return null;
  }
}

async function callGeminiWithModel(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  try {
    return await callGeminiOnce(apiKey, model, systemPrompt, userPrompt, maxTokens, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const tryNext = (err as { tryNextModel?: boolean }).tryNextModel;
    if (message.includes('400') || message.includes('JSON')) {
      return callGeminiOnce(apiKey, model, systemPrompt, userPrompt, maxTokens, false);
    }
    if (tryNext) throw err;
    throw err;
  }
}

function geminiModelsToTry(preferred?: string): string[] {
  const primary = resolveGeminiModel(preferred);
  const rest = GEMINI_FREE_MODELS.map((m) => m.id).filter((id) => id !== primary);
  return [primary, ...rest];
}

export function isGeminiStoryFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|gemini api error|could not produce a usable story|quota exceeded|resource_exhausted/i.test(
    msg,
  );
}

/** One Gemini model per invocation — caller rotates index on 429 / unsupported model. */
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  geminiModel: string | undefined,
  modelIndex = 0,
): Promise<{ content: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const models = geminiModelsToTry(geminiModel);
  const model = models[modelIndex];
  if (!model) {
    throw new Error(
      'Все бесплатные модели Gemini недоступны (квота). Попробуй через минуту.',
    );
  }

  try {
    const content = await callGeminiWithModel(apiKey, model, systemPrompt, userPrompt, maxTokens);
    return { content, model };
  } catch (err) {
    const lastError = err instanceof Error ? err : new Error(String(err));
    const status = (err as { status?: number }).status;
    console.warn(
      `[gemini] model ${model} failed (${status ?? 'err'}): ${lastError.message.slice(0, 120)}`,
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

export function hasGeminiApiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
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

  let retryReason: string | undefined;
  let geminiModelIndex = 0;
  let lastCandidate: StoryScript | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const userPrompt = buildStoryUserPrompt({
      ...input,
      voiceId,
      storyLength,
      previousScripts,
      retryReason,
      selectedReferenceFact: input.selectedReferenceFact,
    });

    let content: string;
    try {
      const result = await callGemini(
        systemPrompt,
        userPrompt,
        lengthPreset.maxTokens,
        input.geminiModel,
        geminiModelIndex,
      );
      content = result.content;
      const idx = geminiModelsToTry(input.geminiModel).indexOf(result.model);
      if (idx >= 0) geminiModelIndex = idx;
    } catch (err) {
      const status = (err as { status?: number }).status;
      const tryNext = (err as { tryNextModel?: boolean }).tryNextModel;
      const models = geminiModelsToTry(input.geminiModel);
      if ((status === 429 || tryNext) && geminiModelIndex + 1 < models.length) {
        geminiModelIndex += 1;
        console.warn(`[gemini] attempt ${attempt + 1}: next model index ${geminiModelIndex}`);
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

    const qOpts = qualityOptionsForAttempt(attempt, MAX_ATTEMPTS, referenceFacts);

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

    const sanitized = sanitizeScriptForTts(story.script, input.artist, input.title);
    const sanitizedQuality = validateGeneratedStory(
      sanitized,
      storyLength,
      input.artist,
      input.title,
      qOpts,
    );
    if (sanitizedQuality.ok) {
      console.warn(`Gemini story sanitized after attempt ${attempt + 1}: ${quality.reason}`);
      return finalizeStory({ ...story, script: sanitized }, { ...input, voiceId }, storyLength);
    }

    lastCandidate = { ...story, script: sanitized };
    retryReason = sanitizedQuality.reason ?? quality.reason;
    console.warn(`Gemini story quality reject (attempt ${attempt + 1}): ${retryReason}`);
  }

  const fallback = finalizeAfterQualityLoop(
    lastCandidate,
    { artist: input.artist, title: input.title },
    (s) => finalizeStory(s, { ...input, voiceId }, storyLength),
  );
  if (fallback) return fallback;

  throw new Error('Could not produce a usable story');
}
