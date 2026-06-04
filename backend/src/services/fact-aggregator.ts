import fetch from 'node-fetch';
import type { ReferenceFactBundle } from './fact-picker.js';
import { factAppliesToRequest } from './fact-relevance.js';
import { filterAndRankFacts, interestScore } from './reference-fact-quality.js';
import { WEAK_TRIVIA_PATTERNS } from './story-fact-hunt.js';
import { fetchReferenceFactBundle as fetchWikipediaBundle } from './wikipedia-facts.js';
import { fetchWebSearchFactSnippets } from './web-search-facts.js';

const USER_AGENT = 'MusicStoryBFF/1.0 (contact@example.com)';
const RAW_SNIPPET_MIN_LEN = 30;
const RAW_SNIPPET_MAX = 12;

export type SnippetSource = 'wiki' | 'ddg' | 'web' | 'wikidata' | 'mb';

export interface AggregatedFactContext {
  bundle: ReferenceFactBundle;
  rawSnippets: string[];
  snippetSources: SnippetSource[];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function splitByMention(facts: string[], title: string, artist: string): { track: string[]; artist: string[] } {
  const titleNorm = normalize(title);
  const artistNorm = normalize(artist);
  const track: string[] = [];
  const artistFacts: string[] = [];
  for (const fact of facts) {
    const norm = normalize(fact);
    if (titleNorm.length >= 4 && norm.includes(titleNorm)) track.push(fact);
    else artistFacts.push(fact);
  }
  return { track, artist: artistFacts };
}

function mergeFacts(...pools: string[][]): string[] {
  return filterAndRankFacts(pools.flat(), 8);
}

function factsAboutTrackOrArtist(facts: string[], artist: string, title: string): string[] {
  return facts.filter(
    (fact) =>
      factAppliesToRequest(fact, artist, title, 'track') ||
      factAppliesToRequest(fact, artist, title, 'artist'),
  );
}

function pushRaw(
  collected: string[],
  sources: SnippetSource[],
  text: string,
  source: SnippetSource,
): void {
  const trimmed = text.trim();
  if (trimmed.length < RAW_SNIPPET_MIN_LEN) return;
  if (WEAK_TRIVIA_PATTERNS.some((p) => p.test(trimmed))) return;
  const norm = normalize(trimmed);
  if (collected.some((s) => normalize(s) === norm)) return;
  collected.push(trimmed.slice(0, 480));
  sources.push(source);
}

function capRaw(collected: string[], sources: SnippetSource[]): void {
  while (collected.length > RAW_SNIPPET_MAX) {
    collected.pop();
    sources.pop();
  }
}

/** Instant DDG API — 3 быстрых запроса параллельно (остальное — HTML web-search). */
export function buildDdgInstantQueries(artist: string, title: string): string[] {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return [
    `${artist} ${cleanTitle} song`,
    `${artist} band biography controversy`,
    `${artist} Wounded Knee radio banned`,
  ];
}

async function fetchDdgInstantQuery(query: string): Promise<string[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    AbstractText?: string;
    Abstract?: string;
    RelatedTopics?: Array<{ Text?: string; Topics?: Array<{ Text?: string }> }>;
  };
  const collected: string[] = [];
  for (const text of [data.AbstractText, data.Abstract]) {
    if (text?.trim()) collected.push(text.trim());
  }
  for (const topic of data.RelatedTopics ?? []) {
    if (topic.Text?.trim()) collected.push(topic.Text.trim());
    for (const nested of topic.Topics ?? []) {
      if (nested.Text?.trim()) collected.push(nested.Text.trim());
    }
  }
  return collected;
}

export async function fetchDuckDuckGoUnfiltered(artist: string, title: string): Promise<string[]> {
  const queries = buildDdgInstantQueries(artist, title);
  const batches = await Promise.all(queries.map((q) => fetchDdgInstantQuery(q).catch(() => [])));
  const seen = new Set<string>();
  const collected: string[] = [];
  for (const batch of batches) {
    for (const text of batch) {
      const key = normalize(text);
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(text);
    }
  }
  return collected;
}

async function fetchDuckDuckGo(artist: string, title: string): Promise<string[]> {
  return filterAndRankFacts(await fetchDuckDuckGoUnfiltered(artist, title), 6);
}

export async function fetchWikidataUnfiltered(artist: string, title: string, countryCode?: string): Promise<string[]> {
  const lang = countryCode === 'RU' ? 'ru' : 'en';
  const queries = [`${title} ${artist} song`, artist];
  const results: string[] = [];
  for (const query of queries) {
    const url =
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}` +
      `&language=${lang}&format=json&origin=*&limit=2`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as {
        search?: Array<{ label?: string; description?: string }>;
      };
      for (const item of data.search ?? []) {
        const label = item.label?.trim() ?? '';
        const description = item.description?.trim() ?? '';
        if (label && description.length >= 25) results.push(`${label} — ${description}.`);
        else if (description.length >= 35) results.push(description);
      }
    } catch {
      // skip
    }
  }
  return results;
}

async function fetchWikidata(artist: string, title: string, countryCode?: string): Promise<string[]> {
  return filterAndRankFacts(await fetchWikidataUnfiltered(artist, title, countryCode), 5);
}

async function fetchMusicBrainzAnnotationsUnfiltered(
  entity: 'recording' | 'artist',
  mbid?: string,
): Promise<string[]> {
  const id = mbid?.trim();
  if (!id) return [];
  const url = `https://musicbrainz.org/ws/2/${entity}/${id}?inc=annotations&fmt=json`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        if (response.status >= 500 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }
        return [];
      }
      const data = (await response.json()) as { annotations?: Array<{ annotation?: string }> };
      const texts: string[] = [];
      for (const item of data.annotations ?? []) {
        const raw = item.annotation?.trim();
        if (!raw || raw.length < 35) continue;
        texts.push(
          ...raw
            .split(/(?<=[.!?…])\s+/)
            .map((s) => s.trim())
            .filter((s) => s.length >= 35 && s.length <= 240),
        );
      }
      return texts;
    } catch (err) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      console.warn(
        `MusicBrainz annotations failed (${entity}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return [];
}

async function fetchMusicBrainzAnnotations(entity: 'recording' | 'artist', mbid?: string): Promise<string[]> {
  return filterAndRankFacts(await fetchMusicBrainzAnnotationsUnfiltered(entity, mbid), 4);
}

function buildRawSnippets(
  wiki: ReferenceFactBundle,
  ddgRaw: string[],
  webRaw: string[],
  wdRaw: string[],
  mbTrackRaw: string[],
  mbArtistRaw: string[],
): { rawSnippets: string[]; snippetSources: SnippetSource[] } {
  const candidates: Array<{ text: string; source: SnippetSource; score: number }> = [];

  const addCandidate = (text: string, source: SnippetSource) => {
    const trimmed = text.trim();
    if (trimmed.length < RAW_SNIPPET_MIN_LEN) return;
    if (WEAK_TRIVIA_PATTERNS.some((p) => p.test(trimmed))) return;
    candidates.push({ text: trimmed.slice(0, 480), source, score: interestScore(trimmed) });
  };

  for (const fact of [...wiki.trackFacts, ...wiki.artistFacts]) addCandidate(fact, 'wiki');
  for (const text of ddgRaw) addCandidate(text, 'ddg');
  for (const text of webRaw) addCandidate(text, 'web');
  for (const text of wdRaw) addCandidate(text, 'wikidata');
  for (const text of [...mbTrackRaw, ...mbArtistRaw]) addCandidate(text, 'mb');

  const seen = new Set<string>();
  const ranked = candidates
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      const key = normalize(item.text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, RAW_SNIPPET_MAX);

  return {
    rawSnippets: ranked.map((r) => r.text),
    snippetSources: ranked.map((r) => r.source),
  };
}

export async function fetchWikiBundleMerged(
  artist: string,
  title: string,
  countryCode?: string,
): Promise<ReferenceFactBundle> {
  let wiki = await fetchWikipediaBundle(artist, title, countryCode);
  if (wiki.trackFacts.length + wiki.artistFacts.length < 2) {
    const wikiEn = await fetchWikipediaBundle(artist, title, 'US');
    wiki = {
      trackFacts: mergeFacts(wiki.trackFacts, wikiEn.trackFacts),
      artistFacts: mergeFacts(wiki.artistFacts, wikiEn.artistFacts),
    };
  }
  return wiki;
}

export async function fetchAggregatedFactContext(
  artist: string,
  title: string,
  countryCode?: string,
  recordingMbid?: string,
  artistMbid?: string,
): Promise<AggregatedFactContext> {
  const t0 = Date.now();
  const [wiki, ddgUnfiltered, webUnfiltered, wdUnfiltered, mbTrackRaw, mbArtistRaw] = await Promise.all([
    fetchWikiBundleMerged(artist, title, countryCode),
    fetchDuckDuckGoUnfiltered(artist, title),
    fetchWebSearchFactSnippets(artist, title),
    fetchWikidataUnfiltered(artist, title, countryCode),
    fetchMusicBrainzAnnotationsUnfiltered('recording', recordingMbid),
    fetchMusicBrainzAnnotationsUnfiltered('artist', artistMbid),
  ]);
  console.log(
    `[facts] parallel fetch ${artist} — ${title}: ${Date.now() - t0}ms ` +
      `wiki=${wiki.trackFacts.length + wiki.artistFacts.length} ddg=${ddgUnfiltered.length} web=${webUnfiltered.length}`,
  );

  const ddg = filterAndRankFacts([...ddgUnfiltered, ...webUnfiltered], 10);
  const wikidata = filterAndRankFacts(wdUnfiltered, 5);
  const mbTrack = filterAndRankFacts(mbTrackRaw, 4);
  const mbArtist = filterAndRankFacts(mbArtistRaw, 4);

  const externalFiltered = factsAboutTrackOrArtist(ddg, artist, title);
  const wdFiltered = factsAboutTrackOrArtist(wikidata, artist, title);
  const wdSplit = splitByMention(wdFiltered, title, artist);
  const webInBundle = webUnfiltered.filter((f) => externalFiltered.includes(f));
  const ddgOnly = externalFiltered.filter((f) => !webInBundle.includes(f));
  const externalSplit = splitByMention([...ddgOnly, ...webInBundle], title, artist);

  let trackFacts = mergeFacts(
    wiki.trackFacts,
    externalSplit.track,
    wdSplit.track,
    mbTrack,
  );
  const webRanked = filterAndRankFacts(
    webUnfiltered.filter((f) => factAppliesToRequest(f, artist, title, 'artist')),
    4,
  );

  let artistFacts = mergeFacts(
    wiki.artistFacts,
    externalSplit.artist,
    webRanked,
    wdSplit.artist,
    mbArtist,
  );

  trackFacts = trackFacts.filter((f) => factAppliesToRequest(f, artist, title, 'track'));
  artistFacts = artistFacts.filter((f) => factAppliesToRequest(f, artist, title, 'artist'));

  if (trackFacts.length + artistFacts.length === 0) {
    console.warn(
      `[facts] no validated facts for "${artist}" — "${title}" after relevance filter`,
    );
  }

  const bundle: ReferenceFactBundle = { trackFacts, artistFacts };
  const { rawSnippets, snippetSources } = buildRawSnippets(
    wiki,
    ddgUnfiltered,
    webUnfiltered,
    wdUnfiltered,
    mbTrackRaw,
    mbArtistRaw,
  );

  return { bundle, rawSnippets, snippetSources };
}

/** @deprecated use fetchAggregatedFactContext */
export async function fetchAggregatedFactBundle(
  artist: string,
  title: string,
  countryCode?: string,
  recordingMbid?: string,
  artistMbid?: string,
): Promise<ReferenceFactBundle> {
  const ctx = await fetchAggregatedFactContext(artist, title, countryCode, recordingMbid, artistMbid);
  return ctx.bundle;
}
