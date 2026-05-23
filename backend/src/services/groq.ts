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

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL_PRIMARY = 'llama-3.1-8b-instant';
const GROQ_MODEL_FALLBACK = 'llama-3.3-70b-versatile';
const GROQ_MODELS = [GROQ_MODEL_PRIMARY, GROQ_MODEL_FALLBACK];
const MAX_ATTEMPTS = 2;

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

async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

  let lastError: Error | null = null;

  for (const model of GROQ_MODELS) {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.72,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Groq returned empty content');
      return content;
    }

    const body = await response.text();
    lastError = new Error(`Groq API error ${response.status}: ${body}`);
    if (response.status === 429 && model !== GROQ_MODELS[GROQ_MODELS.length - 1]) {
      console.warn(`Groq model ${model} rate-limited, trying fallback`);
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error('Groq request failed');
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

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const userPrompt = buildStoryUserPrompt({
      ...input,
      voiceId,
      angle,
      storyLength,
      previousScripts,
      retryReason,
    });

    const content = await callGroq(systemPrompt, userPrompt, lengthPreset.maxTokens);
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
    );
    if (sanitizedQuality.ok) {
      console.warn(`Story sanitized after attempt ${attempt + 1}: ${quality.reason}`);
      return finalizeStory({ ...story, script: sanitized }, { ...input, voiceId }, storyLength);
    }

    retryReason = sanitizedQuality.reason ?? quality.reason;
    console.warn(`Story quality reject (attempt ${attempt + 1}): ${retryReason}`);
  }

  throw new Error(
    `Groq could not produce a usable story after ${MAX_ATTEMPTS} attempts${retryReason ? `: ${retryReason}` : ''}`,
  );
}
