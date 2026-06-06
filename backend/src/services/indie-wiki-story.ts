import fetch from 'node-fetch';
import type { LlmProviderId } from './llm-provider.js';
import { hasLlmKeyForProvider } from './llm-provider.js';
import { resolveGroqModelOrder } from './groq-models.js';
import { callOpenAiChatCompletion } from './llm-openai-chat.js';
import { resolveOpenRouterModel } from './openrouter-models.js';
import { resolveGeminiModel, DEFAULT_GEMINI_MODEL } from './gemini-models.js';
import { preserveMusicProperNames } from './tts-foreign-pronounce.js';
import { sanitizeScriptForTts } from './story-quality.js';
import { factMentionsArtist } from './fact-relevance.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function extractScriptFieldLoose(raw: string): string | null {
  const match = raw.match(/"script"\s*:\s*"((?:[^"\\]|\\.)*)/s);
  if (!match?.[1]) return null;
  return match[1]
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .trim();
}

function parseJsonScript(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const data = JSON.parse(match[0]) as { script?: string };
      const script = data.script?.trim();
      if (script) return script;
    } catch {
      // loose extract below
    }
  }
  return extractScriptFieldLoose(trimmed);
}

async function callGroqTranslate(
  system: string,
  user: string,
  clientKey?: string,
  jsonMode = true,
): Promise<string> {
  const apiKey = clientKey?.trim() || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
  const model = resolveGroqModelOrder()[0] ?? 'llama-3.3-70b-versatile';
  const body: Record<string, unknown> = {
    model,
    temperature: 0.15,
    max_tokens: 900,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Groq translate ${response.status}: ${text.slice(0, 200)}`);
  const data = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq translate empty');
  return content;
}

async function callGeminiTranslate(system: string, user: string, clientKey?: string): Promise<string> {
  const apiKey = clientKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  const model = resolveGeminiModel(process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL);
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 900,
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Gemini translate ${response.status}: ${body.slice(0, 200)}`);
  const data = JSON.parse(body) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Gemini translate empty');
  return content;
}

async function callOpenRouterTranslate(
  system: string,
  user: string,
  model: string,
  clientKey?: string,
  useJsonMode = true,
): Promise<string> {
  return callOpenAiChatCompletion({
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: clientKey?.trim() || process.env.OPEN_ROUTER_API_KEY!.trim(),
    model,
    systemPrompt: system,
    userPrompt: user,
    maxTokens: 900,
    temperature: 0.15,
    useJsonMode,
    extraHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER?.trim() || 'https://music-story.app',
      'X-Title': 'Music Story',
    },
    label: 'OpenRouter-wiki',
  });
}

const TRANSLATE_SYSTEM = `Ты переводчик музыкальных биографий для озвучки на русском.
Переведи текст Wikipedia на русский для радио-рассказа.
ПРАВИЛА:
- Только факты из исходного текста. Ничего не добавляй и не выдумывай.
- Имена артистов, треков, лейблов — полностью, как в оригинале (латиницей). Måneskin, не «Må». Никогда не сокращай названия групп.
- Без «уникальный», «легенда», «магия музыки», без воды.
- Сохраняй все годы и даты из оригинала (2015, 7 декабря 2023 и т.п.) — не опускай числа.
- 55–95 слов, 2–4 предложения, связный рассказ.
- Если указан трек — упомяни его в конце одной фразой (только если уместно).
JSON: {"script":"..."}`;

export interface IndieWikiStoryInput {
  artist: string;
  title: string;
  wikiLead: string;
  wikiLang: 'en' | 'ru';
  llmProvider: LlmProviderId;
  clientGroqApiKey?: string;
  clientGeminiApiKey?: string;
  clientOpenRouterApiKey?: string;
  openRouterModel?: string;
}

function scriptFromRaw(raw: string, artist: string, title: string, wikiLead: string): string | null {
  const script = parseJsonScript(raw);
  if (!script || script.length < 40) return null;
  const fixed = preserveMusicProperNames(script, artist, title);
  if (!factMentionsArtist(fixed, artist)) return null;
  return sanitizeScriptForTts(fixed, artist, title, [wikiLead]);
}

/** Translate Wikipedia lead → Russian narration script (indie path). */
export async function translateWikiLeadToStory(input: IndieWikiStoryInput): Promise<string | null> {
  if (input.wikiLang === 'ru') {
    const cleaned = input.wikiLead.trim();
    if (factMentionsArtist(cleaned, input.artist) && cleaned.length >= 35) {
      return sanitizeScriptForTts(cleaned, input.artist, input.title, [cleaned]);
    }
  }

  const user = [
    `Артист: ${input.artist}`,
    `Трек (упомяни кратко если уместно): ${input.title}`,
    '',
    'ТЕКСТ WIKIPEDIA:',
    input.wikiLead,
  ].join('\n');

  const openRouterModel = resolveOpenRouterModel(input.openRouterModel, 'story');
  const attempts: Array<{ label: string; run: () => Promise<string> }> = [];

  if (hasLlmKeyForProvider('openrouter', { openrouter: input.clientOpenRouterApiKey })) {
    attempts.push({
      label: `openrouter:${openRouterModel}`,
      run: () =>
        callOpenRouterTranslate(
          TRANSLATE_SYSTEM,
          user,
          openRouterModel,
          input.clientOpenRouterApiKey,
          true,
        ),
    });
    attempts.push({
      label: `openrouter:${openRouterModel}:plain`,
      run: () =>
        callOpenRouterTranslate(
          TRANSLATE_SYSTEM,
          user,
          openRouterModel,
          input.clientOpenRouterApiKey,
          false,
        ),
    });
  }
  if (process.env.GROQ_API_KEY?.trim() || input.clientGroqApiKey?.trim()) {
    attempts.push({
      label: 'groq',
      run: () => callGroqTranslate(TRANSLATE_SYSTEM, user, input.clientGroqApiKey, true),
    });
    attempts.push({
      label: 'groq:plain',
      run: () => callGroqTranslate(TRANSLATE_SYSTEM, user, input.clientGroqApiKey, false),
    });
  }
  if (hasLlmKeyForProvider('gemini', { gemini: input.clientGeminiApiKey })) {
    attempts.push({
      label: 'gemini',
      run: () => callGeminiTranslate(TRANSLATE_SYSTEM, user, input.clientGeminiApiKey),
    });
  }

  for (const attempt of attempts) {
    try {
      const raw = await attempt.run();
      const script = scriptFromRaw(raw, input.artist, input.title, input.wikiLead);
      if (script) {
        console.log(`[indie-wiki] translate ok via ${attempt.label} words=${script.split(/\s+/).length}`);
        return script;
      }
      console.warn(`[indie-wiki] translate ${attempt.label}: empty or invalid JSON`);
    } catch (err) {
      console.warn(
        `[indie-wiki] translate ${attempt.label} failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return null;
}
