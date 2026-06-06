import fetch from 'node-fetch';
import type { ReferenceFactBundle } from './fact-picker.js';
import { assignFactsToScopes, factAppliesToRequest, factMentionsArtist, factNamesForeignEntity, isWebListicleJunk } from './fact-relevance.js';
import { filterAndRankFacts, interestScore } from './reference-fact-quality.js';
import { WEAK_TRIVIA_PATTERNS } from './story-fact-hunt.js';
import { fetchReferenceFactBundle as fetchWikipediaBundle } from './wikipedia-facts.js';
import { fetchArtistWikiLead } from './wikipedia-lead.js';
import { inferRuRegionalContext } from './metadata-facts.js';
import { fetchWebSearchFactSnippets } from './web-search-facts.js';

const USER_AGENT = 'MusicStoryBFF/1.0 (contact@example.com)';
const RAW_SNIPPET_MIN_LEN = 30;
const RAW_SNIPPET_MAX = 12;
/** Весь параллельный сбор фактов — иначе трек уже сменился. */
const FACT_FETCH_BUDGET_MS = parseInt(process.env.FACT_FETCH_TIMEOUT_MS ?? '28000', 10);
const FACT_FETCH_HARD_CAP_MS = parseInt(process.env.FACT_FETCH_HARD_CAP_MS ?? '22000', 10);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

const EMPTY_WIKI: ReferenceFactBundle = { trackFacts: [], artistFacts: [] };

async function fetchWithCap<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
  ms = FACT_FETCH_HARD_CAP_MS,
): Promise<T> {
  try {
    return await withTimeout(fn(), ms, label);
  } catch (err) {
    console.warn(
      `[facts] ${label} failed for cap ${ms}ms: ${err instanceof Error ? err.message : err}`,
    );
    return fallback;
  }
}

function resolveFactCountryCode(artist: string, title: string, countryCode?: string): string | undefined {
  if (countryCode) return countryCode;
  if (inferRuRegionalContext(artist, title)) return 'RU';
  return undefined;
}

export type SnippetSource = 'wiki' | 'ddg' | 'web' | 'wikidata' | 'mb';

export interface AggregatedFactContext {
  bundle: ReferenceFactBundle;
  rawSnippets: string[];
  snippetSources: SnippetSource[];
}

export function emptyAggregatedFactContext(): AggregatedFactContext {
  return { bundle: { trackFacts: [], artistFacts: [] }, rawSnippets: [], snippetSources: [] };
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

/** Wikipedia REST lead — grounding anchor; must not be dropped by lineup «boring» heuristics. */
function mergeFactsWithWikiLead(
  wikiLeadFacts: string[],
  ...pools: string[][]
): string[] {
  const merged = mergeFacts(...pools);
  const seen = new Set(merged.map(normalize));
  for (const fact of wikiLeadFacts) {
    const trimmed = fact.trim();
    if (trimmed.length < 35) continue;
    const key = normalize(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.unshift(trimmed);
  }
  return merged.slice(0, 8);
}

function factsAboutTrackOrArtist(
  facts: string[],
  artist: string,
  title: string,
  mode: 'strict' | 'indie' = 'strict',
): string[] {
  return facts.filter(
    (fact) =>
      factAppliesToRequest(fact, artist, title, 'track', mode) ||
      factAppliesToRequest(fact, artist, title, 'artist', mode),
  );
}

function artistSurnameInFact(fact: string, artist: string): boolean {
  const parts = normalize(artist).split(' ').filter((w) => w.length >= 5);
  if (parts.length === 0) return false;
  const factNorm = normalize(fact);
  return parts.some((token) => factNorm.includes(token));
}

function salvageArtistBioFacts(
  candidates: string[],
  artist: string,
  title: string,
): string[] {
  return candidates.filter((fact) => {
    const t = fact.trim();
    if (t.length < 35) return false;
    if (isWebListicleJunk(t)) return false;
    if (artistSurnameInFact(t, artist)) return true;
    if (factMentionsArtist(t, artist)) return true;
    if (
      /^(?:He |She |His |Her |Born |Known professionally|His stage name|Adelmo )/i.test(t) ||
      /\b(?:known professionally as|stage name is|credited as|father of .* blues|blue plaque|commemorating)\b/i.test(t)
    ) {
      return !factNamesForeignEntity(t, artist, title, artist, 'indie');
    }
    return false;
  });
}

function finalizeFactBundle(
  trackCandidates: string[],
  artistCandidates: string[],
  artist: string,
  title: string,
): { trackFacts: string[]; artistFacts: string[]; mode: 'strict' | 'indie' } {
  const merged = [...trackCandidates, ...artistCandidates];
  let scoped = assignFactsToScopes(merged, artist, title, 'strict');
  if (scoped.trackFacts.length + scoped.artistFacts.length === 0) {
    scoped = assignFactsToScopes(merged, artist, title, 'indie');
    if (scoped.trackFacts.length + scoped.artistFacts.length > 0) {
      console.log(
        `[facts] indie relevance fallback for "${artist}" — "${title}": track=${scoped.trackFacts.length} artist=${scoped.artistFacts.length}`,
      );
      return { ...scoped, mode: 'indie' };
    }
    const salvaged = salvageArtistBioFacts(merged, artist, title).slice(0, 4);
    if (salvaged.length > 0) {
      console.log(
        `[facts] artist-bio salvage for "${artist}": ${salvaged.length} fact(s) from wiki/bio sentences`,
      );
      return { trackFacts: [], artistFacts: salvaged, mode: 'indie' };
    }
  }
  return { ...scoped, mode: 'strict' };
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

function mergeWikiBundles(...bundles: ReferenceFactBundle[]): ReferenceFactBundle {
  return {
    trackFacts: mergeFacts(...bundles.map((b) => b.trackFacts)),
    artistFacts: mergeFacts(...bundles.map((b) => b.artistFacts)),
  };
}

export async function fetchWikiBundleMerged(
  artist: string,
  title: string,
  countryCode?: string,
): Promise<ReferenceFactBundle> {
  const cc = resolveFactCountryCode(artist, title, countryCode);
  const primaryLang = cc === 'RU' ? 'RU' : cc ?? 'US';
  const [wikiPrimary, wikiAlt] = await Promise.all([
    fetchWithCap(
      'wiki-primary',
      () => fetchWikipediaBundle(artist, title, primaryLang === 'RU' ? 'RU' : cc),
      EMPTY_WIKI,
      18_000,
    ),
    cc === 'RU'
      ? fetchWithCap(
          'wiki-en-fallback',
          () => fetchWikipediaBundle(artist, title, 'US'),
          EMPTY_WIKI,
          18_000,
        )
      : inferRuRegionalContext(artist, title)
        ? fetchWithCap(
            'wiki-ru-fallback',
            () => fetchWikipediaBundle(artist, title, 'RU'),
            EMPTY_WIKI,
            18_000,
          )
        : primaryLang !== 'RU'
          ? fetchWithCap(
              'wiki-en-fallback',
              () => fetchWikipediaBundle(artist, title, 'US'),
              EMPTY_WIKI,
              18_000,
            )
          : Promise.resolve(EMPTY_WIKI),
  ]);
  return mergeWikiBundles(wikiPrimary, wikiAlt);
}

function wikiLeadToFacts(
  lead: { text: string; lang: 'en' | 'ru' },
  artist: string,
  title: string,
): ReferenceFactBundle {
  const text = lead.text.trim();
  if (!text) return EMPTY_WIKI;
  // Full artist-page lead — band members/places are valid context; use artist scope.
  return { trackFacts: [], artistFacts: [text] };
}

export function buildIndieArtistQueries(artist: string): string[] {
  return [
    `${artist} band biography`,
    `${artist} musician interview history`,
    `${artist} artist discography background`,
  ];
}

/** Последняя попытка для indie: только факты об артисте, без привязки к треку. */
export async function fetchIndieArtistFocusContext(
  artist: string,
  title: string,
  countryCode?: string,
  artistMbid?: string,
): Promise<AggregatedFactContext> {
  const t0 = Date.now();
  const [wikiLead, ddgRaw, webRaw, mbArtistRaw] = await Promise.all([
    fetchArtistWikiLead(artist),
    fetchDuckDuckGoUnfiltered(artist, ''),
    fetchWebSearchFactSnippets(artist, artist),
    fetchMusicBrainzAnnotationsUnfiltered('artist', artistMbid),
  ]);

  const artistCandidates: string[] = [];
  if (wikiLead?.text?.trim()) {
    artistCandidates.push(wikiLead.text.trim().slice(0, 480));
  }
  for (const text of [...ddgRaw, ...webRaw, ...mbArtistRaw]) {
    if (factAppliesToRequest(text, artist, title, 'artist', 'indie')) {
      artistCandidates.push(text);
    }
  }

  const artistFacts = mergeFacts(artistCandidates);
  const finalized = finalizeFactBundle([], artistFacts, artist, title);
  const bundle: ReferenceFactBundle = {
    trackFacts: finalized.trackFacts,
    artistFacts: finalized.artistFacts,
  };

  console.log(
    `[facts] indie artist-only pass "${artist}": ${Date.now() - t0}ms ` +
      `artistFacts=${bundle.artistFacts.length} trackFacts=${bundle.trackFacts.length}`,
  );

  const rawCollected: string[] = [];
  const rawSources: SnippetSource[] = [];
  for (const fact of bundle.artistFacts) pushRaw(rawCollected, rawSources, fact, 'wiki');
  capRaw(rawCollected, rawSources);

  return { bundle, rawSnippets: rawCollected, snippetSources: rawSources };
}

export async function fetchAggregatedFactContext(
  artist: string,
  title: string,
  countryCode?: string,
  recordingMbid?: string,
  artistMbid?: string,
): Promise<AggregatedFactContext> {
  const t0 = Date.now();
  const cc = resolveFactCountryCode(artist, title, countryCode);
  const [wiki, wikiLead, ddgUnfiltered, webUnfiltered, wdUnfiltered, mbTrackRaw, mbArtistRaw] =
    await Promise.all([
      fetchWithCap('wiki', () => fetchWikiBundleMerged(artist, title, cc), EMPTY_WIKI, 14_000),
      fetchWithCap('wiki-lead', () => fetchArtistWikiLead(artist), null, 10_000),
      fetchWithCap('ddg', () => fetchDuckDuckGoUnfiltered(artist, title), [], 12_000),
      fetchWithCap('web', () => fetchWebSearchFactSnippets(artist, title), [], 14_000),
      fetchWithCap('wikidata', () => fetchWikidataUnfiltered(artist, title, cc), [], 10_000),
      fetchWithCap(
        'mb-track',
        () => fetchMusicBrainzAnnotationsUnfiltered('recording', recordingMbid),
        [],
        8_000,
      ),
      fetchWithCap(
        'mb-artist',
        () => fetchMusicBrainzAnnotationsUnfiltered('artist', artistMbid),
        [],
        8_000,
      ),
    ]);
  const wikiLeadBundle = wikiLead ? wikiLeadToFacts(wikiLead, artist, title) : EMPTY_WIKI;
  if (wikiLeadBundle.trackFacts.length + wikiLeadBundle.artistFacts.length > 0) {
    console.log(
      `[facts] wiki-lead ok artist="${artist}" track=${wikiLeadBundle.trackFacts.length} artistFacts=${wikiLeadBundle.artistFacts.length}`,
    );
  }
  const elapsed = Date.now() - t0;
  if (elapsed > FACT_FETCH_BUDGET_MS) {
    console.warn(
      `[facts] parallel fetch took ${elapsed}ms (soft budget ${FACT_FETCH_BUDGET_MS}ms — monitoring only, not a cutoff) ${artist} — ${title}`,
    );
  }
  console.log(
    `[facts] parallel fetch ${artist} — ${title}: ${Date.now() - t0}ms ` +
      `wiki=${wiki.trackFacts.length + wiki.artistFacts.length} ` +
      `wikiLead=${wikiLeadBundle.trackFacts.length + wikiLeadBundle.artistFacts.length} ` +
      `ddg=${ddgUnfiltered.length} web=${webUnfiltered.length}`,
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

  const webRanked = filterAndRankFacts(
    webUnfiltered.filter((f) => factAppliesToRequest(f, artist, title, 'artist', 'indie')),
    4,
  );

  const trackCandidates = mergeFactsWithWikiLead(
    wikiLeadBundle.trackFacts,
    wiki.trackFacts,
    externalSplit.track,
    wdSplit.track,
    mbTrack,
  );
  const artistCandidates = mergeFactsWithWikiLead(
    wikiLeadBundle.artistFacts,
    wiki.artistFacts,
    externalSplit.artist,
    webRanked,
    wdSplit.artist,
    mbArtist,
  );

  const finalized = finalizeFactBundle(trackCandidates, artistCandidates, artist, title);
  let trackFacts = finalized.trackFacts;
  let artistFacts = finalized.artistFacts;

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

  if (rawSnippets.length > 0) {
    console.log(`[facts] raw snippets (${rawSnippets.length}) for ${artist} — ${title}:`);
    for (let i = 0; i < Math.min(5, rawSnippets.length); i++) {
      const src = snippetSources[i] ?? '?';
      const preview = rawSnippets[i]!.replace(/\s+/g, ' ').slice(0, 90);
      console.log(`[facts]   ${i + 1}. [${src}] ${preview}${rawSnippets[i]!.length > 90 ? '…' : ''}`);
    }
  }

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
