import { callOpenAiChatCompletion } from './llm-openai-chat.js';
import { validateLlmSeedCandidate } from './story-llm-fact-hunt.js';
import { FACT_HUNT_LLM_PROMPT_BLOCK } from './story-fact-hunt.js';
import type { DeepSearchMode, DeepSearchResult } from './deep-search-provider.js';
import { runDeepSearch } from './deep-search-provider.js';
import {
  heuristicExtractFactFromPage,
  validateScopedFact,
  validateWeeklyBulkScopedFact,
  type ScopedFactCandidate,
} from './fact-scope-validator.js';
import { interestScore } from './reference-fact-quality.js';
import { verifyDeepFactWithLlm } from './fact-deep-verify.js';

export interface DeepFactResult {
  fact: string;
  scope: 'track' | 'album' | 'artist';
  evidenceUrl: string;
  evidenceQuote: string;
  confidence: number;
  source: 'llm' | 'heuristic' | 'perplexity';
  searchMode: DeepSearchMode;
  searchLatencyMs: number;
  costUsd: number;
  allSources: Array<{ url: string; title: string }>;
}

function buildDeepFactHuntSystemPrompt(weeklyBulk = false): string {
  if (weeklyBulk) {
    return `Ты — исследователь музыкальных фактов для пополнения банка фактов.
Отвечай ТОЛЬКО валидным JSON.
Допустимы: смысл песни, вдохновение, цитата артиста, история записи, необычный факт из songfacts/wikipedia/interview.
НЕ нужны: только дата релиза, «вошла в альбом X», playcount, длительность.
scope="track" — факт про ЭТОТ трек.
evidenceQuote — дословная цитата из snippet.

Формат успеха:
{"fact":"русское предложение 35+ символов","scope":"track"|"album"|"artist","evidenceSnippetIndex":0,"evidenceQuote":"..."}
Формат отказа:
{"reject":true,"reason":"..."}`;
  }
  return `Ты — исследователь музыкальных фактов с доступом к ПОЛНЫМ текстам статей и интервью.
Отвечай ТОЛЬКО валидным JSON.
${FACT_HUNT_LLM_PROMPT_BLOCK}

КРИТИЧНО:
- scope="track" — факт про ЭТОТ трек (смысл, вдохновение, цитата артиста про песню).
- scope="artist" — только биография группы; НЕ используй для истории про конкретный трек.
- НЕ пиши «трек родился из школьной дружбы», если источник говорит только о formation группы.
- evidenceQuote — дословная цитата из snippet (английский оригинал допустим).

Формат успеха:
{"fact":"русское предложение 35+ символов","scope":"track"|"album"|"artist","evidenceSnippetIndex":0,"evidenceQuote":"..."}
Формат отказа:
{"reject":true,"reason":"..."}`;
}

async function extractFactWithLlm(
  artist: string,
  title: string,
  rawSnippets: string[],
  openRouterKey: string,
  model: string,
  weeklyBulk = false,
): Promise<ScopedFactCandidate | null> {
  const numbered = rawSnippets.map((s, i) => `${i}. ${s}`).join('\n');
  const userPrompt = `Артист: ${artist}
Трек: ${title}

SNIPPETS (полные тексты статей):
${numbered}

Найди ОДИН интересный факт про ЭТОТ трек. Предпочитай интервью (NPR, Pitchfork, Genius).`;

  try {
    const raw = await callOpenAiChatCompletion({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: openRouterKey,
      model,
      systemPrompt: buildDeepFactHuntSystemPrompt(weeklyBulk),
      userPrompt,
      maxTokens: 600,
      temperature: 0.35,
      extraHeaders: {
        'HTTP-Referer': 'https://efir-ai.ru',
        'X-Title': 'Music Story Deep Search',
      },
      label: 'deep-fact-hunt',
      timeoutMs: 45000,
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      fact?: string;
      scope?: 'track' | 'album' | 'artist';
      evidenceSnippetIndex?: number;
      evidenceQuote?: string;
      reject?: boolean;
    };
    if (parsed.reject) {
      console.warn(`[deep-fact] llm extract reject: ${(parsed as { reason?: string }).reason ?? 'unknown'}`);
      return null;
    }

    const validated = validateLlmSeedCandidate(parsed, rawSnippets, artist, title);
    if (!validated.ok) {
      console.warn(`[deep-fact] llm extract invalid: ${validated.reason ?? 'validation failed'}`);
      return null;
    }

    const snippet = rawSnippets[validated.snippetIndex] ?? '';
    const urlMatch = snippet.match(/\[(https?:\/\/[^\]]+)\]/);
    const evidenceUrl = urlMatch?.[1] ?? 'unknown';

    return {
      fact: validated.fact,
      scope: validated.scope,
      evidenceUrl,
      evidenceQuote: parsed.evidenceQuote?.trim() ?? validated.fact.slice(0, 120),
      confidence: 0.85,
      source: 'llm',
    };
  } catch (err) {
    console.warn(`[deep-fact] llm fail: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export async function huntDeepFact(params: {
  artist: string;
  title: string;
  mode: DeepSearchMode;
  openRouterApiKey?: string;
  openRouterModel?: string;
  tavilyApiKey?: string;
  perplexityApiKey?: string;
  /** Weekly bulk: LLM extract + scope check only (skip heuristic junk + double verify). */
  weeklyBulk?: boolean;
}): Promise<DeepFactResult | null> {
  const search = await runDeepSearch({
    artist: params.artist,
    title: params.title,
    mode: params.mode,
    tavilyApiKey: params.tavilyApiKey,
    perplexityApiKey: params.perplexityApiKey,
  });

  if (search.error && search.rawSnippets.length === 0) {
    console.warn(`[deep-fact] search error: ${search.error}`);
    return null;
  }

  let candidate: ScopedFactCandidate | null = null;
  let llmCost = 0;
  const pageTextByUrl = new Map(search.pages.map((p) => [p.url, p.text]));

  if (params.openRouterApiKey && search.rawSnippets.length >= (search.pages.length > 0 ? 1 : 2)) {
    const model = params.openRouterModel ?? 'deepseek/deepseek-chat-v3-0324';
    const llmCandidate = await extractFactWithLlm(
      params.artist,
      params.title,
      search.rawSnippets,
      params.openRouterApiKey,
      model,
      params.weeklyBulk === true,
    );
    llmCost = 0.003;
    if (llmCandidate) {
      const pageText =
        pageTextByUrl.get(llmCandidate.evidenceUrl) ?? search.rawSnippets.join('\n');
      const scopeOk = params.weeklyBulk
        ? validateWeeklyBulkScopedFact(llmCandidate, params.artist, params.title, pageText)
        : validateScopedFact(llmCandidate, params.artist, params.title, pageText);
      if (scopeOk.ok) {
        if (params.weeklyBulk) {
          candidate = llmCandidate;
          console.log(`[deep-fact] weekly llm ok scope=${llmCandidate.scope}`);
        } else if (params.openRouterApiKey) {
          const verified = await verifyDeepFactWithLlm(
            {
              artist: params.artist,
              title: params.title,
              fact: llmCandidate.fact,
              scope: llmCandidate.scope,
              evidenceUrl: llmCandidate.evidenceUrl,
              evidenceQuote: llmCandidate.evidenceQuote,
              pageText,
            },
            params.openRouterApiKey,
            model,
          );
          llmCost += 0.002;
          if (verified.verified) {
            candidate = llmCandidate;
            if (verified.factRu && verified.factRu.length >= 35) {
              candidate = { ...llmCandidate, fact: verified.factRu };
            }
            console.log(`[deep-fact] llm+verify ok reason=${verified.reason}`);
          } else {
            console.warn(`[deep-fact] llm verify reject: ${verified.reason}`);
          }
        }
      }
    } else {
      console.warn('[deep-fact] llm extract: no candidate from snippets');
    }
  }

  if (!candidate && params.weeklyBulk) {
    for (const page of search.pages) {
      if (!/songfacts\.com|wikipedia\.org/.test(page.url)) continue;
      const h = heuristicExtractFactFromPage(page, params.artist, params.title);
      if (!h) continue;
      const pageText = pageTextByUrl.get(h.evidenceUrl) ?? page.text;
      const check = validateWeeklyBulkScopedFact(h, params.artist, params.title, pageText);
      if (!check.ok) continue;
      candidate = h;
      console.log(`[deep-fact] weekly heuristic ok (${page.url.slice(0, 60)})`);
      break;
    }
  }

  if (!candidate && !params.weeklyBulk) {
    const heuristicCandidates: ScopedFactCandidate[] = [];
    for (const page of search.pages) {
      if (page.url.startsWith('perplexity:')) continue;
      const h = heuristicExtractFactFromPage(page, params.artist, params.title);
      if (h) heuristicCandidates.push(h);
    }
    heuristicCandidates.sort((a, b) => b.confidence - a.confidence);
    for (const h of heuristicCandidates) {
      const pageText =
        pageTextByUrl.get(h.evidenceUrl) ?? search.rawSnippets.join('\n');
      const check = validateScopedFact(h, params.artist, params.title, pageText);
      if (!check.ok) continue;
      if (params.openRouterApiKey) {
        const verified = await verifyDeepFactWithLlm(
          {
            artist: params.artist,
            title: params.title,
            fact: h.fact,
            scope: h.scope,
            evidenceUrl: h.evidenceUrl,
            evidenceQuote: h.evidenceQuote,
            pageText,
          },
          params.openRouterApiKey,
          params.openRouterModel ?? 'deepseek/deepseek-chat-v3-0324',
        );
        llmCost += 0.002;
        if (!verified.verified) {
          console.warn(`[deep-fact] heuristic verify reject: ${verified.reason}`);
          continue;
        }
        candidate = verified.factRu && verified.factRu.length >= 35 ? { ...h, fact: verified.factRu } : h;
        console.log(`[deep-fact] heuristic+verify ok`);
        break;
      }
      candidate = h;
      break;
    }
  }

  if (!candidate) return null;

  const pageText =
    pageTextByUrl.get(candidate.evidenceUrl) ?? search.rawSnippets.join('\n');

  return {
    fact: candidate.fact,
    scope: candidate.scope,
    evidenceUrl: candidate.evidenceUrl,
    evidenceQuote: candidate.evidenceQuote,
    confidence: candidate.confidence,
    source: candidate.source as DeepFactResult['source'],
    searchMode: params.mode,
    searchLatencyMs: search.latencyMs,
    costUsd: search.costUsd + llmCost,
    allSources: search.hits.map((h) => ({ url: h.url, title: h.title })),
  };
}
