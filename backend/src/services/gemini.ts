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
  geminiGracefulMinWords,
  isGeminiFlashLiteModel,
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
import { logRejectedScript, logStoryScript } from './story-reject-log.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_ATTEMPTS = 3;
const GEMINI_FALLBACK_MODEL = 'gemini-2.0-flash-lite';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  selectedReferenceFact?: { fact: string; scope: 'artist' | 'track'; scopeLabelRu: string };
  rawSnippets?: string[];
  geminiModel?: string;
  clientGeminiApiKey?: string;
}

function parseStoryJson(raw: string): StoryScript | null {
  const trimmed = raw.trim();
  const plain = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Gemini can return plain text even with JSON prompt.
    if (plain.length >= 80) {
      return {
        script: plain,
        word_count: countWords(plain),
        voiceId: 'zahar',
      };
    }
    return null;
  }

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
    temperature: useJsonMode ? 0.38 : 0.32,
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
    // 429 = RPM burst for this key — rotating models burns ALL model quotas (see Railway logs).
    err.tryNextModel =
      response.status === 404 ||
      (response.status === 400 &&
        (rawBody.includes('location is not supported') ||
          rawBody.includes('not found') ||
          rawBody.includes('not supported'))) ||
      rawBody.includes('limit: 0') ||
      (rawBody.includes('RESOURCE_EXHAUSTED') && !rawBody.includes('PerMinute'));
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

/** User-selected model first; one stable fallback — not all 4 models on every 429. */
function geminiModelsToTry(preferred?: string): string[] {
  const primary = resolveGeminiModel(preferred);
  if (primary === GEMINI_FALLBACK_MODEL) return [primary];
  return [primary, GEMINI_FALLBACK_MODEL];
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
  apiKeyOverride?: string,
): Promise<{ content: string; model: string }> {
  const apiKey = apiKeyOverride?.trim() || process.env.GEMINI_API_KEY;
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

function validateGeminiHardQuality(
  script: string,
  input: GenerateStoryInput,
  storyLength: StoryLengthId,
  referenceFacts: string[],
  modelId: string,
): { ok: true } | { ok: false; reason: string } {
  const minWords = isGeminiFlashLiteModel(modelId)
    ? geminiGracefulMinWords(modelId, storyLength)
    : undefined;
  return validateStoryScript(script, storyLength, input.artist, input.title, {
    strictLength: false,
    skipWatery: false,
    skipReferenceAnchor: true,
    skipBannedPatterns: false,
    skipEnglishCheck: false,
    referenceFacts,
    minWordsOverride: minWords,
  });
}

function validateGeminiGracefulFallback(
  script: string,
  input: GenerateStoryInput,
  storyLength: StoryLengthId,
  referenceFacts: string[],
  modelId: string,
): { ok: true } | { ok: false; reason: string } {
  return validateStoryScript(script, storyLength, input.artist, input.title, {
    strictLength: false,
    skipWatery: false,
    skipReferenceAnchor: true,
    skipBannedPatterns: false,
    skipEnglishCheck: false,
    referenceFacts,
    minWordsOverride: geminiGracefulMinWords(modelId, storyLength),
  });
}

export function hasGeminiApiKey(clientKey?: string): boolean {
  return Boolean(clientKey?.trim() || process.env.GEMINI_API_KEY?.trim());
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
  let lastRejectReason: string | undefined;
  const geminiModelIndex = 0;
  const resolvedModel = resolveGeminiModel(input.geminiModel);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const retryDirective = buildRetryDirective(lastRejectReason, lengthPreset.wordsMin);
    const userPrompt = buildStoryUserPrompt({
      ...input,
      voiceId,
      storyLength,
      previousScripts,
      selectedReferenceFact: input.selectedReferenceFact,
      retryReason: retryDirective ?? undefined,
    });

    const result = await callGemini(
      systemPrompt,
      userPrompt,
      lengthPreset.maxTokens,
      input.geminiModel,
      geminiModelIndex,
      input.clientGeminiApiKey,
    );
    console.log(`[gemini] single-shot story model=${result.model} attempt=${attempt + 1}/${MAX_ATTEMPTS}`);
    const content = result.content;
    const story = parseStoryJson(content);
    if (!story) {
      throw new Error('Gemini returned invalid story JSON');
    }

    story.voiceId = voiceId;
    story.word_count = countWords(story.script);
    logStoryScript(`gemini attempt ${attempt + 1} raw`, story.script, `model=${result.model}`);

    const qOpts = qualityOptionsForAttempt(attempt, MAX_ATTEMPTS, referenceFacts);
    qOpts.skipReferenceAnchor = true;

    const quality = validateGeneratedStory(
      story.script,
      storyLength,
      input.artist,
      input.title,
      qOpts,
    );
    if (quality.ok) {
      const hard = validateGeminiHardQuality(
        story.script,
        input,
        storyLength,
        referenceFacts,
        result.model,
      );
      if (hard.ok) {
        const finalized = finalizeStory(story, { ...input, voiceId }, storyLength);
        logStoryScript('gemini accepted', finalized.script, `model=${result.model}`);
        return finalized;
      }
      lastCandidate = story;
      lastRejectReason = hard.reason;
      logRejectedScript('gemini hard-quality reject', story.script, hard.reason);
    } else {
      const sanitized = sanitizeScriptForTts(
        story.script,
        input.artist,
        input.title,
        referenceFacts,
      );
      const sanitizedQuality = validateGeneratedStory(
        sanitized,
        storyLength,
        input.artist,
        input.title,
        qOpts,
      );
      if (sanitizedQuality.ok) {
        const hard = validateGeminiHardQuality(
          sanitized,
          input,
          storyLength,
          referenceFacts,
          result.model,
        );
        if (hard.ok) {
          console.warn(`Gemini story sanitized (single-shot): ${quality.reason}`);
          const finalized = finalizeStory({ ...story, script: sanitized }, { ...input, voiceId }, storyLength);
          logStoryScript('gemini accepted (sanitized)', finalized.script, `model=${result.model}`);
          return finalized;
        }
        lastCandidate = { ...story, script: sanitized };
        lastRejectReason = hard.reason;
        logRejectedScript('gemini hard-quality reject (sanitized)', sanitized, hard.reason);
      } else {
        lastCandidate = { ...story, script: sanitized };
        lastRejectReason = sanitizedQuality.reason ?? quality.reason;
        logRejectedScript(
          'gemini quality reject',
          sanitized,
          lastRejectReason ?? 'quality',
        );
      }
    }
  }

  const fallback = finalizeAfterQualityLoop(
    lastCandidate,
    { artist: input.artist, title: input.title },
    (s) => finalizeStory(s, { ...input, voiceId }, storyLength),
    referenceFacts,
    { relaxForWeakLlm: true },
  );
  if (fallback) {
    const hard = validateGeminiHardQuality(
      fallback.script,
      input,
      storyLength,
      referenceFacts,
      resolvedModel,
    );
    if (hard.ok) {
      logStoryScript('gemini fallback accepted (hard)', fallback.script, `model=${resolvedModel}`);
      return fallback;
    }
    const graceful = validateGeminiGracefulFallback(
      fallback.script,
      input,
      storyLength,
      referenceFacts,
      resolvedModel,
    );
    if (graceful.ok) {
      console.warn(`Gemini fallback accepted by graceful-quality: ${hard.reason}`);
      logStoryScript('gemini fallback accepted (graceful)', fallback.script, `model=${resolvedModel}`);
      return fallback;
    }
    logRejectedScript(
      'gemini fallback rejected',
      fallback.script,
      `hard=${hard.reason}; graceful=${graceful.reason}`,
    );
    console.warn(
      `Gemini fallback rejected by hard+graceful quality: hard=${hard.reason}; graceful=${graceful.reason}`,
    );
  } else if (lastCandidate?.script) {
    logRejectedScript('gemini no fallback', lastCandidate.script, lastRejectReason ?? 'quality');
  }

  throw new Error('Could not produce a usable story');
}

function buildRetryDirective(reason: string | undefined, minWords: number): string | null {
  if (!reason) return null;
  const lower = reason.toLowerCase();
  const directives: string[] = [];
  if (lower.includes('english words') || lower.includes('english leak')) {
    directives.push('Только русский текст: переведи всю латиницу и английские термины.');
  }
  if (lower.includes('too short')) {
    directives.push(`Сделай не меньше ${minWords} слов без воды, добавь одну конкретную деталь из семени.`);
  }
  if (lower.includes('first sentence')) {
    directives.push('Первая фраза обязана сразу содержать якорь из seed-факта.');
  }
  if (lower.includes('ignores wikipedia') || lower.includes('reference')) {
    directives.push('Сохрани минимум два якоря из seed-факта (событие/место/персона/чарт).');
  }
  return directives.length > 0 ? directives.join(' ') : null;
}
