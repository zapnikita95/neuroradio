import fetch from '../proxy-fetch.js';
import type { ReferenceFactBundle } from './fact-picker.js';
import {
  assignFactsToScopes,
  factAppliesToRequest,
  factMentionsArtist,
  factMentionsArtistLoose,
  factMentionsTitle,
  factNamesForeignEntity,
  hasTrackContextSignal,
  isWebListicleJunk,
} from './fact-relevance.js';
import { filterAndRankFacts, interestScore, isArtistDisambiguationListSeed, isArtistFormationBioSeed, isEncyclopediaDefinitionSeed, isListeningStatsFact } from './reference-fact-quality.js';
import { rejectSeedForTrackStory } from './fact-track-anchor.js';
import { WEAK_TRIVIA_PATTERNS } from './story-fact-hunt.js';
import { fetchReferenceFactBundle as fetchWikipediaBundle, fetchFastTrackWikiFacts } from './wikipedia-facts.js';
import { fetchArtistWikiLead, fetchArtistWikiLeadWithRetry } from './wikipedia-lead.js';
import { inferRuRegionalContext } from './metadata-facts.js';
import {
  buildDdgInstantQueries,
  fetchBackstoryWebSnippets,
  fetchDeepWebSearchSnippets,
  fetchArtistIdentityWebSnippets,
  fetchIndieArtistWebSnippets,
  fetchTitleFirstWebSnippets,
  fetchWebSearchFactSnippets,
  webSnippetsNeedDeepSearch,
} from './web-search-facts.js';

export { buildDdgInstantQueries } from './web-search-facts.js';
import { acceptSearchGroundedSnippet, acceptIndieEmergingSnippet, hasActionableSnippets, isLyricsPageSeed, isWrongEntityDisambiguation, isArtistIdentityBioSnippet } from './web-snippet-accept.js';
import { artistHasSearchAliases } from './artist-search-aliases.js';
import { lookupCuratedFact } from './curated-facts.js';
import {
  dedicatedFactsBySource,
  dedicatedHarvestToBundle,
  fetchDedicatedSourceFacts,
} from './fact-sources/dedicated-fetch.js';
import { fetchDiscogsArtistFacts, fetchDiscogsLiveFacts } from './fact-sources/discogs-facts.js';
import type { HarvestSource } from './fact-sources/types.js';
import { factFitsStoryLanguage, filterBundleForStoryLanguage } from './fact-language-fit.js';
import { resolveStoryLanguage, type StoryLanguageId } from './story-language.js';
import { primaryHarvestLookupTitle } from './title-harvest-variants.js';
const USER_AGENT = 'MusicStoryBFF/1.0 (contact@example.com)';
const RAW_SNIPPET_MIN_LEN = 30;
const RAW_SNIPPET_MAX = 18;
/** Весь параллельный сбор фактов — иначе трек уже сменился. */
const FACT_FETCH_BUDGET_MS = parseInt(process.env.FACT_FETCH_TIMEOUT_MS ?? '12000', 10);
const FACT_FETCH_HARD_CAP_MS = parseInt(process.env.FACT_FETCH_HARD_CAP_MS ?? '9000', 10);
/** Per-source caps in parallel harvest (all run at once; wall time ≈ max of caps). */
const FACT_WIKI_CAP_MS = parseInt(process.env.FACT_WIKI_CAP_MS ?? '7000', 10);
const FACT_WIKI_FAST_CAP_MS = parseInt(process.env.FACT_WIKI_FAST_CAP_MS ?? '12000', 10);
const FACT_WEB_CAP_MS = parseInt(process.env.FACT_WEB_CAP_MS ?? '8000', 10);
const FACT_DEDICATED_CAP_MS = parseInt(process.env.FACT_DEDICATED_CAP_MS ?? '8000', 10);

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

export type SnippetSource =
  | 'wiki'
  | 'ddg'
  | 'web'
  | 'wikidata'
  | 'mb'
  | HarvestSource;

export interface AggregatedFactContext {
  bundle: ReferenceFactBundle;
  rawSnippets: string[];
  snippetSources: SnippetSource[];
  /** Deep HTML search (site:/lyrics) already merged into rawSnippets. */
  deepWebSearchRan?: boolean;
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

function salvageWebSearchSnippets(
  webSnippets: string[],
  artist: string,
  title: string,
  relaxed = false,
): ReferenceFactBundle {
  const track: string[] = [];
  const artistFacts: string[] = [];
  const seen = new Set<string>();

  for (const raw of webSnippets) {
    const snippet = raw.trim();
    if (snippet.length < 35) continue;
    const key = normalize(snippet);
    if (seen.has(key)) continue;
    const accepted = relaxed
      ? acceptIndieEmergingSnippet(snippet, artist, title)
      : acceptSearchGroundedSnippet(snippet, artist, title);
    if (!accepted) continue;
    seen.add(key);

    if (hasTrackContextSignal(snippet) || factMentionsTitle(snippet, title)) {
      track.push(snippet);
    } else {
      artistFacts.push(snippet);
    }
  }

  return {
    trackFacts: filterAndRankFacts(track, 4),
    artistFacts: filterAndRankFacts(artistFacts, 3),
  };
}

function mergeFacts(...pools: string[][]): string[] {
  return filterAndRankFacts(pools.flat(), 8);
}

/** Dedicated parsers — не прогонять через isBoringFact повторно. */
function mergeDedicatedFacts(base: string[], dedicated: string[], max = 10): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const fact of [...dedicated, ...base]) {
    const trimmed = fact.trim();
    if (trimmed.length < 35) continue;
    const key = normalize(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
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
  const parts = normalize(artist).split(' ').filter((w) => w.length >= 4);
  if (parts.length === 0) return false;
  const factNorm = normalize(fact);
  return parts.some((token) => factNorm.includes(token));
}

function shouldFetchArtistIdentitySnippets(
  webSnippets: string[],
  artistFacts: string[],
  artist: string,
): boolean {
  if (artistFacts.length > 0) return false;
  if (
    webSnippets.some(
      (s) => isArtistIdentityBioSnippet(s) && factMentionsArtistLoose(s, artist),
    )
  ) {
    return false;
  }
  const nonLyricsArtist = webSnippets.filter(
    (s) =>
      factMentionsArtistLoose(s, artist) &&
      !isLyricsPageSeed(s) &&
      !/\b(?:текст\s+песни|lyrics|song lyrics|слушать онлайн|watch on youtube)\b/i.test(s),
  );
  return nonLyricsArtist.length < 2;
}

async function mergeArtistIdentitySnippets(
  artist: string,
  title: string,
  webSnippets: string[],
  artistFacts: string[],
  trackFacts: string[],
): Promise<{ webSnippets: string[]; artistFacts: string[]; trackFacts: string[] }> {
  const hasStrongTrackFacts = trackFacts.some((f) => interestScore(f) >= 10);
  if (hasStrongTrackFacts) {
    return { webSnippets, artistFacts, trackFacts };
  }
  if (!shouldFetchArtistIdentitySnippets(webSnippets, artistFacts, artist)) {
    return { webSnippets, artistFacts, trackFacts };
  }
  const identity = await fetchWithCap(
    'web-artist-id',
    () => fetchArtistIdentityWebSnippets(artist),
    [],
    4000,
  );
  if (identity.length === 0) {
    return { webSnippets, artistFacts, trackFacts };
  }
  const mergedWeb = [...new Set([...webSnippets, ...identity])];
  const salvaged = salvageWebSearchSnippets(identity, artist, title, true);
  console.log(
    `[facts] artist-identity search "${artist}": +${identity.length} snippets ` +
      `artistFacts=${salvaged.artistFacts.length}`,
  );
  return {
    webSnippets: mergedWeb,
    artistFacts: mergeFacts(artistFacts, salvaged.artistFacts),
    trackFacts,
  };
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
    if (isEncyclopediaDefinitionSeed(t)) return false;
    if (isArtistDisambiguationListSeed(t)) return false;
    if (isArtistFormationBioSeed(t)) return false;
    if (/debut single check/i.test(t)) return false;
    if (isArtistIdentityBioSnippet(t)) return false;
    if (artistHasSearchAliases(artist) && /\b(?:born|родился|known professionally as|stage name)\b/i.test(t)) {
      return false;
    }
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
  if (isListeningStatsFact(trimmed)) return;
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
  dedicatedRaw: Array<{ fact: string; source: SnippetSource }>,
  artist: string,
  title: string,
): { rawSnippets: string[]; snippetSources: SnippetSource[] } {
  const candidates: Array<{ text: string; source: SnippetSource; score: number }> = [];

  const addCandidate = (text: string, source: SnippetSource) => {
    const trimmed = text.trim();
    if (trimmed.length < RAW_SNIPPET_MIN_LEN) return;
    if (isListeningStatsFact(trimmed)) return;
    if (WEAK_TRIVIA_PATTERNS.some((p) => p.test(trimmed))) return;
    if (isLyricsPageSeed(trimmed) || isWrongEntityDisambiguation(trimmed, artist)) return;
    candidates.push({ text: trimmed.slice(0, 480), source, score: interestScore(trimmed) });
  };

  for (const fact of [...wiki.trackFacts, ...wiki.artistFacts]) addCandidate(fact, 'wiki');
  for (const text of ddgRaw) addCandidate(text, 'ddg');
  for (const text of webRaw) addCandidate(text, 'web');
  for (const text of wdRaw) addCandidate(text, 'wikidata');
  for (const text of [...mbTrackRaw, ...mbArtistRaw]) addCandidate(text, 'mb');
  for (const { fact, source } of dedicatedRaw) addCandidate(fact, source);

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
  options: { storyLanguage?: 'ru' | 'en' } = {},
): Promise<ReferenceFactBundle> {
  const cc = resolveFactCountryCode(artist, title, countryCode);
  const preferEn = options.storyLanguage === 'en';
  const primaryLang = preferEn ? 'US' : cc === 'RU' ? 'RU' : cc ?? 'US';
  const [wikiPrimary, wikiAlt] = await Promise.all([
    fetchWithCap(
      'wiki-primary',
      () => fetchWikipediaBundle(artist, title, primaryLang === 'RU' ? 'RU' : cc),
      EMPTY_WIKI,
      FACT_WIKI_CAP_MS,
    ),
    cc === 'RU'
      ? fetchWithCap(
          'wiki-en-fallback',
          () => fetchWikipediaBundle(artist, title, 'US'),
          EMPTY_WIKI,
          Math.min(FACT_WIKI_CAP_MS, 5000),
        )
      : inferRuRegionalContext(artist, title)
        ? fetchWithCap(
            'wiki-ru-fallback',
            () => fetchWikipediaBundle(artist, title, 'RU'),
            EMPTY_WIKI,
            Math.min(FACT_WIKI_CAP_MS, 5000),
          )
        : primaryLang !== 'RU'
          ? fetchWithCap(
              'wiki-en-fallback',
              () => fetchWikipediaBundle(artist, title, 'US'),
              EMPTY_WIKI,
              Math.min(FACT_WIKI_CAP_MS, 5000),
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

/** Быстрый Discogs-only fallback (~3–6 с) — до тяжёлого retry wiki/web. */
export async function fetchDiscogsFactFallback(
  artist: string,
  title: string,
  countryCode?: string,
): Promise<AggregatedFactContext | null> {
  const harvest = await fetchWithCap(
    'discogs-fallback',
    () => fetchDiscogsLiveFacts({ artist, title, countryCode }),
    [],
    10_000,
  );
  if (harvest.length === 0) return null;
  const bundle = dedicatedHarvestToBundle(harvest, artist, title);
  if (bundle.trackFacts.length + bundle.artistFacts.length === 0) return null;
  console.log(
    `[facts] discogs fallback "${artist}" — "${title}": ` +
      `track=${bundle.trackFacts.length} artist=${bundle.artistFacts.length}`,
  );
  const rawSnippets = harvest.map((f) => f.fact);
  return {
    bundle,
    rawSnippets,
    snippetSources: harvest.map((f) => f.source as SnippetSource),
  };
}

/** Последняя попытка для indie: только факты об артисте, без привязки к треку. */
export async function fetchIndieArtistFocusContext(
  artist: string,
  title: string,
  countryCode?: string,
  artistMbid?: string,
): Promise<AggregatedFactContext> {
  const t0 = Date.now();
  const discogsArtist = await fetchWithCap(
    'discogs-artist',
    () => fetchDiscogsArtistFacts(artist),
    [],
    8_000,
  );
  const discogsBundle = dedicatedHarvestToBundle(discogsArtist, artist, title);
  if (discogsBundle.artistFacts.length > 0) {
    console.log(
      `[facts] indie discogs artist hit "${artist}": ${discogsBundle.artistFacts.length} fact(s) ${Date.now() - t0}ms`,
    );
    return {
      bundle: discogsBundle,
      rawSnippets: discogsBundle.artistFacts,
      snippetSources: discogsBundle.artistFacts.map(() => 'discogs' as SnippetSource),
    };
  }

  const [wikiLead, ddgRaw, webRaw, mbArtistRaw] = await Promise.all([
    fetchArtistWikiLead(artist),
    fetchDuckDuckGoUnfiltered(artist, title),
    fetchIndieArtistWebSnippets(artist, title),
    fetchMusicBrainzAnnotationsUnfiltered('artist', artistMbid),
  ]);
  let webAll = webRaw;
  if (webSnippetsNeedDeepSearch(webAll, artist, title)) {
    const deep = await fetchDeepWebSearchSnippets(artist, title);
    webAll = [...new Set([...webAll, ...deep])];
  }

  const artistCandidates: string[] = [];
  if (wikiLead?.text?.trim()) {
    artistCandidates.push(wikiLead.text.trim().slice(0, 480));
  }
  for (const text of [...ddgRaw, ...webAll, ...mbArtistRaw]) {
    if (
      factAppliesToRequest(text, artist, title, 'artist', 'indie') ||
      acceptIndieEmergingSnippet(text, artist, title)
    ) {
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
  options: { storyLanguage?: 'ru' | 'en' } = {},
): Promise<AggregatedFactContext> {
  const t0 = Date.now();
  const lookupTitle = primaryHarvestLookupTitle(title);
  const cc = resolveFactCountryCode(artist, lookupTitle, countryCode);
  const harvestCtx = { artist, title: lookupTitle, countryCode: cc };
  if (lookupTitle !== title.trim()) {
    console.log(`[facts] title lookup variant "${title}" → "${lookupTitle}"`);
  }
  // Phase 1: dedicated + Discogs параллельно с wiki/web (Discogs ~3–6 с, не ждём конца wiki).
  const dedicatedPromise = fetchWithCap(
    'dedicated',
    () => fetchDedicatedSourceFacts(harvestCtx),
    [],
    FACT_DEDICATED_CAP_MS,
  );
  const discogsPromise = fetchWithCap(
    'discogs',
    () => fetchDiscogsLiveFacts(harvestCtx),
    [],
    FACT_DEDICATED_CAP_MS,
  );
  const [wiki, wikiLead, ddgUnfiltered, webUnfiltered, webTitleFirst, wdUnfiltered, mbTrackRaw, mbArtistRaw, wikiFastTrack, dedicatedHarvest, discogsHarvest] =
    await Promise.all([
      fetchWithCap(
        'wiki',
        () => fetchWikiBundleMerged(artist, lookupTitle, cc, options),
        EMPTY_WIKI,
        FACT_WIKI_CAP_MS + 500,
      ),
      fetchWithCap('wiki-lead', () => fetchArtistWikiLeadWithRetry(artist, 1), null, 6000),
      fetchWithCap('ddg', () => fetchDuckDuckGoUnfiltered(artist, lookupTitle), [], 6000),
      fetchWithCap('web', () => fetchWebSearchFactSnippets(artist, lookupTitle), [], FACT_WEB_CAP_MS),
      fetchWithCap('web-title', () => fetchTitleFirstWebSnippets(lookupTitle), [], 6000),
      fetchWithCap('wikidata', () => fetchWikidataUnfiltered(artist, lookupTitle, cc), [], 6000),
      fetchWithCap(
        'mb-track',
        () => fetchMusicBrainzAnnotationsUnfiltered('recording', recordingMbid),
        [],
        6000,
      ),
      fetchWithCap(
        'mb-artist',
        () => fetchMusicBrainzAnnotationsUnfiltered('artist', artistMbid),
        [],
        6000,
      ),
      fetchWithCap('wiki-fast-track', () => fetchFastTrackWikiFacts(artist, lookupTitle), [], FACT_WIKI_FAST_CAP_MS),
      dedicatedPromise,
      discogsPromise,
    ]);
  const combinedDedicated = [...dedicatedHarvest, ...discogsHarvest];
  if (discogsHarvest.length > 0) {
    console.log(
      `[facts] discogs ok artist="${artist}" title="${title}" count=${discogsHarvest.length}`,
    );
  }
  const dedicatedTrack = combinedDedicated
    .filter((f) => f.scope === 'track' || f.scope === 'album')
    .map((f) => f.fact);
  const dedicatedArtist = combinedDedicated
    .filter((f) => f.scope === 'artist')
    .map((f) => f.fact);
  if (combinedDedicated.length > 0) {
    const bySrc = dedicatedFactsBySource(combinedDedicated);
    console.log(
      `[facts] dedicated ok artist="${artist}" title="${title}" ` +
        `track=${dedicatedTrack.length} artist=${dedicatedArtist.length} ` +
        `bySource=${JSON.stringify(bySrc)}`,
    );
  }
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
  let webAllUnfiltered = [...webUnfiltered, ...webTitleFirst];
  let deepWebSearchRan = false;
  if (webSnippetsNeedDeepSearch(webAllUnfiltered, artist, title)) {
    const deepWeb = await fetchDeepWebSearchSnippets(artist, lookupTitle);
    deepWebSearchRan = true;
    if (deepWeb.length > 0) {
      webAllUnfiltered = [...new Set([...webAllUnfiltered, ...deepWeb])];
      console.log(
        `[facts] deep web-search merged for "${artist}" — "${title}": +${deepWeb.length} snippets total=${webAllUnfiltered.length}`,
      );
    }
  }
  console.log(
    `[facts] parallel fetch ${artist} — ${title}: ${Date.now() - t0}ms ` +
      `wiki=${wiki.trackFacts.length + wiki.artistFacts.length} ` +
      `wikiLead=${wikiLeadBundle.trackFacts.length + wikiLeadBundle.artistFacts.length} ` +
      `ddg=${ddgUnfiltered.length} web=${webAllUnfiltered.length} dedicated=${dedicatedHarvest.length} discogs=${discogsHarvest.length}`,
  );

  const ddg = filterAndRankFacts([...ddgUnfiltered, ...webAllUnfiltered], 10);
  const wikidata = filterAndRankFacts(wdUnfiltered, 5);
  const mbTrack = filterAndRankFacts(mbTrackRaw, 4);
  const mbArtist = filterAndRankFacts(mbArtistRaw, 4);

  const externalFiltered = factsAboutTrackOrArtist(ddg, artist, title);
  const wdFiltered = factsAboutTrackOrArtist(wikidata, artist, title);
  const wdSplit = splitByMention(wdFiltered, title, artist);
  const webInBundle = webAllUnfiltered.filter((f) => externalFiltered.includes(f));
  const ddgOnly = externalFiltered.filter((f) => !webInBundle.includes(f));
  const externalSplit = splitByMention([...ddgOnly, ...webInBundle], title, artist);

  const webRanked = filterAndRankFacts(
    webAllUnfiltered.filter((f) => factAppliesToRequest(f, artist, title, 'artist', 'indie')),
    4,
  );

  const trackCandidates = mergeFactsWithWikiLead(
    wikiLeadBundle.trackFacts,
    wiki.trackFacts,
    wikiFastTrack,
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

  if (trackFacts.length + artistFacts.length === 0 && webAllUnfiltered.length > 0) {
    let salvaged = salvageWebSearchSnippets(webAllUnfiltered, artist, title);
    if (salvaged.trackFacts.length + salvaged.artistFacts.length === 0) {
      salvaged = salvageWebSearchSnippets(webAllUnfiltered, artist, title, true);
      if (salvaged.trackFacts.length + salvaged.artistFacts.length > 0) {
        console.log(
          `[facts] indie web-search salvage for "${artist}" — "${title}": track=${salvaged.trackFacts.length} artist=${salvaged.artistFacts.length}`,
        );
      }
    } else {
      console.log(
        `[facts] web-search salvage for "${artist}" — "${title}": track=${salvaged.trackFacts.length} artist=${salvaged.artistFacts.length}`,
      );
    }
    trackFacts = salvaged.trackFacts;
    artistFacts = salvaged.artistFacts;
  }

  const identityMerged = await mergeArtistIdentitySnippets(
    artist,
    title,
    webAllUnfiltered,
    artistFacts,
    trackFacts,
  );
  webAllUnfiltered = identityMerged.webSnippets;
  artistFacts = identityMerged.artistFacts;
  trackFacts = identityMerged.trackFacts;

  const dedicatedBundle = dedicatedHarvestToBundle(combinedDedicated, artist, title);
  if (dedicatedBundle.trackFacts.length + dedicatedBundle.artistFacts.length > 0) {
    trackFacts = mergeDedicatedFacts(trackFacts, dedicatedBundle.trackFacts, 8);
    artistFacts = mergeDedicatedFacts(artistFacts, dedicatedBundle.artistFacts, 6);
    console.log(
      `[facts] dedicated bundle merged "${artist}" — "${title}": ` +
        `track=${dedicatedBundle.trackFacts.length} artist=${dedicatedBundle.artistFacts.length} ` +
        `(total track=${trackFacts.length} artist=${artistFacts.length})`,
    );
  }

  if (wikiFastTrack.length > 0) {
    const fastTrackFacts = wikiFastTrack.filter(
      (f) => !rejectSeedForTrackStory(f, artist, title, { trackPoolFacts: trackFacts }),
    );
    if (fastTrackFacts.length > 0) {
      trackFacts = mergeDedicatedFacts(trackFacts, fastTrackFacts, 6);
      console.log(
        `[facts] wiki-fast-track merged "${artist}" — "${title}": +${fastTrackFacts.length} track fact(s)`,
      );
    }
  }

  if (trackFacts.length + artistFacts.length === 0) {
    console.warn(
      `[facts] no validated facts for "${artist}" — "${title}" after relevance filter`,
    );
  }

  const bundle: ReferenceFactBundle = { trackFacts, artistFacts };
  const { rawSnippets, snippetSources } = buildRawSnippets(
    wiki,
    ddgUnfiltered,
    webAllUnfiltered,
    wdUnfiltered,
    mbTrackRaw,
    mbArtistRaw,
    combinedDedicated.map((f) => ({ fact: f.fact, source: f.source })),
    artist,
    title,
  );

  const storyLanguage: StoryLanguageId = resolveStoryLanguage(options.storyLanguage);
  const langBundle = filterBundleForStoryLanguage(bundle, storyLanguage);
  const langRawSnippets = rawSnippets.filter((s) => factFitsStoryLanguage(s, storyLanguage));
  const langSnippetSources = snippetSources.filter((_, i) =>
    factFitsStoryLanguage(rawSnippets[i] ?? '', storyLanguage),
  );

  if (langRawSnippets.length > 0) {
    console.log(`[facts] raw snippets (${langRawSnippets.length}) for ${artist} — ${title}:`);
    for (let i = 0; i < Math.min(5, langRawSnippets.length); i++) {
      const src = langSnippetSources[i] ?? '?';
      const preview = langRawSnippets[i]!.replace(/\s+/g, ' ').slice(0, 90);
      console.log(`[facts]   ${i + 1}. [${src}] ${preview}${langRawSnippets[i]!.length > 90 ? '…' : ''}`);
    }
  }

  return {
    bundle: langBundle,
    rawSnippets: langRawSnippets,
    snippetSources: langSnippetSources,
    deepWebSearchRan,
  };
}
export async function fetchEmergencyFactRescue(
  artist: string,
  title: string,
  existingSnippets: string[] = [],
): Promise<AggregatedFactContext> {
  const curated = lookupCuratedFact(artist, title);
  if (curated) {
    console.log(`[facts] emergency curated hit "${artist}" — "${title}"`);
    const bundle: ReferenceFactBundle =
      curated.scope === 'track'
        ? { trackFacts: [curated.fact], artistFacts: [] }
        : { trackFacts: [], artistFacts: [curated.fact] };
    return {
      bundle,
      rawSnippets: [curated.fact],
      snippetSources: ['wiki'],
    };
  }

  console.log(`[facts] emergency rescue for "${artist}" — "${title}"`);
  const discogsRescue = await fetchWithCap(
    'discogs-rescue',
    () => fetchDiscogsLiveFacts({ artist, title }),
    [],
    10_000,
  );
  const discogsBundle = dedicatedHarvestToBundle(discogsRescue, artist, title);
  if (discogsBundle.trackFacts.length + discogsBundle.artistFacts.length > 0) {
    console.log(
      `[facts] emergency discogs rescue "${artist}" — "${title}": ` +
        `track=${discogsBundle.trackFacts.length} artist=${discogsBundle.artistFacts.length}`,
    );
    return {
      bundle: discogsBundle,
      rawSnippets: discogsRescue.map((f) => f.fact),
      snippetSources: discogsRescue.map((f) => f.source as SnippetSource),
    };
  }

  const junkOnly =
    existingSnippets.length > 0 && !hasActionableSnippets(existingSnippets, artist, title);
  const [wikiFast, webBack, titleFirst, webDeep, artistIdentity] = await Promise.all([
    fetchFastTrackWikiFacts(artist, title),
    junkOnly || existingSnippets.length < 3
      ? fetchBackstoryWebSnippets(artist, title)
      : Promise.resolve([]),
    fetchTitleFirstWebSnippets(title),
    junkOnly || existingSnippets.length < 4
      ? fetchDeepWebSearchSnippets(artist, title)
      : Promise.resolve([]),
    fetchArtistIdentityWebSnippets(artist),
  ]);

  const webRescue = [...new Set([...webBack, ...titleFirst, ...webDeep, ...artistIdentity])];

  const trackFacts = mergeFacts(wikiFast);
  let artistFacts: string[] = [];
  const salvaged =
    trackFacts.length > 0
      ? { trackFacts, artistFacts: [] as string[] }
      : salvageWebSearchSnippets(webRescue, artist, title, true);

  const bundle: ReferenceFactBundle = {
    trackFacts: salvaged.trackFacts.length > 0 ? salvaged.trackFacts : trackFacts,
    artistFacts: salvaged.artistFacts.length > 0 ? salvaged.artistFacts : artistFacts,
  };

  const rawSnippets = [...new Set([...existingSnippets, ...webRescue, ...wikiFast])].slice(0, 14);
  console.log(
    `[facts] emergency rescue result "${artist}" — "${title}": track=${bundle.trackFacts.length} artist=${bundle.artistFacts.length} snippets=${rawSnippets.length}`,
  );
  return { bundle, rawSnippets, snippetSources: rawSnippets.map(() => 'web' as SnippetSource) };
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
