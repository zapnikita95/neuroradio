import fetch from 'node-fetch';
import type { ReferenceFactBundle } from './fact-picker.js';
import { factAppliesToRequest } from './fact-relevance.js';
import { filterAndRankFacts } from './reference-fact-quality.js';
import { buildFactHuntSearchQueries } from './story-fact-hunt.js';
import { fetchReferenceFactBundle as fetchWikipediaBundle } from './wikipedia-facts.js';

const USER_AGENT = 'MusicStoryBFF/1.0 (contact@example.com)';
const RAW_SNIPPET_MIN_LEN = 35;
const RAW_SNIPPET_MAX = 12;

export type SnippetSource = 'wiki' | 'ddg' | 'wikidata' | 'mb';

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

async function fetchDuckDuckGoUnfiltered(artist: string, title: string): Promise<string[]> {
  const queries = [
    `${artist} ${title} song`,
    `${artist} musician biography`,
    ...buildFactHuntSearchQueries(artist, title),
  ];
  const collected: string[] = [];
  for (const query of queries) {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as {
        AbstractText?: string;
        Abstract?: string;
        RelatedTopics?: Array<{ Text?: string; Topics?: Array<{ Text?: string }> }>;
      };
      for (const text of [data.AbstractText, data.Abstract]) {
        if (text?.trim()) collected.push(text.trim());
      }
      for (const topic of data.RelatedTopics ?? []) {
        if (topic.Text?.trim()) collected.push(topic.Text.trim());
        for (const nested of topic.Topics ?? []) {
          if (nested.Text?.trim()) collected.push(nested.Text.trim());
        }
      }
    } catch {
      // skip source
    }
    if (collected.length >= 10) break;
  }
  return collected;
}

async function fetchDuckDuckGo(artist: string, title: string): Promise<string[]> {
  return filterAndRankFacts(await fetchDuckDuckGoUnfiltered(artist, title), 6);
}

async function fetchWikidataUnfiltered(artist: string, title: string, countryCode?: string): Promise<string[]> {
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
  wdRaw: string[],
  mbTrackRaw: string[],
  mbArtistRaw: string[],
): { rawSnippets: string[]; snippetSources: SnippetSource[] } {
  const rawSnippets: string[] = [];
  const snippetSources: SnippetSource[] = [];

  for (const fact of [...wiki.trackFacts, ...wiki.artistFacts]) {
    pushRaw(rawSnippets, snippetSources, fact, 'wiki');
    capRaw(rawSnippets, snippetSources);
  }
  for (const text of ddgRaw) {
    pushRaw(rawSnippets, snippetSources, text, 'ddg');
    capRaw(rawSnippets, snippetSources);
  }
  for (const text of wdRaw) {
    pushRaw(rawSnippets, snippetSources, text, 'wikidata');
    capRaw(rawSnippets, snippetSources);
  }
  for (const text of [...mbTrackRaw, ...mbArtistRaw]) {
    pushRaw(rawSnippets, snippetSources, text, 'mb');
    capRaw(rawSnippets, snippetSources);
  }

  return { rawSnippets, snippetSources };
}

export async function fetchAggregatedFactContext(
  artist: string,
  title: string,
  countryCode?: string,
  recordingMbid?: string,
  artistMbid?: string,
): Promise<AggregatedFactContext> {
  let wiki = await fetchWikipediaBundle(artist, title, countryCode);
  if (wiki.trackFacts.length < 2) {
    const wikiEn = await fetchWikipediaBundle(artist, title, 'US');
    wiki = {
      trackFacts: mergeFacts(wiki.trackFacts, wikiEn.trackFacts),
      artistFacts: mergeFacts(wiki.artistFacts, wikiEn.artistFacts),
    };
  }
  const [ddgUnfiltered, wdUnfiltered, mbTrackRaw, mbArtistRaw] = await Promise.all([
    fetchDuckDuckGoUnfiltered(artist, title),
    fetchWikidataUnfiltered(artist, title, countryCode),
    fetchMusicBrainzAnnotationsUnfiltered('recording', recordingMbid),
    fetchMusicBrainzAnnotationsUnfiltered('artist', artistMbid),
  ]);

  const ddg = filterAndRankFacts(ddgUnfiltered, 6);
  const wikidata = filterAndRankFacts(wdUnfiltered, 5);
  const mbTrack = filterAndRankFacts(mbTrackRaw, 4);
  const mbArtist = filterAndRankFacts(mbArtistRaw, 4);

  const ddgFiltered = factsAboutTrackOrArtist(ddg, artist, title);
  const wdFiltered = factsAboutTrackOrArtist(wikidata, artist, title);
  const ddgSplit = splitByMention(ddgFiltered, title, artist);
  const wdSplit = splitByMention(wdFiltered, title, artist);

  let trackFacts = mergeFacts(wiki.trackFacts, ddgSplit.track, wdSplit.track, mbTrack);
  let artistFacts = mergeFacts(wiki.artistFacts, ddgSplit.artist, wdSplit.artist, mbArtist);

  if (trackFacts.length + artistFacts.length === 0) {
    const ddgRelaxed = filterAndRankFacts(ddgUnfiltered, 5);
    if (ddgRelaxed.length > 0) {
      const relaxedSplit = splitByMention(ddgRelaxed, title, artist);
      console.warn(
        `[facts] relaxed DDG fallback for "${artist}" — "${title}" (${ddgRelaxed.length} snippets)`,
      );
      trackFacts =
        relaxedSplit.track.length > 0 ? relaxedSplit.track : ddgRelaxed.slice(0, 2);
      artistFacts =
        relaxedSplit.artist.length > 0 ? relaxedSplit.artist : ddgRelaxed.slice(0, 4);
    }
  }

  const bundle: ReferenceFactBundle = { trackFacts, artistFacts };
  const { rawSnippets, snippetSources } = buildRawSnippets(
    wiki,
    ddgUnfiltered,
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
