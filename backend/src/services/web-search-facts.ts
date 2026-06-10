import fetch from '../proxy-fetch.js';
import { hasActionableSnippets } from './web-snippet-accept.js';
import { cleanTrackTitleForSearch, stripSnippetBoilerplate } from './title-clean.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; MusicStoryBFF/1.0; +https://music-story.app)';
/** Первый проход — узкие запросы под «дыры» Wikipedia. */
const MAX_HTML_QUERIES = 4;
/** Второй проход — site:/lyrics/интервью, когда первый вернул мусор. */
const MAX_DEEP_HTML_QUERIES = 6;
const SNIPPETS_PER_QUERY = 4;
const HTML_PARALLEL = 4;

export interface DdgHtmlResult {
  title: string;
  snippet: string;
  url: string;
}

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

function isCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

/** Однословные имена вроде Palm / Blur — без «band» web уводит на анатомию и мусор. */
function isAmbiguousArtistName(artist: string): boolean {
  const trimmed = artist.trim();
  if (!trimmed || isCyrillic(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length === 1 && words[0]!.length <= 8;
}

function quotedArtist(artist: string): string {
  const trimmed = artist.trim();
  if (/^the\s+/i.test(trimmed) || trimmed.split(/\s+/).length >= 2) {
    return `"${trimmed}"`;
  }
  return trimmed;
}

function cleanTrackTitle(title: string): string {
  return cleanTrackTitleForSearch(title);
}

/** Latin stage name + Cyrillic title — типичный рэп-кейс (GALAGA и т.п.). */
function isLatinArtistCyrillicTrack(artist: string, title: string): boolean {
  return !isCyrillic(artist.trim()) && isCyrillic(cleanTrackTitle(title));
}

/** Запросы «{имя} артист» — биография, когда lyrics/концерты не дают фактов. */
export function buildArtistIdentityQueries(artist: string): string[] {
  const trimmed = artist.trim();
  if (!trimmed || trimmed.length < 2) return [];
  const artistQ = quotedArtist(trimmed);
  const queries = [
    `${trimmed} артист`,
    `"${trimmed}" артист`,
    `${trimmed} музыкант биография`,
  ];
  if (isCyrillic(trimmed)) {
    queries.push(`${trimmed} рэп исполнитель`, `${trimmed} интервью`);
  } else {
    queries.push(`${artistQ} russian rap musician`, `${artistQ} artist biography interview`);
  }
  return queries.slice(0, 4);
}

/** DDG Instant API — язык-зависимые запросы (не «Wounded Knee» для русского рэпа). */
export function buildDdgInstantQueries(artist: string, title: string): string[] {
  const cleanTitle = cleanTrackTitle(title);
  if (isCyrillic(artist + title)) {
    const lead = artist.trim().toLowerCase() === 'кино' ? 'Виктор Цой Кино' : artist;
    return [
      `"${lead}" "${cleanTitle}"`,
      `${lead} ${cleanTitle} текст песни`,
      `${lead} музыкант биография`,
    ];
  }
  const artistQ = quotedArtist(artist);
  return [
    `${artistQ} ${cleanTitle} song`,
    `${artistQ} ${cleanTitle} meaning interview`,
    `${artistQ} band biography`,
  ];
}

/** Узкие запросы под интервью/скандалы — не в instant DDG. */
export function buildWebOnlyQueries(artist: string, title: string): string[] {
  const cleanTitle = cleanTrackTitle(title);
  const artistQ = quotedArtist(artist);
  const ruTitle = isCyrillic(title);
  if (isCyrillic(artist) || ruTitle) {
    const lead = artist.trim().toLowerCase() === 'кино' ? 'Виктор Цой Кино' : artist;
    const fourthQuery = isLatinArtistCyrillicTrack(artist, title)
      ? `${artist.trim()} артист`
      : `${lead} артист`;
    return [
      `"${lead}" "${cleanTitle}"`,
      `${lead} ${cleanTitle} текст песни смысл`,
      `${lead} ${cleanTitle} рэп трек`,
      fourthQuery,
    ].slice(0, MAX_HTML_QUERIES);
  }
  if (isAmbiguousArtistName(artist)) {
    return [
      `${artistQ} band ${cleanTitle} song interview`,
      `${artistQ} band ${cleanTitle} meaning recording`,
      `${artistQ} musical group ${cleanTitle} controversy`,
      `${artistQ} band biography scandal interview`,
    ].slice(0, MAX_HTML_QUERIES);
  }
  return [
    `${artistQ} ${cleanTitle} song interview meaning`,
    `${artistQ} ${cleanTitle} origin story written recorded`,
    `${artistQ} ${cleanTitle} hidden meaning behind the scenes`,
    `${artistQ} band biography scandal heritage`,
  ].slice(0, MAX_HTML_QUERIES);
}

/** Title-first HTML search when artist+tier obscure — cover labels, karaoke, etc. */
export function buildTitleFirstWebQueries(title: string): string[] {
  const cleanTitle = cleanTrackTitle(title);
  if (!cleanTitle || cleanTitle.length < 3) return [];
  const titleQ = `"${cleanTitle}"`;
  if (isCyrillic(cleanTitle)) {
    return [`${titleQ} песня текст`, `${titleQ} трек релиз`].slice(0, 2);
  }
  return [`${titleQ} song wikipedia meaning`, `${titleQ} single original artist album`].slice(0, 2);
}

/** Второй проход: site-запросы, lyrics, интервью — когда DDG вернул YouTube UI. */
export function buildDeepWebQueries(artist: string, title: string): string[] {
  const cleanTitle = cleanTrackTitle(title);
  const artistQ = quotedArtist(artist);
  if (isCyrillic(artist + title)) {
    return [
      `"${artist}" "${cleanTitle}" site:genius.com OR site:vk.com OR site:musixmatch.com`,
      `"${cleanTitle}" ${artist} текст песни`,
      `"${artist}" интервью`,
      `"${artist}" ${cleanTitle} альбом`,
      `${artist} ${cleanTitle} site:rap.ru OR site:the-flow.ru OR site:rap-inside.ru`,
      `"${artist}" ${cleanTitle} bandlink OR zvonko`,
    ].slice(0, MAX_DEEP_HTML_QUERIES);
  }
  return [
    `"${cleanTitle}" ${artistQ} lyrics genius songfacts`,
    `"${cleanTitle}" ${artistQ} interview meaning recording`,
    `${artistQ} "${cleanTitle}" site:genius.com OR site:wikipedia.org`,
    `${artistQ} "${cleanTitle}" behind the scenes story`,
    `"${cleanTitle}" ${artistQ} album single release`,
    `${artistQ} biography scandal interview`,
  ].slice(0, MAX_DEEP_HTML_QUERIES);
}

/** Indie pass — только артист, без дублирования имени в title. */
export function buildIndieArtistWebQueries(artist: string, title: string): string[] {
  const artistQ = quotedArtist(artist);
  if (isCyrillic(artist)) {
    return [
      `"${artist}" музыкант биография`,
      `"${artist}" интервью`,
      `"${artist}" рэп исполнитель`,
      `${artist} site:vk.com OR site:genius.com`,
      title ? `"${artist}" "${cleanTrackTitle(title)}"` : `${artist} дискография`,
    ].slice(0, MAX_DEEP_HTML_QUERIES);
  }
  return [
    `${artistQ} musician biography interview`,
    `${artistQ} band history discography`,
    `${artistQ} artist scandal documentary`,
    title ? `${artistQ} "${cleanTrackTitle(title)}" song` : `${artistQ} musical artist`,
  ].slice(0, MAX_DEEP_HTML_QUERIES);
}

/** Backstory-focused queries when generic search returned nothing useful. */
export function buildBackstoryWebQueries(artist: string, title: string): string[] {
  const cleanTitle = cleanTrackTitle(title);
  const artistQ = quotedArtist(artist);
  if (isCyrillic(artist + title)) {
    return [
      `"${cleanTitle}" ${artist} смысл текст`,
      `"${artist}" ${cleanTitle} история создания`,
      `"${artist}" ${cleanTitle} клип`,
      `${artist} ${cleanTitle} интервью`,
    ];
  }
  return [
    `"${cleanTitle}" ${artistQ} written motel hotel origin`,
    `"${cleanTitle}" ${artistQ} song interview meaning recording`,
    `"${cleanTitle}" ${artistQ} film soundtrack chart success`,
    `${artistQ} "${cleanTitle}" behind the scenes story`,
  ];
}

const PLATFORM_UI_IN_RESULT =
  /^(?:Enjoy the videos|Provided to YouTube|Discover and play|Watch exclusive|Sign in to|Create an account)/i;

/** Заголовок DDG часто несёт «Artist — Track Lyrics» — склеиваем с сниппетом. */
export function formatDdgResult(result: DdgHtmlResult): string {
  const title = result.title.trim();
  const snippet = result.snippet.trim();
  if (!snippet && !title) return '';
  if (!snippet) return title.length >= 40 ? title : '';
  if (!title || title.length < 8) return snippet;
  if (PLATFORM_UI_IN_RESULT.test(snippet) || PLATFORM_UI_IN_RESULT.test(title)) return '';
  const titleNorm = title.toLowerCase().replace(/\s+/g, ' ');
  const snippetNorm = snippet.toLowerCase().replace(/\s+/g, ' ');
  if (snippetNorm.includes(titleNorm) || titleNorm.includes(snippetNorm.slice(0, 40))) {
    return snippet;
  }
  const combined = stripSnippetBoilerplate(`${title}. ${snippet}`.replace(/\s+/g, ' ').trim());
  return combined.length <= 480 ? combined : stripSnippetBoilerplate(snippet);
}

export async function fetchTitleFirstWebSnippets(title: string): Promise<string[]> {
  return collectFromQueries(buildTitleFirstWebQueries(title), 'web-title', `"${title}"`);
}

export async function fetchBackstoryWebSnippets(artist: string, title: string): Promise<string[]> {
  return collectFromQueries(
    buildBackstoryWebQueries(artist, title),
    'web-backstory',
    `${artist} — ${title}`,
  );
}

export async function fetchIndieArtistWebSnippets(artist: string, title: string): Promise<string[]> {
  return collectFromQueries(
    buildIndieArtistWebQueries(artist, title),
    'web-indie-artist',
    artist,
  );
}

export async function fetchArtistIdentityWebSnippets(artist: string): Promise<string[]> {
  return collectFromQueries(
    buildArtistIdentityQueries(artist),
    'web-artist-id',
    `${artist} (artist identity)`,
  );
}

export async function fetchDeepWebSearchSnippets(artist: string, title: string): Promise<string[]> {
  return collectFromQueries(buildDeepWebQueries(artist, title), 'web-deep', `${artist} — ${title}`);
}

export function webSnippetsNeedDeepSearch(
  snippets: string[],
  artist: string,
  title: string,
): boolean {
  if (snippets.length === 0) return true;
  if (hasActionableSnippets(snippets, artist, title)) return false;
  return snippets.length < 8;
}

export function countWebSearchHttpRequests(): number {
  return buildWebOnlyQueries('_', '_').length;
}

async function fetchDdgHtmlResults(query: string, maxResults: number): Promise<DdgHtmlResult[]> {
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
  const titles =
    html.match(/class="result__a"[^>]*>([^<]+)<\/a>/g)?.map((m) => {
      const hit = m.match(/>([^<]+)<\/a>/);
      return decodeHtml(stripTags(hit?.[1] ?? ''));
    }) ?? [];
  const snippets =
    html.match(/class="result__snippet"[^>]*>\s*([^<]+)/g)?.map((m) => {
      const hit = m.match(/>\s*([^<]+)/);
      return decodeHtml(stripTags(hit?.[1] ?? ''));
    }) ?? [];
  const urls =
    html.match(/class="result__a"[^>]*href="(https?:\/\/[^"]+)"/g)?.map((m) => {
      const hit = m.match(/href="(https?:\/\/[^"]+)"/);
      return hit?.[1] ?? '';
    }) ?? [];

  const count = Math.min(maxResults, Math.max(titles.length, snippets.length));
  const results: DdgHtmlResult[] = [];
  for (let i = 0; i < count; i++) {
    results.push({
      title: titles[i] ?? '',
      snippet: snippets[i] ?? '',
      url: urls[i] ?? '',
    });
  }
  return results;
}

async function fetchDdgHtmlSnippets(query: string, maxResults: number): Promise<string[]> {
  const results = await fetchDdgHtmlResults(query, maxResults);
  return results
    .map(formatDdgResult)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 480);
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

async function collectFromQueries(
  queries: string[],
  logTag: string,
  logLabel: string,
): Promise<string[]> {
  if (queries.length === 0) return [];
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
      `[${logTag}] ${logLabel}: ${collected.length} snippets, ${queries.length} HTML queries`,
    );
    for (const [i, text] of collected.slice(0, 4).entries()) {
      const preview = text.replace(/\s+/g, ' ').slice(0, 100);
      console.log(`[${logTag}]   ${i + 1}. ${preview}${text.length > 100 ? '…' : ''}`);
    }
  }
  return collected.slice(0, 16);
}

/**
 * HTML DuckDuckGo — параллельно, без sleep между запросами.
 * Не вызывает LLM — только HTTP.
 */
export async function fetchWebSearchFactSnippets(artist: string, title: string): Promise<string[]> {
  return collectFromQueries(
    buildWebOnlyQueries(artist, title),
    'web-search',
    `${artist} — ${title}`,
  );
}
