import { normalizeArtistKey, primaryArtistName } from './artist-primary.js';
import type { StoryNarratorId } from './story-narrator.js';
import { fetchArtistWikiLead, fetchArtistWikiParagraphs, fetchArtistWikiLeadWithRetry } from './wikipedia-lead.js';
import { isMusicArtistWikiExtract } from './wikipedia-music.js';

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
  narrator?: StoryNarratorId;
}

function narratorWikiStartOffset(narrator: StoryNarratorId, count: number): number {
  if (count <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < narrator.length; i += 1) {
    hash = (hash * 31 + narrator.charCodeAt(i)) >>> 0;
  }
  return hash % count;
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
  const narrator = input.narrator ?? 'auto';
  const start = narratorWikiStartOffset(narrator, candidates.length);

  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[(start + offset) % candidates.length]!;
    if (isSeedUsed(input.installId, primary, candidate)) continue;
    if (input.previousScripts.some((s) => scriptOverlapsSeed(s, candidate))) continue;
    return { text: candidate, lang: cached.lang };
  }

  return { text: cached.lead, lang: cached.lang };
}

/** Wiki lead with retries — used before 503 when parallel fetch timed out. */
export async function tryRetryArtistWikiSeed(
  input: PickWikiContentInput,
): Promise<{ text: string; lang: 'en' | 'ru' } | null> {
  const primary = primaryArtistName(input.artist);
  const picked = await pickArtistWikiContent(input);
  if (picked && isMusicArtistWikiExtract(picked.text)) return picked;
  const lead = await fetchArtistWikiLeadWithRetry(primary, 3);
  if (lead && isMusicArtistWikiExtract(lead.text)) return lead;
  return null;
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
