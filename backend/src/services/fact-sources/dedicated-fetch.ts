import type { FactScope, ReferenceFactBundle } from '../fact-picker.js';
import {
  factAppliesToRequest,
  factMentionsArtist,
  factMentionsOtherTrackTitle,
  factMentionsTitle,
  factNamesForeignEntity,
  hasTrackContextSignal,
} from '../fact-relevance.js';
import { rejectSeedForTrackStory } from '../fact-track-anchor.js';
import { poolHasTopicDuplicate } from '../fact-topic.js';
import {
  interestScore,
  isAlbumListingSeed,
  isCatalogMetadataSeed,
  isTrackDurationCatalogSeed,
} from '../reference-fact-quality.js';
import { isTruncatedMarketingSnippet } from '../web-snippet-accept.js';
import type { HarvestContext, HarvestedFact, HarvestSource } from './types.js';
import { isParserTrustedHarvestSource } from './types.js';
import { fetchGeniusFacts } from './genius-facts.js';
import { fetchSongfactsFacts } from './songfacts-facts.js';
import { fetchLastfmFacts } from './lastfm-facts.js';
import { fetchWhoSampledFacts } from './whosampled-facts.js';
import { fetchSecondHandSongsFacts } from './secondhandsongs-facts.js';
import { fetchSetlistfmFacts } from './setlistfm-facts.js';
import { fetchRapRuFacts } from './rap-ru-facts.js';
import { fetchTheFlowFacts } from './the-flow-facts.js';

const SOURCE_TIMEOUT_MS = 11_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  } catch {
    return null;
  }
}

type SourceFetcher = (ctx: HarvestContext) => Promise<HarvestedFact[]>;

const ALL_SOURCES: Array<{ source: HarvestSource; fetch: SourceFetcher }> = [
  { source: 'lastfm', fetch: fetchLastfmFacts },
  { source: 'genius', fetch: fetchGeniusFacts },
  { source: 'songfacts', fetch: fetchSongfactsFacts },
  { source: 'whosampled', fetch: fetchWhoSampledFacts },
  { source: 'secondhandsongs', fetch: fetchSecondHandSongsFacts },
  { source: 'setlistfm', fetch: fetchSetlistfmFacts },
  { source: 'rap-ru', fetch: fetchRapRuFacts },
  { source: 'the-flow', fetch: fetchTheFlowFacts },
];

function dedupeFacts(facts: HarvestedFact[]): HarvestedFact[] {
  const seen = new Set<string>();
  const out: HarvestedFact[] = [];
  for (const item of facts) {
    const key = item.fact.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Last.fm + Genius + Setlist.fm + … — same parsers as bulk seed (all parallel). */
export async function fetchDedicatedSourceFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  const collected: HarvestedFact[] = [];

  const results = await Promise.allSettled(
    ALL_SOURCES.map(async ({ source, fetch }) => {
      const items = await withTimeout(fetch(ctx), SOURCE_TIMEOUT_MS);
      return (items ?? []).map((f) => ({ ...f, source }));
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') collected.push(...result.value);
  }

  return dedupeFacts(collected);
}

function normalizeKey(fact: string): string {
  return fact.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** Parser-trusted relevance — не режем Genius/Last.fm через isBoringFact. */
function dedicatedFactRelevant(
  fact: string,
  scope: FactScope,
  artist: string,
  title: string,
): boolean {
  const trimmed = fact.trim();
  if (trimmed.length < 35 || isTruncatedMarketingSnippet(trimmed)) return false;
  if (isAlbumListingSeed(trimmed)) return false;
  if (rejectSeedForTrackStory(trimmed, artist, title)) return false;
  if (/multiple artists tracked as/i.test(trimmed)) return false;
  if (factNamesForeignEntity(trimmed, artist, title, artist, 'indie')) return false;

  const trackScope: 'track' | 'artist' = scope === 'artist' ? 'artist' : 'track';
  if (factAppliesToRequest(trimmed, artist, title, trackScope, 'indie')) return true;
  if (trackScope === 'track') {
    if (factMentionsTitle(trimmed, title)) return true;
    if (hasTrackContextSignal(trimmed) && !factMentionsOtherTrackTitle(trimmed, title)) return true;
  }
  if (trackScope === 'artist' && factMentionsArtist(trimmed, artist)) return true;
  if (trackScope === 'artist' && artist.trim().length >= 3) {
    const artistLc = artist.trim().toLowerCase();
    if (trimmed.toLowerCase().includes(artistLc)) return true;
  }
  return false;
}

/** Genius/Last.fm/Discogs/Setlist — уже привязаны к artist/title парсером. */
function parserTrustedDedicatedRelevant(
  item: HarvestedFact,
  artist: string,
  title: string,
): boolean {
  const trimmed = item.fact.trim();
  if (trimmed.length < 35 || isTruncatedMarketingSnippet(trimmed)) return false;
  if (isAlbumListingSeed(trimmed)) return false;
  if (rejectSeedForTrackStory(trimmed, artist, title)) return false;
  if (/multiple artists tracked as/i.test(trimmed)) return false;
  if (/creativecommons|user-contributed text is available/i.test(trimmed)) return false;
  if (item.scope === 'artist') {
    if (item.source === 'discogs' || item.source === 'lastfm') return true;
    return factMentionsArtist(trimmed, artist);
  }
  if (item.scope === 'track' && item.source === 'lastfm') return true;
  if (factMentionsTitle(trimmed, title)) return true;
  if (factMentionsArtist(trimmed, artist)) return true;
  return false;
}

/** Dedicated parsers → bundle без strict/boring-фильтра wiki/web. */
export function dedicatedHarvestToBundle(
  harvest: HarvestedFact[],
  artist: string,
  title: string,
): ReferenceFactBundle {
  const trackFacts: string[] = [];
  const artistFacts: string[] = [];
  const seen = new Set<string>();

  const sorted = [...harvest].sort((a, b) => {
    const aTitle = factMentionsTitle(a.fact, title) ? 1 : 0;
    const bTitle = factMentionsTitle(b.fact, title) ? 1 : 0;
    if (aTitle !== bTitle) return bTitle - aTitle;
    const aCatalog =
      isTrackDurationCatalogSeed(a.fact) || isCatalogMetadataSeed(a.fact) || isAlbumListingSeed(a.fact)
        ? 0
        : 1;
    const bCatalog =
      isTrackDurationCatalogSeed(b.fact) || isCatalogMetadataSeed(b.fact) || isAlbumListingSeed(b.fact)
        ? 0
        : 1;
    if (aCatalog !== bCatalog) return bCatalog - aCatalog;
    const aTrack = a.scope === 'track' ? 1 : 0;
    const bTrack = b.scope === 'track' ? 1 : 0;
    if (aTrack !== bTrack) return bTrack - aTrack;
    return interestScore(b.fact) - interestScore(a.fact);
  });
  const acceptedFacts: string[] = [];

  for (const item of sorted) {
    const key = normalizeKey(item.fact);
    if (seen.has(key)) continue;
    const relevant = isParserTrustedHarvestSource(item.source)
      ? parserTrustedDedicatedRelevant(item, artist, title)
      : dedicatedFactRelevant(item.fact, item.scope, artist, title);
    if (!relevant) continue;
    if (poolHasTopicDuplicate(item.fact, acceptedFacts)) continue;
    seen.add(key);
    acceptedFacts.push(item.fact);
    if (item.scope === 'artist') {
      if (artistFacts.length < 5) artistFacts.push(item.fact);
    } else if (trackFacts.length < 8) {
      trackFacts.push(item.fact);
    }
  }

  return { trackFacts, artistFacts };
}

export function dedicatedFactsBySource(facts: HarvestedFact[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of facts) {
    counts[f.source] = (counts[f.source] ?? 0) + 1;
  }
  return counts;
}
