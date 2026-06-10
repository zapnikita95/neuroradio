import fetch from '../proxy-fetch.js';

/** As seen from BFF host (same PC as start-local-bff.bat). Override via env or app body. */
export const DEFAULT_LOCAL_OLLAMA_BASE_URL = 'http://127.0.0.1:11435';
export const DEFAULT_LOCAL_OLLAMA_MODEL = 'qwen3.6:35b-a3b-q4_K_M';

export class LocalOllamaError extends Error {
  readonly status: number;
  readonly bodySnippet: string;

  constructor(status: number, bodySnippet: string) {
    super(`Ollama error ${status}: ${bodySnippet.slice(0, 200)}`);
    this.name = 'LocalOllamaError';
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

export function resolveLocalOllamaBaseUrl(override?: string): string {
  const raw =
    override?.trim() ||
    process.env.LOCAL_OLLAMA_BASE_URL?.trim() ||
    DEFAULT_LOCAL_OLLAMA_BASE_URL;
  return raw.replace(/\/+$/, '');
}

export function resolveLocalOllamaModel(override?: string): string {
  return (
    override?.trim() ||
    process.env.LOCAL_OLLAMA_MODEL?.trim() ||
    DEFAULT_LOCAL_OLLAMA_MODEL
  );
}

function isLoopbackOllamaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

function isProductionHost(): boolean {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT?.trim() ||
      process.env.RAILWAY_PROJECT_ID?.trim() ||
      process.env.NODE_ENV === 'production',
  );
}

/** Local Ollama is only available when the URL is reachable from this host (not 127.0.0.1 on Railway). */
export function hasLocalOllamaConfigured(baseUrlOverride?: string): boolean {
  const url = resolveLocalOllamaBaseUrl(baseUrlOverride);
  if (!url) return false;
  if (isLoopbackOllamaUrl(url) && isProductionHost()) return false;
  return true;
}

export async function checkOllamaHealth(baseUrl: string): Promise<{
  ok: boolean;
  models: string[];
  message: string;
}> {
  const url = `${resolveLocalOllamaBaseUrl(baseUrl)}/api/tags`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, models: [], message: `HTTP ${response.status}: ${body.slice(0, 120)}` };
    }
    const data = (await response.json()) as {
      models?: Array<{ name?: string; model?: string }>;
    };
    const models = (data.models ?? [])
      .map((m) => m.name ?? m.model ?? '')
      .filter(Boolean);
    return { ok: true, models, message: `Ollama OK, ${models.length} models` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, models: [], message: msg };
  }
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chatOllama(params: {
  baseUrl: string;
  model: string;
  messages: OllamaMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}): Promise<string> {
  const {
    baseUrl,
    model,
    messages,
    maxTokens = 2048,
    temperature = 0.45,
    jsonMode = false,
    timeoutMs = 120000,
  } = params;

  const url = `${resolveLocalOllamaBaseUrl(baseUrl)}/api/chat`;
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    think: false,
    options: {
      temperature,
      num_predict: maxTokens,
    },
  };
  if (jsonMode) body.format = 'json';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    throw new LocalOllamaError(response.status, rawBody);
  }

  const data = JSON.parse(rawBody) as { message?: { content?: string; thinking?: string } };
  let content = data.message?.content?.trim();
  if (!content && data.message?.thinking?.trim()) {
    content = data.message.thinking.trim();
  }
  if (!content) throw new Error('Ollama returned empty content');
  return content;
}

export async function testOllamaChat(baseUrl: string, model: string): Promise<string> {
  const content = await chatOllama({
    baseUrl,
    model,
    messages: [{ role: 'user', content: 'Ответь одним словом: ок' }],
    maxTokens: 16,
    temperature: 0.1,
    jsonMode: false,
    timeoutMs: 60000,
  });
  return content.slice(0, 80);
}
