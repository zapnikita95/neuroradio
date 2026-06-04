import fetch from 'node-fetch';
import { buildFactHuntSearchQueries } from './story-fact-hunt.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; MusicStoryBFF/1.0; +https://music-story.app)';
const MAX_QUERIES = 7;
const SNIPPETS_PER_QUERY = 4;

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

function buildWebFactQueries(artist: string, title: string): string[] {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const extra = [
    `${artist} Vasquez Vegas surname stage name appeal white audience`,
    `${artist} Pat Lolly Vegas changed name discrimination`,
    `${artist} ${cleanTitle} radio refused play shortened edit minutes`,
    `${artist} band interview controversy banned radio`,
    `${artist} Native American rock band origin story interview`,
  ];
  const base = buildFactHuntSearchQueries(artist, title);
  return [...new Set([...extra, ...base])].slice(0, MAX_QUERIES);
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
    signal: AbortSignal.timeout(14_000),
  });
  if (!response.ok) return [];

  const html = await response.text();
  const snippets =
    html.match(/class="result__snippet"[^>]*>\s*([^<]+)/g)?.map((m) => {
      const hit = m.match(/>\s*([^<]+)/);
      return decodeHtml(stripTags(hit?.[1] ?? ''));
    }) ?? [];

  const abstracts =
    html.match(/class="result__body"[^>]*>\s*([^<]+)/g)?.map((m) => {
      const hit = m.match(/>\s*([^<]+)/);
      return decodeHtml(stripTags(hit?.[1] ?? ''));
    }) ?? [];

  const combined = [...snippets, ...abstracts]
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 480);

  return combined.slice(0, maxResults);
}

/**
 * HTML DuckDuckGo — интервью, статьи, то чего нет в Wikipedia extract.
 */
export async function fetchWebSearchFactSnippets(artist: string, title: string): Promise<string[]> {
  const queries = buildWebFactQueries(artist, title);
  const seen = new Set<string>();
  const collected: string[] = [];

  for (const query of queries) {
    try {
      const snippets = await fetchDdgHtmlSnippets(query, SNIPPETS_PER_QUERY);
      for (const text of snippets) {
        const key = text.toLowerCase().replace(/\s+/g, ' ');
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(text);
      }
    } catch (err) {
      console.warn(
        `[web-search] query failed "${query.slice(0, 60)}": ${err instanceof Error ? err.message : err}`,
      );
    }
    if (collected.length >= 14) break;
    await new Promise((r) => setTimeout(r, 350));
  }

  if (collected.length > 0) {
    console.log(`[web-search] ${artist} — ${title}: ${collected.length} snippets from ${queries.length} queries`);
  }
  return collected;
}
