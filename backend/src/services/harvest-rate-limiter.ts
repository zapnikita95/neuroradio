/** Global harvest API rate limits — ONLY for bulk-seed / chart-harvest scripts (opt-in). */

export type HarvestRateBucket = 'lastfm' | 'discogs' | 'genius' | 'setlistfm' | 'default';

/** Off by default — live story /v1/story/full must never share this queue. */
const ENABLED = process.env.HARVEST_RATE_LIMIT?.trim().toLowerCase() === 'true';

/** Min ms between requests per bucket (conservative vs documented limits). */
const INTERVAL_MS: Record<HarvestRateBucket, number> = {
  lastfm: 260,
  discogs: 1100,
  genius: 2000,
  setlistfm: 500,
  default: 350,
};

const lastAt: Record<HarvestRateBucket, number> = {
  lastfm: 0,
  discogs: 0,
  genius: 0,
  setlistfm: 0,
  default: 0,
};

const chains: Record<HarvestRateBucket, Promise<void>> = {
  lastfm: Promise.resolve(),
  discogs: Promise.resolve(),
  genius: Promise.resolve(),
  setlistfm: Promise.resolve(),
  default: Promise.resolve(),
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function classifyHarvestUrl(url: string): HarvestRateBucket {
  const u = url.toLowerCase();
  if (u.includes('audioscrobbler.com') || u.includes('last.fm')) return 'lastfm';
  if (u.includes('discogs.com')) return 'discogs';
  if (u.includes('api.genius.com') || u.includes('genius.com/api')) return 'genius';
  if (u.includes('api.setlist.fm')) return 'setlistfm';
  return 'default';
}

export async function acquireHarvestSlot(url: string): Promise<void> {
  if (!ENABLED) return;
  const bucket = classifyHarvestUrl(url);
  const run = chains[bucket].then(async () => {
    const wait = Math.max(0, INTERVAL_MS[bucket] - (Date.now() - lastAt[bucket]));
    if (wait > 0) await sleep(wait);
    lastAt[bucket] = Date.now();
  });
  chains[bucket] = run.catch(() => undefined);
  await run;
}

export function penalizeHarvestBucket(url: string, attempt: number): Promise<void> {
  if (!ENABLED) return Promise.resolve();
  const bucket = classifyHarvestUrl(url);
  const backoff = Math.min(60_000, INTERVAL_MS[bucket] * (2 ** attempt));
  lastAt[bucket] = Date.now() + backoff;
  return sleep(backoff);
}

export function isHarvestRateLimitEnabled(): boolean {
  return ENABLED;
}
