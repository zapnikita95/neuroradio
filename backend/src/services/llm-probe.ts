import fetch from '../proxy-fetch.js';
import {
  clientKeyForProvider,
  hasLlmKeyForProvider,
  resolveLlmProvider,
  type ClientLlmKeys,
  type LlmProviderId,
} from './llm-provider.js';
import { resolveGroqModelOrder } from './groq-models.js';
import { resolveGeminiModel } from './gemini-models.js';
import { resolveOpenRouterModel } from './openrouter-models.js';

export interface LlmProbeInput {
  provider: LlmProviderId;
  model?: string;
  clientKeys: ClientLlmKeys;
}

export interface LlmProbeResult {
  ok: boolean;
  message: string;
  httpStatus?: number;
}

function resolveApiKey(provider: LlmProviderId, clientKeys: ClientLlmKeys): string | null {
  const client = clientKeyForProvider(provider, clientKeys);
  if (provider === 'groq') {
    return client || process.env.GROQ_API_KEY?.trim() || null;
  }
  if (provider === 'gemini') {
    return client || process.env.GEMINI_API_KEY?.trim() || null;
  }
  if (provider === 'openrouter') {
    return client || process.env.OPEN_ROUTER_API_KEY?.trim() || null;
  }
  return null;
}

async function probeGroq(apiKey: string, model: string): Promise<LlmProbeResult> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'ok' }],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.text();
  if (response.ok) {
    return { ok: true, message: `Groq работает (${model}) — запрос с Railway` };
  }
  return {
    ok: false,
    httpStatus: response.status,
    message: formatProbeError('Groq', response.status, body),
  };
}

async function probeGemini(apiKey: string, model: string): Promise<LlmProbeResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'ok' }] }],
      generationConfig: { maxOutputTokens: 8 },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.text();
  if (response.ok) {
    return { ok: true, message: `Gemini работает (${model}) — запрос с Railway` };
  }
  return {
    ok: false,
    httpStatus: response.status,
    message: formatProbeError('Gemini', response.status, body),
  };
}

async function probeOpenRouter(apiKey: string, model: string): Promise<LlmProbeResult> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://music-story.app',
      'X-Title': 'Music Story',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'ok' }],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.text();
  if (response.ok) {
    return { ok: true, message: `OpenRouter работает (${model}) — запрос с Railway` };
  }
  return {
    ok: false,
    httpStatus: response.status,
    message: formatProbeError('OpenRouter', response.status, body),
  };
}

function formatProbeError(label: string, status: number, body: string): string {
  if (status === 401) return `${label}: неверный API-ключ`;
  if (status === 403) return `${label}: доступ запрещён (проверь ключ)`;
  if (status === 429) return `${label}: лимит запросов — подожди минуту`;
  const snippet = body.replace(/\s+/g, ' ').slice(0, 120);
  return `${label}: HTTP ${status}${snippet ? ` — ${snippet}` : ''}`;
}

function resolveProbeModel(provider: LlmProviderId, model?: string): string {
  if (provider === 'groq') {
    return resolveGroqModelOrder(model)[0] ?? 'llama-3.3-70b-versatile';
  }
  if (provider === 'gemini') {
    return resolveGeminiModel(model);
  }
  return resolveOpenRouterModel(model, 'story') ?? 'qwen/qwen3-4b:free';
}

/** One minimal LLM call from BFF — keys used in-memory only, never logged or stored. */
export async function probeLlmProvider(input: LlmProbeInput): Promise<LlmProbeResult> {
  const provider = input.provider;
  if (provider === 'local') {
    return { ok: false, message: 'Для Ollama используй GET /health/ollama' };
  }
  if (!hasLlmKeyForProvider(provider, input.clientKeys)) {
    const label =
      provider === 'gemini' ? 'Gemini' : provider === 'openrouter' ? 'OpenRouter' : 'Groq';
    return {
      ok: false,
      message: `${label} не настроен — добавь ключ в приложении или на Railway`,
    };
  }

  const apiKey = resolveApiKey(provider, input.clientKeys);
  if (!apiKey) {
    return { ok: false, message: 'API-ключ не задан' };
  }

  const model = resolveProbeModel(provider, input.model?.trim());
  const usedOwnKey = Boolean(clientKeyForProvider(provider, input.clientKeys));

  let result: LlmProbeResult;
  if (provider === 'gemini') {
    result = await probeGemini(apiKey, model);
  } else if (provider === 'openrouter') {
    result = await probeOpenRouter(apiKey, model);
  } else {
    result = await probeGroq(apiKey, model);
  }

  if (result.ok && usedOwnKey) {
    result.message = `${result.message}. Свой ключ — без дневного лимита на сервере`;
  } else if (result.ok) {
    result.message = `${result.message}. Ключ сервера Railway`;
  }

  return result;
}

export function normalizeProbeProvider(raw: unknown): LlmProviderId | null {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'groq' || v === 'gemini' || v === 'openrouter' || v === 'local') return v;
  return null;
}

export { resolveLlmProvider };
