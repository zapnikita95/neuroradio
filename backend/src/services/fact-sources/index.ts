import { fetchAggregatedFactContext } from '../fact-aggregator.js';
import { factAppliesToRequest } from '../fact-relevance.js';
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
  const collected: HarvestedFact[] = [];

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
        source: src,
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
