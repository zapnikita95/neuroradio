import { fetchAggregatedFactContext } from '../fact-aggregator.js';
import { factAppliesToRequest } from '../fact-relevance.js';
import type { HarvestContext, HarvestedFact, HarvestSource } from './types.js';
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

const SOURCE_TIMEOUT_MS = 12_000;

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

const DEDICATED_SOURCES: Array<{ source: HarvestSource; fetch: SourceFetcher }> = [
  { source: 'genius', fetch: fetchGeniusFacts },
  { source: 'songfacts', fetch: fetchSongfactsFacts },
  { source: 'lastfm', fetch: fetchLastfmFacts },
  // Discogs disabled — registration blocked from RU; enable when DISCOGS_TOKEN available.
  // { source: 'discogs', fetch: fetchDiscogsFacts },
  { source: 'whosampled', fetch: fetchWhoSampledFacts },
  { source: 'secondhandsongs', fetch: fetchSecondHandSongsFacts },
  { source: 'setlistfm', fetch: fetchSetlistfmFacts },
  { source: 'rap-ru', fetch: fetchRapRuFacts },
  { source: 'the-flow', fetch: fetchTheFlowFacts },
  // Musixmatch disabled — paid API (~$50/mo).
  // { source: 'musixmatch', fetch: fetchMusixmatchFacts },
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

function filterRelevant(facts: HarvestedFact[], ctx: HarvestContext): HarvestedFact[] {
  return facts.filter((f) => {
    const scope = f.scope === 'album' ? 'track' : f.scope;
    return factAppliesToRequest(f.fact, ctx.artist, ctx.title, scope, 'indie');
  });
}

/** Parallel harvest from dedicated parsers + existing aggregator snippets. */
export async function harvestAllFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  const dedicatedResults = await Promise.allSettled(
    DEDICATED_SOURCES.map(async ({ source, fetch }) => {
      const items = await withTimeout(fetch(ctx), SOURCE_TIMEOUT_MS);
      return (items ?? []).map((f) => ({ ...f, source }));
    }),
  );

  const collected: HarvestedFact[] = [];
  for (const result of dedicatedResults) {
    if (result.status === 'fulfilled') collected.push(...result.value);
  }

  try {
    const agg = await fetchAggregatedFactContext(
      ctx.artist,
      ctx.title,
      ctx.countryCode,
    );
    const sources = agg.snippetSources ?? [];
    for (let i = 0; i < (agg.rawSnippets ?? []).length; i++) {
      const text = agg.rawSnippets[i];
      if (!text) continue;
      const src = sources[i] ?? 'web';
      collected.push({
        fact: text,
        scope: 'track',
        source: src as HarvestSource,
      });
    }
    for (const fact of agg.bundle.trackFacts ?? []) {
      collected.push({ fact, scope: 'track', source: 'wiki' });
    }
    for (const fact of agg.bundle.artistFacts ?? []) {
      collected.push({ fact, scope: 'artist', source: 'wiki' });
    }
  } catch {
    // aggregator optional for bulk seed
  }

  return dedupeFacts(filterRelevant(collected, ctx));
}

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
