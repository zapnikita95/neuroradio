import fetch from 'node-fetch';

const USER_AGENT = 'Mozilla/5.0 (compatible; MusicStoryBFF/1.0; +https://music-story.app)';
/** Только «дыры» Wikipedia — не дублируем запросы DDG Instant API. */
const MAX_HTML_QUERIES = 4;
const SNIPPETS_PER_QUERY = 3;
const HTML_PARALLEL = 4;

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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

/** Однословные имена вроде Palm / Blur — без «band» web уводит на анатомию и мусор. */
function isAmbiguousArtistName(artist: string): boolean {
  const trimmed = artist.trim();
  if (!trimmed || /[\u0400-\u04FF]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length === 1 && words[0]!.length <= 8;
}

/** Узкие запросы под интервью/скандалы — не в instant DDG. */
export function buildWebOnlyQueries(artist: string, title: string): string[] {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const cyrillic = /[\u0400-\u04FF]/.test(artist + title);
  if (cyrillic) {
    const lead = artist.trim().toLowerCase() === 'кино' ? 'Виктор Цой Кино' : artist;
    return [
      `${lead} ${cleanTitle} история песня смысл`,
      `${artist} ${cleanTitle} запись цензура`,
      `${lead} биография скандал армия`,
      `${artist} (группа) ${cleanTitle} факт`,
    ].slice(0, MAX_HTML_QUERIES);
  }
  if (isAmbiguousArtistName(artist)) {
    return [
      `"${artist}" band ${cleanTitle} song interview`,
      `"${artist}" band ${cleanTitle} meaning recording`,
      `"${artist}" musical group ${cleanTitle} controversy`,
      `"${artist}" band biography scandal interview`,
    ].slice(0, MAX_HTML_QUERIES);
  }
  return [
    `${artist} ${cleanTitle} controversy interview meaning`,
    `${artist} ${cleanTitle} radio banned refused`,
    `${artist} biography scandal heritage interview`,
    `${artist} ${cleanTitle} hidden meaning origin story`,
  ].slice(0, MAX_HTML_QUERIES);
}

export function countWebSearchHttpRequests(): number {
  return buildWebOnlyQueries('_', '_').length;
}

async function fetchDdgHtmlSnippets(query: string, maxResults: number): Promise<string[]> {
  const body = new URLSearchParams({ q: query.trim() });
  const response = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return [];

  const html = await response.text();
  const snippets =
    html.match(/class="result__snippet"[^>]*>\s*([^<]+)/g)?.map((m) => {
      const hit = m.match(/>\s*([^<]+)/);
      return decodeHtml(stripTags(hit?.[1] ?? ''));
    }) ?? [];

  const combined = snippets
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 480);

  return combined.slice(0, maxResults);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * HTML DuckDuckGo — параллельно, без sleep между запросами.
 * Не вызывает LLM — только HTTP.
 */
export async function fetchWebSearchFactSnippets(artist: string, title: string): Promise<string[]> {
  const queries = buildWebOnlyQueries(artist, title);
  const seen = new Set<string>();
  const collected: string[] = [];

  const batches = await mapWithConcurrency(queries, HTML_PARALLEL, (query) =>
    fetchDdgHtmlSnippets(query, SNIPPETS_PER_QUERY).catch(() => []),
  );

  for (const snippets of batches) {
    for (const text of snippets) {
      const key = text.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(text);
    }
  }

  if (collected.length > 0) {
    console.log(
      `[web-search] ${artist} — ${title}: ${collected.length} snippets, ${queries.length} parallel HTML requests`,
    );
  }
  return collected.slice(0, 14);
}
