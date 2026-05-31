import fetch from 'node-fetch';
import type { LlmProviderId } from './llm-provider.js';
import { hasLlmKeyForProvider } from './llm-provider.js';
import { resolveGroqModelOrder } from './groq-models.js';
import { callOpenAiChatCompletion } from './llm-openai-chat.js';
import { resolveOpenRouterModel } from './openrouter-models.js';
import { resolveGeminiModel, DEFAULT_GEMINI_MODEL } from './gemini-models.js';
import { sanitizeScriptForTts } from './story-quality.js';
import { factMentionsArtist } from './fact-relevance.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function parseJsonScript(raw: string): string | null {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[0]) as { script?: string };
    return data.script?.trim() ?? null;
  } catch {
    return null;
  }
}

async function callGroqTranslate(
  system: string,
  user: string,
  clientKey?: string,
): Promise<string> {
  const apiKey = clientKey?.trim() || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
  const model = resolveGroqModelOrder()[0] ?? 'llama-3.3-70b-versatile';
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Groq translate ${response.status}: ${body.slice(0, 200)}`);
  const data = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> };
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
    signal: AbortSignal.timeout(45000),
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

const TRANSLATE_SYSTEM = `Ты переводчик музыкальных биографий для озвучки на русском.
Переведи текст Wikipedia на русский для радио-рассказа.
ПРАВИЛА:
- Только факты из исходного текста. Ничего не добавляй и не выдумывай.
- Имена артистов, треков, лейблов, баттлов — как в оригинале (латиницей где было).
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

  const provider = input.llmProvider;
  let raw: string;
  if (provider === 'gemini' && hasLlmKeyForProvider('gemini', { gemini: input.clientGeminiApiKey })) {
    raw = await callGeminiTranslate(TRANSLATE_SYSTEM, user, input.clientGeminiApiKey);
  } else if (
    provider === 'openrouter' &&
    hasLlmKeyForProvider('openrouter', { openrouter: input.clientOpenRouterApiKey })
  ) {
    raw = await callOpenAiChatCompletion({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: input.clientOpenRouterApiKey?.trim() || process.env.OPEN_ROUTER_API_KEY!.trim(),
      model: resolveOpenRouterModel(input.openRouterModel, 'story'),
      systemPrompt: TRANSLATE_SYSTEM,
      userPrompt: user,
      maxTokens: 900,
      temperature: 0.15,
      useJsonMode: true,
      extraHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER?.trim() || 'https://music-story.app',
        'X-Title': 'Music Story',
      },
      label: 'OpenRouter',
    });
  } else {
    raw = await callGroqTranslate(TRANSLATE_SYSTEM, user, input.clientGroqApiKey);
  }

  const script = parseJsonScript(raw);
  if (!script) return null;
  if (!factMentionsArtist(script, input.artist)) return null;
  return sanitizeScriptForTts(script, input.artist, input.title, [input.wikiLead]);
}
