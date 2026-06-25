import { fetchAggregatedFactContext } from '../fact-aggregator.js';
import { factAppliesToRequest, factMentionsArtist } from '../fact-relevance.js';
import { harvestTitleVariants } from '../title-harvest-variants.js';
import { fetchArtistWikiLeadWithRetry } from '../wikipedia-lead.js';
import type { HarvestContext, HarvestedFact } from './types.js';
import { fetchGeniusFacts } from './genius-facts.js';
import { fetchSongfactsFacts } from './songfacts-facts.js';
import { fetchLastfmFacts } from './lastfm-facts.js';
import { fetchWhoSampledFacts } from './whosampled-facts.js';
import { fetchSecondHandSongsFacts } from './secondhandsongs-facts.js';
import { fetchSetlistfmFacts } from './setlistfm-facts.js';
import { fetchRapRuFacts } from './rap-ru-facts.js';
import { fetchTheFlowFacts } from './the-flow-facts.js';
import { fetchDiscogsFacts } from './discogs-facts.js';
import { fetchMusixmatchFacts } from './musixmatch-facts.js';
import { fetchDedicatedSourceFacts } from './dedicated-fetch.js';
import { isListeningStatsFact } from '../reference-fact-quality.js';

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

function mergeCollected(base: HarvestedFact[], extra: HarvestedFact[]): HarvestedFact[] {
  return dedupeFacts([...base, ...extra]);
}

/** Bulk harvest: dedicated parsers first, then aggregator; artist wiki if track empty. */
function filterForBulk(facts: HarvestedFact[], ctx: HarvestContext): HarvestedFact[] {
  return facts.filter((f) => {
    const trimmed = f.fact.trim();
    if (trimmed.length < 35) return false;
    if (isListeningStatsFact(trimmed)) return false;
    if (f.scope === 'artist') {
      return factMentionsArtist(trimmed, ctx.artist) || factAppliesToRequest(trimmed, ctx.artist, ctx.title, 'artist', 'indie');
    }
    if (f.scope === 'album') {
      return (
        factMentionsArtist(trimmed, ctx.artist) ||
        factAppliesToRequest(trimmed, ctx.artist, ctx.title, 'track', 'indie')
      );
    }
    return factAppliesToRequest(trimmed, ctx.artist, ctx.title, f.scope, 'indie');
  });
}

async function artistWikiFallback(ctx: HarvestContext): Promise<HarvestedFact[]> {
  const lead = await fetchArtistWikiLeadWithRetry(ctx.artist, 3);
  if (!lead?.text?.trim() || lead.text.trim().length < 80) return [];
  return [{ fact: lead.text.trim().slice(0, 520), scope: 'artist', source: 'wiki' }];
}

/** Parallel harvest: dedicated + aggregator + artist fallback when track is empty. */
export async function harvestAllFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  let collected: HarvestedFact[] = [];

  const titles = harvestTitleVariants(ctx.title);
  for (let i = 0; i < titles.length; i++) {
    const subCtx = i === 0 ? ctx : { ...ctx, title: titles[i]! };
    const dedicated = await fetchDedicatedSourceFacts(subCtx);
    collected = mergeCollected(collected, dedicated);
    const hasTrackWiki = dedicated.some(
      (f) => (f.scope === 'track' || f.scope === 'album') && !f.metadataOnly && f.fact.trim().length >= 35,
    );
    if (hasTrackWiki) break;
  }

  try {
    const discogs = await fetchDiscogsFacts(ctx);
    collected = mergeCollected(collected, discogs);
  } catch {
    // discogs optional (rate limit / missing token)
  }

  try {
    const aggTitle = titles.find((t) => t.length <= ctx.title.length) ?? ctx.title;
    const agg = await fetchAggregatedFactContext(ctx.artist, aggTitle, ctx.countryCode);
    const sources = agg.snippetSources ?? [];
    for (let i = 0; i < (agg.rawSnippets ?? []).length; i++) {
      const text = agg.rawSnippets[i];
      if (!text) continue;
      const src = (sources[i] ?? 'web') as HarvestedFact['source'];
      collected = mergeCollected(collected, [{ fact: text, scope: 'track', source: src }]);
    }
    for (const fact of agg.bundle.trackFacts ?? []) {
      collected = mergeCollected(collected, [{ fact, scope: 'track', source: 'wiki' }]);
    }
    for (const fact of agg.bundle.artistFacts ?? []) {
      collected = mergeCollected(collected, [{ fact, scope: 'artist', source: 'wiki' }]);
    }
  } catch {
    // aggregator optional when flaky
  }

  let filtered = filterForBulk(collected, ctx);

  const hasTrack = filtered.some((f) => f.scope === 'track' || f.scope === 'album');
  const hasArtist = filtered.some((f) => f.scope === 'artist');
  if (!hasTrack || !hasArtist) {
    const wikiArtist = await artistWikiFallback(ctx);
    if (wikiArtist.length > 0) {
      collected = mergeCollected(collected, wikiArtist);
      filtered = filterForBulk(collected, ctx);
    }
  }

  if (filtered.length === 0 && collected.length > 0) {
    // Last resort: keep best artist-level lines that mention the artist.
    filtered = collected.filter(
      (f) => f.scope === 'artist' && factMentionsArtist(f.fact, ctx.artist) && f.fact.trim().length >= 80,
    );
  }

  return dedupeFacts(filtered);
}

export { fetchDedicatedSourceFacts, dedicatedFactsBySource } from './dedicated-fetch.js';

export {
  fetchGeniusFacts,
  fetchSongfactsFacts,
  fetchLastfmFacts,
  fetchDiscogsFacts,
  fetchWhoSampledFacts,
  fetchSecondHandSongsFacts,
  fetchSetlistfmFacts,
  fetchRapRuFacts,
  fetchTheFlowFacts,
  fetchMusixmatchFacts,
};
