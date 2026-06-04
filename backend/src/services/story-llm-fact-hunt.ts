import fetch from 'node-fetch';
import type { SelectedReferenceFact } from './fact-picker.js';
import { factNamesForeignEntity } from './fact-relevance.js';
import { interestScore, isBoringFact, MIN_PICK_INTEREST_SCORE } from './reference-fact-quality.js';
import { WEAK_TRIVIA_PATTERNS } from './story-fact-hunt.js';
import { FACT_HUNT_LLM_PROMPT_BLOCK } from './story-fact-hunt.js';
import { resolveGroqModelOrder } from './groq-models.js';
import { resolveGeminiModel, DEFAULT_GEMINI_MODEL } from './gemini-models.js';
import { GroqApiError } from './groq.js';
import { callOpenAiChatCompletion } from './llm-openai-chat.js';
import { resolveOpenRouterModel } from './openrouter-models.js';
import type { LlmProviderId } from './llm-provider.js';
import { hasLlmKeyForProvider } from './llm-provider.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export type FactHuntMode = 'empty_only' | 'weak_or_empty';

export interface LlmFactHuntInput {
  artist: string;
  title: string;
  year?: number;
  genre?: string;
  rawSnippets: string[];
  preferredProvider: LlmProviderId;
  /** Same model id as story generation (OpenRouter one-model-only). */
  openRouterModel?: string;
}

interface LlmFactHuntJson {
  fact?: string;
  scope?: 'track' | 'artist';
  evidenceSnippetIndex?: number;
  evidenceQuote?: string;
  reject?: boolean;
  reason?: string;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function significantTokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length >= 4);
}

export function resolveFactHuntMode(): FactHuntMode {
  const raw = process.env.LLM_FACT_HUNT_MODE?.trim().toLowerCase();
  return raw === 'empty_only' ? 'empty_only' : 'weak_or_empty';
}

export function resolveFactHuntProvider(preferred: LlmProviderId): LlmProviderId {
  const env = process.env.LLM_FACT_PROVIDER?.trim().toLowerCase();
  if (env === 'groq' || env === 'gemini' || env === 'openrouter') return env;
  if (preferred !== 'local') return preferred;
  if (hasLlmKeyForProvider('groq')) return 'groq';
  if (hasLlmKeyForProvider('gemini')) return 'gemini';
  if (hasLlmKeyForProvider('openrouter')) return 'openrouter';
  return 'groq';
}

export function shouldRunLlmFactHunt(
  selected: SelectedReferenceFact | null,
  rawSnippetCount: number,
  bundleFactCount: number,
): boolean {
  // Fact-hunt is a separate LLM call — disabled; snippets go into the single story prompt.
  void selected;
  void rawSnippetCount;
  void bundleFactCount;
  return false;
}

/** Evidence quote must appear in snippet (fuzzy: 3+ shared tokens of length >= 4). */
export function verifyLlmSeedEvidence(
  evidenceQuote: string,
  snippet: string,
): boolean {
  const quoteNorm = normalize(evidenceQuote);
  const snippetNorm = normalize(snippet);
  if (quoteNorm.length < 8) return false;
  if (snippetNorm.includes(quoteNorm)) return true;
  const quoteTokens = significantTokens(evidenceQuote);
  if (quoteTokens.length === 0) return false;
  const hits = quoteTokens.filter((t) => snippetNorm.includes(t)).length;
  return hits >= Math.min(3, quoteTokens.length);
}

export function validateLlmSeedCandidate(
  parsed: LlmFactHuntJson,
  rawSnippets: string[],
  artist: string,
  title: string,
): { ok: true; fact: string; scope: 'track' | 'artist'; snippetIndex: number } | { ok: false; reason: string } {
  if (parsed.reject) {
    return { ok: false, reason: parsed.reason ?? 'llm rejected — no fact in snippets' };
  }
  const fact = parsed.fact?.trim();
  if (!fact || fact.length < 35) {
    return { ok: false, reason: 'empty or too short fact' };
  }
  const idx = parsed.evidenceSnippetIndex;
  if (idx === undefined || idx < 0 || idx >= rawSnippets.length) {
    return { ok: false, reason: 'invalid evidenceSnippetIndex' };
  }
  const quote = parsed.evidenceQuote?.trim() ?? '';
  const snippet = rawSnippets[idx] ?? '';
  if (!verifyLlmSeedEvidence(quote, snippet)) {
    return { ok: false, reason: 'evidenceQuote not grounded in snippet' };
  }
  if (WEAK_TRIVIA_PATTERNS.some((p) => p.test(fact))) {
    return { ok: false, reason: 'weak trivia fact (chart/hit/metrics)' };
  }
  if (isBoringFact(fact)) {
    return { ok: false, reason: 'boring encyclopedia fact' };
  }
  if (interestScore(fact) < MIN_PICK_INTEREST_SCORE) {
    return { ok: false, reason: `low interest score (${interestScore(fact)} < ${MIN_PICK_INTEREST_SCORE})` };
  }
  if (factNamesForeignEntity(fact, artist, title)) {
    return { ok: false, reason: 'foreign entity in fact' };
  }
  // Grounding is via verified evidenceQuote in snippet; fact may be Russian translation.
  if (/расизм|дискриминац|равенств\w*\s+и\s+справедливост/i.test(fact) && !/racis|discriminat|equal|justice|равенств|расизм/i.test(snippet)) {
    return { ok: false, reason: 'invented social theme' };
  }
  const scope = parsed.scope === 'artist' ? 'artist' : 'track';
  return { ok: true, fact, scope, snippetIndex: idx };
}

function parseFactHuntJson(raw: string): LlmFactHuntJson | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as LlmFactHuntJson;
  } catch {
    return null;
  }
}

function buildFactHuntSystemPrompt(): string {
  return `Ты — исследователь музыкальных фактов. Отвечай ТОЛЬКО валидным JSON.
${FACT_HUNT_LLM_PROMPT_BLOCK}

Формат успеха:
{"fact":"...","scope":"track"|"artist","evidenceSnippetIndex":0,"evidenceQuote":"..."}
Формат отказа:
{"reject":true,"reason":"..."}`;
}

function buildFactHuntUserPrompt(input: LlmFactHuntInput, retryReason?: string): string {
  const lines = [
    `Артист: ${input.artist}`,
    `Трек: ${input.title}`,
  ];
  if (input.year) lines.push(`Год: ${input.year}`);
  if (input.genre) lines.push(`Жанр: ${input.genre}`);
  lines.push('', 'СНИППЕТЫ (выбери один для семени):');
  input.rawSnippets.forEach((s, i) => {
    lines.push(`${i}. ${s}`);
  });
  if (retryReason) {
    lines.push('', `ПРЕДЫДУЩАЯ ПОПЫТКА ОТКЛОНЕНА: ${retryReason}`);
  }
  return lines.join('\n');
}

async function callGroqFactHunt(system: string, user: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
  const model =
    process.env.GROQ_FACT_MODEL?.trim() ||
    resolveGroqModelOrder()[0] ||
    'llama-3.3-70b-versatile';

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.22,
      max_tokens: 512,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });
  const rawBody = await response.text();
  if (!response.ok) {
    throw new GroqApiError(response.status, rawBody.slice(0, 400));
  }
  const data = JSON.parse(rawBody) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq fact-hunt returned empty content');
  console.log(`[fact-hunt-llm] groq model=${model}`);
  return content;
}

async function callOpenRouterFactHunt(
  system: string,
  user: string,
  openRouterModel?: string,
): Promise<string> {
  const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPEN_ROUTER_API_KEY is not configured');
  const model = resolveOpenRouterModel(
    openRouterModel ?? process.env.OPENROUTER_FACT_MODEL,
    'story',
  );
  const content = await callOpenAiChatCompletion({
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey,
    model,
    systemPrompt: system,
    userPrompt: user,
    maxTokens: 512,
    temperature: 0.22,
    useJsonMode: true,
    extraHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER?.trim() || 'https://music-story.app',
      'X-Title': 'Music Story',
    },
    label: 'OpenRouter',
  });
  console.log(`[fact-hunt-llm] openrouter model=${model}`);
  return content;
}

async function callGeminiFactHunt(system: string, user: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  const model = resolveGeminiModel(process.env.GEMINI_FACT_MODEL?.trim() || DEFAULT_GEMINI_MODEL);
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.22,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(45000),
  });
  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini fact-hunt ${response.status}: ${rawBody.slice(0, 300)}`);
  }
  const data = JSON.parse(rawBody) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Gemini fact-hunt returned empty content');
  console.log(`[fact-hunt-llm] gemini model=${model}`);
  return content;
}

async function huntWithProvider(
  provider: LlmProviderId,
  input: LlmFactHuntInput,
  retryReason?: string,
): Promise<SelectedReferenceFact | null> {
  const system = buildFactHuntSystemPrompt();
  const user = buildFactHuntUserPrompt(input, retryReason);
  const raw =
    provider === 'gemini'
      ? await callGeminiFactHunt(system, user)
      : provider === 'openrouter'
        ? await callOpenRouterFactHunt(system, user, input.openRouterModel)
        : await callGroqFactHunt(system, user);

  const parsed = parseFactHuntJson(raw);
  if (!parsed) return null;

  const validated = validateLlmSeedCandidate(parsed, input.rawSnippets, input.artist, input.title);
  if (!validated.ok) {
    console.warn(`[fact-hunt-evidence] reject: ${validated.reason}`);
    return null;
  }

  const snippet = input.rawSnippets[validated.snippetIndex] ?? '';
  console.log(
    `[fact-hunt-evidence] ok snippet=${validated.snippetIndex} quote="${(parsed.evidenceQuote ?? '').slice(0, 80)}"`,
  );
  console.log(`[fact-hunt-evidence] snippet: ${snippet.slice(0, 160)}…`);

  return {
    fact: validated.fact,
    scope: validated.scope,
    scopeLabelRu: validated.scope === 'track' ? 'трек' : 'группа/артист',
  };
}

/**
 * Stage 1: LLM extracts a verified seed from rawSnippets only.
 * Returns null if snippets empty or hunt fails validation.
 */
export async function huntReferenceFactWithLlm(
  input: LlmFactHuntInput,
): Promise<SelectedReferenceFact | null> {
  if (input.rawSnippets.length === 0) return null;

  const primary = resolveFactHuntProvider(input.preferredProvider);
  let lastReason = 'unknown';

  for (let attempt = 0; attempt < 2; attempt++) {
    if (!hasLlmKeyForProvider(primary)) break;
    try {
      const result = await huntWithProvider(
        primary,
        input,
        attempt > 0 ? lastReason : undefined,
      );
      if (result) return result;
      lastReason = 'validation failed';
    } catch (err) {
      lastReason = err instanceof Error ? err.message.slice(0, 120) : String(err);
      console.warn(`[fact-hunt-llm] ${primary} attempt ${attempt + 1}: ${lastReason}`);
    }
  }

  return null;
}

export function explainLlmFactSelection(selected: SelectedReferenceFact): string {
  return `scope=${selected.scope}, interestScore=${interestScore(selected.fact)}, source=llm-fact-hunt, backstory=${/letter|apolog|family|mother|father|daughter|son|wife|husband|письм|извин|семь/i.test(selected.fact)}`;
}
