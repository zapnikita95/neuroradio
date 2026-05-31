import { normalizeArtistKey, primaryArtistName } from './artist-primary.js';
import { fetchArtistWikiLead, fetchArtistWikiParagraphs } from './wikipedia-lead.js';

const DEPTH_PREFETCH_THRESHOLD = 5;

interface InstallArtistState {
  artistKey: string;
  consecutiveCount: number;
}

const installArtistState = new Map<string, InstallArtistState>();
const usedSeedsByInstall = new Map<string, Set<string>>();
const prefetchInFlight = new Set<string>();

function installSeedKey(installId: string, artist: string): string {
  return `${installId}:${normalizeArtistKey(artist)}`;
}

function seedFingerprint(seed: string): string {
  return seed.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 160);
}

function markSeedUsed(installId: string, artist: string, seed: string): void {
  const key = installSeedKey(installId, artist);
  const used = usedSeedsByInstall.get(key) ?? new Set<string>();
  used.add(seedFingerprint(seed));
  usedSeedsByInstall.set(key, used);
}

function isSeedUsed(installId: string, artist: string, seed: string): boolean {
  const key = installSeedKey(installId, artist);
  return usedSeedsByInstall.get(key)?.has(seedFingerprint(seed)) ?? false;
}

function scriptOverlapsSeed(script: string, seed: string): boolean {
  const a = normalizeArtistKey(script);
  const b = normalizeArtistKey(seed);
  if (a.length < 20 || b.length < 20) return false;
  const seedWords = b.split(' ').filter((w) => w.length >= 5);
  if (seedWords.length === 0) return false;
  const hits = seedWords.filter((w) => a.includes(w)).length;
  return hits >= Math.min(4, Math.ceil(seedWords.length * 0.45));
}

export interface PickWikiContentInput {
  installId: string;
  artist: string;
  previousScripts: string[];
}

/** Pick wiki paragraph — rotates away from already-used lead when depth cache has more. */
export async function pickArtistWikiContent(
  input: PickWikiContentInput,
): Promise<{ text: string; lang: 'en' | 'ru' } | null> {
  const primary = primaryArtistName(input.artist);
  const cached = await fetchArtistWikiParagraphs(primary);
  if (!cached) {
    return fetchArtistWikiLead(primary);
  }

  const candidates = [cached.lead, ...cached.paragraphs].filter(
    (p) => p.trim().length >= 40,
  );

  for (const candidate of candidates) {
    if (isSeedUsed(input.installId, primary, candidate)) continue;
    if (input.previousScripts.some((s) => scriptOverlapsSeed(s, candidate))) continue;
    return { text: candidate, lang: cached.lang };
  }

  return { text: cached.lead, lang: cached.lang };
}

/** After a successful story — track consecutive same-artist plays; prefetch depth in background. */
export function recordArtistStoryForDepth(
  installId: string,
  artist: string,
  seedFact: string,
): void {
  const primary = primaryArtistName(artist);
  const artistKey = normalizeArtistKey(primary);
  markSeedUsed(installId, primary, seedFact);

  const prev = installArtistState.get(installId);
  const consecutiveCount =
    prev?.artistKey === artistKey ? prev.consecutiveCount + 1 : 1;
  installArtistState.set(installId, { artistKey, consecutiveCount });

  if (consecutiveCount >= DEPTH_PREFETCH_THRESHOLD) {
    scheduleArtistDepthPrefetch(primary);
  }
}

/** Fire-and-forget: load extra Wikipedia paragraphs for later stories. */
export function scheduleArtistDepthPrefetch(artist: string): void {
  const key = normalizeArtistKey(artist);
  if (prefetchInFlight.has(key)) return;
  prefetchInFlight.add(key);
  void fetchArtistWikiParagraphs(artist)
    .then((result) => {
      if (result) {
        console.log(
          `[artist-depth] cached ${result.paragraphs.length + 1} wiki chunks for "${artist}"`,
        );
      }
    })
    .catch((err) => {
      console.warn(`[artist-depth] prefetch failed for "${artist}":`, err);
    })
    .finally(() => {
      prefetchInFlight.delete(key);
    });
}

/** Test helper. */
export function resetArtistWikiDepthState(): void {
  installArtistState.clear();
  usedSeedsByInstall.clear();
  prefetchInFlight.clear();
}
