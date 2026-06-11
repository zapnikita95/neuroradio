import type { HarvestContext, HarvestedFact, HarvestSource } from './types.js';
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

export function dedicatedFactsBySource(facts: HarvestedFact[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of facts) {
    counts[f.source] = (counts[f.source] ?? 0) + 1;
  }
  return counts;
}
