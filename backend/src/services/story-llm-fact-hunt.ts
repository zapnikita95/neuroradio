import fetch from 'node-fetch';
import { fuzzyTokenMatch } from './title-transliterate.js';
import type { SelectedReferenceFact } from './fact-picker.js';
import { factNamesForeignEntity, factMentionsArtist, factMentionsTitle, hasTrackContextSignal } from './fact-relevance.js';
import { interestScore, isBoringFact, MIN_PICK_INTEREST_SCORE, isWeakChartSeed } from './reference-fact-quality.js';
import { interestRating10 } from './fact-interest-log.js';
import { MIN_GOOD_SCOPE_INTEREST } from './fact-picker.js';
import { WEAK_TRIVIA_PATTERNS, FACT_HUNT_LLM_PROMPT_BLOCK } from './story-fact-hunt.js';
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
  /** Primary OpenRouter model id. */
  openRouterModel?: string;
  /** Tier fact-hunt fallback chain (Gemma :free → Nemotron). */
  openRouterModels?: string[];
}

interface LlmFactHuntJson {
  fact?: string;
  scope?: 'track' | 'album' | 'artist';
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
  if (env === 'openrouter' || env === 'groq' || env === 'gemini') return env;
  if (preferred === 'groq' || preferred === 'gemini' || preferred === 'openrouter') return preferred;
  if (hasLlmKeyForProvider('openrouter')) return 'openrouter';
  if (hasLlmKeyForProvider('gemini')) return 'gemini';
  if (hasLlmKeyForProvider('groq')) return 'groq';
  return 'openrouter';
}

export const FAST_SEED_INTEREST_SCORE = parseInt(process.env.FAST_SEED_INTEREST_SCORE ?? '7', 10);

export function shouldRunLlmFactHunt(
  selected: SelectedReferenceFact | null,
  rawSnippetCount: number,
  bundleFactCount: number,
  trackFactCount = 0,
  title = '',
  artist = '',
): boolean {
  if (rawSnippetCount < 2) return false;
  if (!selected) return true;
  if (bundleFactCount === 0) return true;
  if (selected.interestScore >= FAST_SEED_INTEREST_SCORE) {
    return false;
  }
  // No track-level facts — artist trivia is weak for a specific song; let LLM hunt from snippets.
  if (trackFactCount === 0 && selected.scope !== 'track') return true;
  // Track-scoped fact that never mentions the song title — wrong wiki chunk (e.g. band name origin).
  if (selected.scope === 'track' && title.trim() && !factMentionsTitle(selected.fact, title)) {
    return true;
  }
  if (selected.interestRating <= 5 || selected.interestScore < MIN_GOOD_SCOPE_INTEREST) return true;
  if (WEAK_TRIVIA_PATTERNS.some((p) => p.test(selected.fact))) return true;
  if (isWeakChartSeed(selected.fact)) return true;
  if (isBoringFact(selected.fact)) return true;
  if (interestScore(selected.fact) < MIN_PICK_INTEREST_SCORE + 2) return true;
  return false;
}

export function explainFactHuntDecision(
  selected: SelectedReferenceFact | null,
  rawSnippetCount: number,
  bundleFactCount: number,
  trackFactCount = 0,
  title = '',
): string {
  if (rawSnippetCount < 2) return 'snippets<2';
  if (!selected) return bundleFactCount === 0 ? 'no-facts' : 'no-selection-snippet-hunt';
  if (selected.interestScore >= FAST_SEED_INTEREST_SCORE) {
    return `fast-seed score=${selected.interestScore}`;
  }
  if (trackFactCount === 0 && selected.scope !== 'track') return 'no-track-facts';
  if (selected.scope === 'track' && title.trim() && !factMentionsTitle(selected.fact, title)) {
    return 'track-seed-without-title';
  }
  if (selected.interestRating <= 5 || selected.interestScore < MIN_GOOD_SCOPE_INTEREST) {
    return `low-interest score=${selected.interestScore}`;
  }
  if (WEAK_TRIVIA_PATTERNS.some((p) => p.test(selected.fact))) return 'weak-trivia';
  if (isWeakChartSeed(selected.fact)) return 'weak-chart';
  if (isBoringFact(selected.fact)) return 'boring';
  if (interestScore(selected.fact) < MIN_PICK_INTEREST_SCORE + 2) return 'low-score';
  return 'rules-seed-ok';
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
  const snippetTokens = significantTokens(snippet);
  const hits = quoteTokens.filter((qt) =>
    snippetTokens.some((st) => fuzzyTokenMatch(qt, st)) || snippetNorm.includes(qt),
  ).length;
  return hits >= Math.min(3, quoteTokens.length);
}

export function validateLlmSeedCandidate(
  parsed: LlmFactHuntJson,
  rawSnippets: string[],
  artist: string,
  title: string,
): { ok: true; fact: string; scope: 'track' | 'album' | 'artist'; snippetIndex: number } | { ok: false; reason: string } {
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
  if (interestScore(fact) < (hasTrackContextSignal(fact) ? 5 : MIN_PICK_INTEREST_SCORE)) {
    return {
      ok: false,
      reason: `low interest score (${interestScore(fact)} < ${hasTrackContextSignal(fact) ? 5 : MIN_PICK_INTEREST_SCORE})`,
    };
  }
  if (factNamesForeignEntity(fact, artist, title)) {
    return { ok: false, reason: 'foreign entity in fact' };
  }
  const artistNorm = normalize(artist);
  if (/[\u0400-\u04FF]/.test(artist) && !factMentionsArtist(fact, artist)) {
    const snippetHasArtist =
      /(?:цой|кино|tsoi)/i.test(snippet) && /(?:цой|tsoi)/i.test(fact);
    if (!snippetHasArtist) {
      return { ok: false, reason: 'fact does not mention requested artist' };
    }
  }
  // Grounding is via verified evidenceQuote in snippet; fact may be Russian translation.
  if (/расизм|дискриминац|равенств\w*\s+и\s+справедливост/i.test(fact) && !/racis|discriminat|equal|justice|равенств|расизм/i.test(snippet)) {
    return { ok: false, reason: 'invented social theme' };
  }
  const scope = parsed.scope === 'artist' ? 'artist' : parsed.scope === 'album' ? 'album' : 'track';
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
{"fact":"...","scope":"track"|"album"|"artist","evidenceSnippetIndex":0,"evidenceQuote":"..."}
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
    'fact',
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
    scopeLabelRu:
      validated.scope === 'track'
        ? 'трек'
        : validated.scope === 'album'
          ? 'альбом'
          : 'группа/артист',
    interestScore: interestScore(validated.fact),
    interestRating: interestRating10(validated.fact),
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

  const openRouterModels =
    primary === 'openrouter'
      ? [
          ...new Set(
            [
              ...(input.openRouterModels ?? []),
              input.openRouterModel,
            ].filter((m): m is string => Boolean(m?.trim())),
          ),
        ]
      : [];

  const attempts = primary === 'openrouter' && openRouterModels.length > 0 ? 1 : 2;

  for (const modelId of primary === 'openrouter' ? openRouterModels : [undefined]) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (!hasLlmKeyForProvider(primary)) break;
      try {
        const result = await huntWithProvider(
          primary,
          modelId ? { ...input, openRouterModel: modelId } : input,
          attempt > 0 ? lastReason : undefined,
        );
        if (result) return result;
        lastReason = 'validation failed';
      } catch (err) {
        lastReason = err instanceof Error ? err.message.slice(0, 120) : String(err);
        console.warn(
          `[fact-hunt-llm] ${primary}${modelId ? ` model=${modelId}` : ''} attempt ${attempt + 1}: ${lastReason}`,
        );
        if (/429|404|empty content/i.test(lastReason)) break;
      }
    }
  }

  return null;
}

interface MajorCatalogFactJson {
  fact?: string;
  scope?: 'track' | 'album' | 'artist';
  reject?: boolean;
  reason?: string;
}

/** Major catalog artist, all web/wiki sources dead — one widely documented fact (no snippet evidence). */
export async function huntMajorArtistCatalogFact(
  input: Omit<LlmFactHuntInput, 'rawSnippets'>,
): Promise<SelectedReferenceFact | null> {
  const primary = resolveFactHuntProvider(input.preferredProvider);
  if (!hasLlmKeyForProvider(primary)) return null;

  const system = `Ты — музыкальный исследователь. Артист из мирового каталога (major). Ответь ТОЛЬКО JSON.
Нужен ОДИН общеизвестный, проверяемый факт именно про указанный трек или его создание/запись/клип/значение.
Не выдумывай частные истории без опоры на публичную биографию. Не chart trivia («хит №1» без контекста).
Успех: {"fact":"...","scope":"track"|"album"|"artist"}
Отказ: {"reject":true,"reason":"..."}`;

  const user = [
    `Артист: ${input.artist}`,
    `Трек: ${input.title}`,
    input.year ? `Год (MusicBrainz): ${input.year}` : '',
    input.genre ? `Жанр: ${input.genre}` : '',
    '',
    'Верни один интересный факт на русском для озвучки радио-истории.',
  ]
    .filter(Boolean)
    .join('\n');

  const openRouterModels =
    primary === 'openrouter'
      ? [
          ...new Set(
            [
              ...(input.openRouterModels ?? []),
              input.openRouterModel,
            ].filter((m): m is string => Boolean(m?.trim())),
          ),
        ]
      : [];

  const models = primary === 'openrouter' && openRouterModels.length > 0 ? openRouterModels : [undefined];

  for (const modelId of models) {
    try {
      let raw = '';
      if (primary === 'openrouter') {
        raw = await callOpenRouterFactHunt(system, user, modelId!);
      } else if (primary === 'groq') {
        raw = await callGroqFactHunt(system, user);
      } else {
        raw = await callGeminiFactHunt(system, user);
      }
      const parsed = parseFactHuntJson(raw) as MajorCatalogFactJson | null;
      if (!parsed || parsed.reject) continue;
      const fact = parsed.fact?.trim();
      if (!fact || fact.length < 35) continue;
      if (WEAK_TRIVIA_PATTERNS.some((p) => p.test(fact))) continue;
      if (isBoringFact(fact)) continue;
      if (!factMentionsArtist(fact, input.artist)) continue;
      if (!factMentionsTitle(fact, input.title) && !hasTrackContextSignal(fact)) continue;
      if (interestScore(fact) < MIN_PICK_INTEREST_SCORE) continue;
      if (factNamesForeignEntity(fact, input.artist, input.title)) continue;
      const scope = parsed.scope === 'artist' ? 'artist' : parsed.scope === 'album' ? 'album' : 'track';
      console.log(`[fact-hunt-catalog] ok model=${modelId ?? primary} fact="${fact.slice(0, 90)}"`);
      return {
        fact,
        scope,
        scopeLabelRu: scope === 'track' ? 'трек' : scope === 'album' ? 'альбом' : 'группа/артист',
        interestScore: interestScore(fact),
        interestRating: interestRating10(fact),
      };
    } catch (err) {
      console.warn(
        `[fact-hunt-catalog] ${primary}${modelId ? ` model=${modelId}` : ''}: ${err instanceof Error ? err.message.slice(0, 100) : err}`,
      );
    }
  }
  return null;
}

export function explainLlmFactSelection(selected: SelectedReferenceFact): string {
  return `scope=${selected.scope}, interestScore=${selected.interestScore}, interest=${selected.interestRating}/10, source=llm-fact-hunt, backstory=${/letter|apolog|family|mother|father|daughter|son|wife|husband|письм|извин|семь/i.test(selected.fact)}`;
}
