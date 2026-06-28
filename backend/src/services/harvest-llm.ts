import fetch from '../proxy-fetch.js';
import { DEFAULT_GEMINI_MODEL, resolveGeminiModel } from './gemini-models.js';
import { resolveOpenRouterModel } from './openrouter-models.js';
import { callOpenAiChatCompletion } from './llm-openai-chat.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface HarvestLlmRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface HarvestLlmResult {
  parsed: Record<string, unknown>;
  provider: string;
  model: string;
  latencyMs: number;
}

function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function hasOpenRouterKey(): boolean {
  return Boolean(process.env.OPEN_ROUTER_API_KEY?.trim());
}

function hasGroqKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

async function callGeminiHarvest(req: HarvestLlmRequest): Promise<HarvestLlmResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');
  const model = resolveGeminiModel(
    process.env.GEMINI_FACT_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
  );
  const maxTokens = Math.min(Math.max(req.maxTokens ?? 4096, 256), 8192);
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: 0.12,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${raw.slice(0, 400)}`);
  const data = JSON.parse(raw) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Gemini empty');
  return {
    parsed: JSON.parse(content) as Record<string, unknown>,
    provider: 'gemini',
    model,
    latencyMs: Date.now() - t0,
  };
}

async function callOpenRouterHarvest(req: HarvestLlmRequest): Promise<HarvestLlmResult> {
  const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPEN_ROUTER_API_KEY missing');
  const model = resolveOpenRouterModel(process.env.OPENROUTER_FACT_MODEL, 'fact');
  const t0 = Date.now();
  const content = await callOpenAiChatCompletion({
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey,
    model,
    systemPrompt: req.system,
    userPrompt: req.user,
    maxTokens: req.maxTokens ?? 4096,
    temperature: 0.12,
    useJsonMode: true,
    extraHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER?.trim() || 'https://efir-ai.ru',
      'X-Title': 'Music Story Harvest',
    },
    label: 'OpenRouter harvest',
  });
  return {
    parsed: JSON.parse(content) as Record<string, unknown>,
    provider: 'openrouter',
    model,
    latencyMs: Date.now() - t0,
  };
}

async function callGroqHarvest(req: HarvestLlmRequest): Promise<HarvestLlmResult> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error('GROQ_API_KEY missing');
  const model =
    process.env.GROQ_FACT_MODEL?.trim() ||
    process.env.GROQ_MODEL?.trim() ||
    'llama-3.1-8b-instant';
  const t0 = Date.now();
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.12,
      max_tokens: req.maxTokens ?? 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Groq ${res.status}: ${raw.slice(0, 400)}`);
  const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq empty');
  return {
    parsed: JSON.parse(content) as Record<string, unknown>,
    provider: 'groq',
    model,
    latencyMs: Date.now() - t0,
  };
}

/** Harvest fact LLM on Railway — Gemini → OpenRouter → Groq (server keys, not local quota). */
export async function harvestLlmJson(req: HarvestLlmRequest): Promise<HarvestLlmResult> {
  const chain: Array<{ name: string; fn: () => Promise<HarvestLlmResult>; ok: boolean }> = [
    { name: 'gemini', fn: () => callGeminiHarvest(req), ok: hasGeminiKey() },
    { name: 'openrouter', fn: () => callOpenRouterHarvest(req), ok: hasOpenRouterKey() },
    { name: 'groq', fn: () => callGroqHarvest(req), ok: hasGroqKey() },
  ];
  let lastErr: Error | null = null;
  for (const step of chain.filter((s) => s.ok)) {
    try {
      const out = await step.fn();
      console.log(`[harvest-llm] ok provider=${out.provider} model=${out.model} ${out.latencyMs}ms`);
      return out;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`[harvest-llm] ${step.name} failed: ${lastErr.message.slice(0, 160)}`);
    }
  }
  throw lastErr ?? new Error('harvest LLM: no provider configured');
}
