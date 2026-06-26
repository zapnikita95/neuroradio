import proxyFetch from '../proxy-fetch.js';
import { flattenDeepSearchQueries } from './deep-search-queries.js';
import {
  chunkPageText,
  extractPagesParallel,
  formatChunksWithProvenance,
  type ExtractedPage,
} from './page-content-extractor.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; MusicStoryDeepSearch/1.0; +https://efir-ai.ru)';

/** DDG often blocked on RU/datacenter IPs — use native fetch for search/discovery. */
async function directFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const prevHttp = process.env.HTTP_PROXY;
  const prevHttps = process.env.HTTPS_PROXY;
  const prevUse = process.env.NODE_USE_ENV_PROXY;
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.NODE_USE_ENV_PROXY;
  try {
    return await fetch(input, init);
  } finally {
    if (prevHttp) process.env.HTTP_PROXY = prevHttp;
    if (prevHttps) process.env.HTTPS_PROXY = prevHttps;
    if (prevUse) process.env.NODE_USE_ENV_PROXY = prevUse;
  }
}

/** Tavily/Perplexity/OpenRouter may need proxy in RU — keep proxyFetch for paid APIs. */
const fetch = proxyFetch;

export type DeepSearchMode = 'baseline_ddg' | 'ddg_jina' | 'tavily' | 'perplexity';

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  score?: number;
}

export interface DeepSearchResult {
  mode: DeepSearchMode;
  hits: SearchHit[];
  pages: ExtractedPage[];
  rawSnippets: string[];
  latencyMs: number;
  costUsd: number;
  error?: string;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const TRUSTED_DOMAINS = [
  'npr.org',
  'pitchfork.com',
  'rollingstone.com',
  'genius.com',
  'wikipedia.org',
  'theguardian.com',
  'billboard.com',
  'bbc.com',
  'rap.ru',
  'the-flow.ru',
];

export function scoreSearchHit(hit: SearchHit, artist: string, title: string): number {
  let score = hit.score ?? 0.5;
  const url = hit.url.toLowerCase();
  const text = `${hit.title} ${hit.snippet}`.toLowerCase();
  const titleTokens = title.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const artistTokens = artist.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);

  for (const d of TRUSTED_DOMAINS) {
    if (url.includes(d)) score += 0.25;
  }
  if (titleTokens.some((t) => text.includes(t))) score += 0.3;
  if (artistTokens.some((t) => text.includes(t))) score += 0.15;
  if (/interview|meaning|story behind|discusses|explains|интервью|смысл/i.test(text)) score += 0.2;
  if (/youtube\.com|tiktok\.com|lyrics\.com|azlyrics/i.test(url)) score -= 0.4;
  return score;
}

export async function searchDdgHtml(query: string, maxResults = 5): Promise<SearchHit[]> {
  try {
    const body = new URLSearchParams({ q: query.trim() });
    const response = await directFetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(18000),
    });
    if (!response.ok) return [];
    const html = await response.text();
    const titles =
      html.match(/class="result__a"[^>]*>([^<]+)<\/a>/g)?.map((m) => {
        const hit = m.match(/>([^<]+)<\/a>/);
        return decodeHtml(stripTags(hit?.[1] ?? ''));
      }) ?? [];
    const snippets =
      html.match(/class="result__snippet"[^>]*>\s*([^<]+)/g)?.map((m) => {
        const hit = m.match(/>\s*([^<]+)/);
        return decodeHtml(stripTags(hit?.[1] ?? '')).slice(0, 400);
      }) ?? [];
    const urls =
      html.match(/class="result__a"[^>]*href="(https?:\/\/[^"]+)"/g)?.map((m) => {
        const hit = m.match(/href="(https?:\/\/[^"]+)"/);
        let u = hit?.[1] ?? '';
        if (u.includes('uddg=')) {
          const decoded = u.match(/uddg=([^&]+)/);
          if (decoded?.[1]) u = decodeURIComponent(decoded[1]);
        }
        return u;
      }) ?? [];

    const count = Math.min(maxResults, Math.max(titles.length, urls.length));
    const hits: SearchHit[] = [];
    for (let i = 0; i < count; i++) {
      const url = urls[i] ?? '';
      if (!url.startsWith('http')) continue;
      hits.push({ url, title: titles[i] ?? '', snippet: snippets[i] ?? '' });
    }
    return hits;
  } catch (err) {
    console.warn(`[deep-search] ddg fail q="${query.slice(0, 50)}" err=${err instanceof Error ? err.message : err}`);
    return [];
  }
}

export async function searchTavily(
  query: string,
  apiKey: string,
  searchDepth: 'basic' | 'advanced' = 'advanced',
): Promise<{ hits: SearchHit[]; costUsd: number }> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: searchDepth,
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Tavily ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    results?: Array<{ url?: string; title?: string; content?: string; score?: number }>;
  };
  const hits: SearchHit[] = (data.results ?? [])
    .filter((r) => r.url?.startsWith('http'))
    .map((r) => ({
      url: r.url!,
      title: r.title ?? '',
      snippet: (r.content ?? '').slice(0, 400),
      score: r.score,
    }));
  const costUsd = searchDepth === 'advanced' ? 0.016 : 0.008;
  return { hits, costUsd };
}

export interface PerplexityCitation {
  url: string;
  title?: string;
}

export async function searchPerplexity(
  artist: string,
  title: string,
  apiKey: string,
  model = 'sonar-pro',
  searchContextSize: 'low' | 'medium' | 'high' = 'medium',
): Promise<{ answer: string; citations: PerplexityCitation[]; costUsd: number }> {
  const prompt = `Find specific interview facts about the song "${title}" by ${artist}. 
Distinguish track-specific facts from general band biography. 
Focus on: song meaning, inspiration, recording context, artist quotes about THIS song.
Do not conflate band formation/school friendship with this specific track unless the source explicitly links them.`;

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      web_search_options: { search_context_size: searchContextSize },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Perplexity ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
    usage?: { cost?: { total_cost?: number } };
  };
  const answer = data.choices?.[0]?.message?.content?.trim() ?? '';
  const citations: PerplexityCitation[] = (data.citations ?? []).map((url) => ({ url }));
  const requestFees: Record<string, number> = { low: 0.006, medium: 0.01, high: 0.014 };
  const costUsd = data.usage?.cost?.total_cost ?? requestFees[searchContextSize] ?? 0.01;
  return { answer, citations, costUsd };
}

const PRESS_URL_RE =
  /https?:\/\/(?:www\.)?(?:npr\.org|pitchfork\.com|rollingstone\.com|theguardian\.com|genius\.com|billboard\.com|bbc\.com|bbc\.co\.uk)[^\s)\]"']*/gi;

function isJunkPressUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('/about-npr/') ||
    lower.includes('/terms-of') ||
    lower.includes('/privacy') ||
    lower.includes('/cookie')
  );
}

function extractPressUrls(text: string): string[] {
  const found = text.match(PRESS_URL_RE) ?? [];
  return [...new Set(found.map((u) => u.replace(/[.,;]+$/, '')))].filter((u) => !isJunkPressUrl(u));
}

/** NPR site search via Jina Reader — finds interview URLs when DDG is blocked. */
export async function discoverViaNprSearch(artist: string, title: string): Promise<SearchHit[]> {
  const query = `${artist} ${title}`.trim();
  const searchUrl = `https://www.npr.org/search?query=${encodeURIComponent(query)}`;
  try {
    const response = await directFetch(`https://r.jina.ai/${searchUrl}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain' },
      signal: AbortSignal.timeout(22000),
    });
    if (!response.ok) return [];
    const text = await response.text();
    const urls = extractPressUrls(text).filter((u) => u.includes('npr.org/20'));
    const artistSlug = artist.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const artistWord = artist.split(/\s+/)[0]?.toLowerCase() ?? '';
    const filtered = urls.filter((u) => {
      const lower = u.toLowerCase();
      return lower.includes(artistSlug) || lower.includes(artistWord);
    });
    const finalUrls = (filtered.length > 0 ? filtered : urls).slice(0, 3);
    return finalUrls.map((url) => ({
      url,
      title: `NPR: ${artist} — ${title}`,
      snippet: text.slice(0, 300),
    }));
  } catch (err) {
    console.warn(`[deep-search] npr search fail err=${err instanceof Error ? err.message : err}`);
    return [];
  }
}

/** Genius search page via Jina — lyrics/meaning context. */
export async function discoverViaGeniusSearch(artist: string, title: string): Promise<SearchHit[]> {
  const query = `${artist} ${title}`.trim();
  const searchUrl = `https://genius.com/search?q=${encodeURIComponent(query)}`;
  try {
    const response = await directFetch(`https://r.jina.ai/${searchUrl}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return [];
    const text = await response.text();
    const urls = [...(text.match(/https:\/\/genius\.com\/[^\s)\]"']+/g) ?? [])]
      .filter((u) => u.includes('-lyrics') || u.includes('lyrics'))
      .slice(0, 2);
    return urls.map((url) => ({
      url: url.replace(/[.,;]+$/, ''),
      title: `Genius: ${title}`,
      snippet: '',
    }));
  } catch {
    return [];
  }
}

/** Wikipedia works when DDG is blocked (common on RU/datacenter IPs). */
export async function searchViaWikipedia(artist: string, title: string): Promise<SearchHit[]> {
  const queries = [
    `"${title}" ${artist} song`,
    `${title} ${artist}`,
    `${artist} band`,
  ];
  const hits: SearchHit[] = [];
  const seenTitles = new Set<string>();

  for (const q of queries) {
    try {
      const apiUrl =
        `https://en.wikipedia.org/w/api.php?action=query&list=search` +
        `&srsearch=${encodeURIComponent(q)}&srlimit=4&format=json&origin=*`;
      const response = await directFetch(apiUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as {
        query?: { search?: Array<{ title?: string; snippet?: string }> };
      };
      for (const item of data.query?.search ?? []) {
        const pageTitle = item.title?.trim();
        if (!pageTitle || seenTitles.has(pageTitle)) continue;
        seenTitles.add(pageTitle);
        const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`;
        hits.push({
          url: wikiUrl,
          title: pageTitle,
          snippet: (item.snippet ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        });
      }
    } catch (err) {
      console.warn(`[deep-search] wiki search fail q="${q.slice(0, 40)}" err=${err instanceof Error ? err.message : err}`);
    }
  }
  return hits;
}

async function collectSearchHits(artist: string, title: string): Promise<SearchHit[]> {
  const queries = flattenDeepSearchQueries(artist, title, 3);
  const all: SearchHit[] = [];

  for (const q of queries) {
    const hits = await searchDdgHtml(q, 3);
    all.push(...hits);
  }

  if (all.length < 2) {
    const wikiHits = await searchViaWikipedia(artist, title);
    all.push(...wikiHits);
    console.log(`[deep-search] wiki fallback hits=${wikiHits.length} (ddg=${all.length - wikiHits.length})`);
  }

  // NPR + Genius via Jina (free, works when DDG blocked)
  const nprHits = await discoverViaNprSearch(artist, title);
  if (nprHits.length > 0) {
    all.push(...nprHits);
    console.log(`[deep-search] npr hits=${nprHits.length}`);
  }
  const geniusHits = await discoverViaGeniusSearch(artist, title);
  if (geniusHits.length > 0) all.push(...geniusHits);

  const byUrl = new Map<string, SearchHit>();
  for (const h of all) {
    const prev = byUrl.get(h.url);
    if (!prev || scoreSearchHit(h, artist, title) > scoreSearchHit(prev, artist, title)) {
      byUrl.set(h.url, h);
    }
  }
  return [...byUrl.values()]
    .map((h) => ({ ...h, score: scoreSearchHit(h, artist, title) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 8);
}

async function collectDdgHits(artist: string, title: string): Promise<SearchHit[]> {
  return collectSearchHits(artist, title);
}

export async function runDeepSearch(params: {
  artist: string;
  title: string;
  mode: DeepSearchMode;
  maxPages?: number;
  tavilyApiKey?: string;
  perplexityApiKey?: string;
}): Promise<DeepSearchResult> {
  const { artist, title, mode } = params;
  const maxPages = params.maxPages ?? 3;
  const t0 = Date.now();
  let costUsd = 0;
  let hits: SearchHit[] = [];
  let pages: ExtractedPage[] = [];
  let error: string | undefined;

  try {
    if (mode === 'tavily') {
      if (!params.tavilyApiKey) throw new Error('TAVILY_API_KEY missing');
      const queries = flattenDeepSearchQueries(artist, title, 2);
      for (const q of queries) {
        const { hits: th, costUsd: c } = await searchTavily(q, params.tavilyApiKey, 'advanced');
        hits.push(...th);
        costUsd += c;
      }
    } else {
      hits = await collectDdgHits(artist, title);
    }

    hits = hits
      .map((h) => ({ ...h, score: scoreSearchHit(h, artist, title) }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    if (mode === 'ddg_jina' || mode === 'tavily' || mode === 'baseline_ddg') {
      const nprFirst = [...hits].sort((a, b) => {
        const aNpr = a.url.includes('npr.org') ? 1 : 0;
        const bNpr = b.url.includes('npr.org') ? 1 : 0;
        return bNpr - aNpr || (b.score ?? 0) - (a.score ?? 0);
      });
      const urls = nprFirst.slice(0, Math.max(maxPages, 3)).map((h) => h.url);
      if (urls.length > 0 && mode !== 'baseline_ddg') {
        pages = await extractPagesParallel(urls, 2);
        // Discover press URLs embedded in Wikipedia pages (NPR, Pitchfork, …)
        const pressUrls: string[] = [];
        for (const page of pages) {
          pressUrls.push(...extractPressUrls(page.text));
        }
        const newPress = pressUrls.filter((u) => !hits.some((h) => h.url === u)).slice(0, 2);
        if (newPress.length > 0) {
          const pressPages = await extractPagesParallel(newPress, 2);
          pages.push(...pressPages);
          for (const u of newPress) {
            hits.push({ url: u, title: 'Press link from Wikipedia', snippet: '' });
          }
        }
      }
    }

    if (mode === 'perplexity') {
      if (!params.perplexityApiKey) throw new Error('PERPLEXITY_API_KEY missing');
      const { answer, citations, costUsd: pc } = await searchPerplexity(
        artist,
        title,
        params.perplexityApiKey,
      );
      costUsd += pc;
      hits = citations.map((c) => ({ url: c.url, title: c.title ?? '', snippet: answer.slice(0, 300) }));
      const urls = citations.slice(0, maxPages).map((c) => c.url).filter((u) => u.startsWith('http'));
      pages = await extractPagesParallel(urls, 2);
      if (answer.length > 80) {
        pages.unshift({
          url: 'perplexity:answer',
          title: 'Perplexity synthesis',
          text: answer,
          via: 'direct',
        });
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const rawSnippets: string[] = [];
  for (const h of hits) {
    if (h.snippet.length >= 40) rawSnippets.push(`${h.title}: ${h.snippet} [${h.url}]`);
  }
  for (const p of pages) {
    const chunks = chunkPageText(p.text);
    rawSnippets.push(...formatChunksWithProvenance(p.url, chunks));
  }

  return {
    mode,
    hits,
    pages,
    rawSnippets: [...new Set(rawSnippets)].slice(0, 16),
    latencyMs: Date.now() - t0,
    costUsd,
    error,
  };
}

export const TAVILY_CREDIT_USD = 0.008;
export const PERPLEXITY_SONAR_PRO_MEDIUM_USD = 0.01;
