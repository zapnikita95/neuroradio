import crypto from 'node:crypto';
import type { StoryNarratorId } from './story-narrator.js';
import {
  createAccount,
  getAccountListenStat,
  getAccountUsedFingerprintsAsync,
  pullHistoryAsync,
  pushHistoryAsync,
  recordAccountListen,
  recordAccountUsedSeedAsync,
  resolveAccountId,
  type SyncHistoryEntry,
} from './account-store.js';
import {
  factFingerprint,
  ingestFacts,
  listBankFacts,
  pickFromBank,
  type StoredFact,
  trackKey,
} from './fact-bank.js';
import type { CoverFactContext } from './cover-resolve.js';
import { splitBundleByScope, rankScopedFacts } from './fact-ranking.js';
import { factMentionsArtistAsEntity, isAmbiguousCommonWordArtist } from './fact-relevance.js';
import type { ReferenceFactBundle } from './fact-picker.js';

const PENDING_SEED_TTL_MS = 3 * 60_000;
const pendingTrackSeeds = new Map<string, { fact: string; at: number }>();

function pendingTrackKey(installId: string, artist: string, title: string): string {
  return `${installId.trim().toLowerCase()}:${trackKey(artist, title)}`;
}

export function peekPendingTrackSeed(installId: string, artist: string, title: string): string | null {
  const key = pendingTrackKey(installId, artist, title);
  const hit = pendingTrackSeeds.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > PENDING_SEED_TTL_MS) {
    pendingTrackSeeds.delete(key);
    return null;
  }
  return hit.fact;
}

export function setPendingTrackSeed(installId: string, artist: string, title: string, fact: string): void {
  pendingTrackSeeds.set(pendingTrackKey(installId, artist, title), { fact, at: Date.now() });
}

export function clearPendingTrackSeed(installId: string, artist: string, title: string): void {
  pendingTrackSeeds.delete(pendingTrackKey(installId, artist, title));
}

export async function getRecentSeedFactsForTrack(
  installId: string,
  artist: string,
  title: string,
  limit = 6,
): Promise<string[]> {
  const out: string[] = [];
  const pending = peekPendingTrackSeed(installId, artist, title);
  if (pending) out.push(pending);

  const history = await pullHistoryAsync(installId, 0);
  if (history) {
    const tk = trackKey(artist, title);
    for (const h of history) {
      if (h.trackKey !== tk) continue;
      if (h.seedFact?.trim()) out.push(h.seedFact.trim());
      if (h.script?.trim()) out.push(h.script.trim());
      if (out.length >= limit) break;
    }
  }
  return [...new Set(out)].slice(0, limit);
}
import { pickReferenceFact, factsTooSimilar, type SelectedReferenceFact } from './fact-picker.js';

export function ensureAccount(installId: string): string {
  const existing = resolveAccountId(installId);
  if (existing) return existing;
  return createAccount(installId).accountId;
}

export async function collectPreviousScripts(
  installId: string,
  artist: string,
  title: string,
): Promise<string[]> {
  const scripts: string[] = [];
  const history = await pullHistoryAsync(installId, 0);
  if (history) {
    const tk = trackKey(artist, title);
    const artistNorm = artist.trim().toLowerCase();
    for (const h of history) {
      const sameTrack = h.trackKey === tk;
      const sameArtist = h.artist.trim().toLowerCase() === artistNorm;
      if (sameTrack || sameArtist) {
        if (h.script?.trim()) scripts.push(h.script.trim());
        if (h.seedFact?.trim()) scripts.push(h.seedFact.trim());
      }
    }
  }
  return scripts;
}

export async function getLastTrackSeedFingerprint(
  installId: string,
  artist: string,
  title: string,
): Promise<string | null> {
  const recent = await getRecentSeedFactsForTrack(installId, artist, title, 1);
  const seed = recent.find((f) => f.length > 0);
  return seed ? factFingerprint(seed) : null;
}

export async function getUsedFingerprints(
  installId: string,
  artist: string,
  title: string,
): Promise<Set<string>> {
  const fps = await getAccountUsedFingerprintsAsync(installId, artist, title);
  for (const s of await collectPreviousScripts(installId, artist, title)) {
    fps.add(factFingerprint(s));
  }
  const lastTrackSeed = await getLastTrackSeedFingerprint(installId, artist, title);
  if (lastTrackSeed) fps.add(lastTrackSeed);
  return fps;
}

/** Reserve seed immediately so rapid persona/track retries cannot reuse it. */
export async function reserveSeedForUser(
  installId: string,
  artist: string,
  title: string,
  seed: SelectedReferenceFact,
): Promise<void> {
  ensureAccount(installId);
  setPendingTrackSeed(installId, artist, title, seed.fact);
  await recordAccountUsedSeedAsync(installId, {
    fact: seed.fact,
    artist,
    title,
    scope: seed.scope,
    interestScore: seed.interestScore,
    interestRating: seed.interestRating,
  });
}

export function ingestBundleToBank(artist: string, title: string, bundle: ReferenceFactBundle): number {
  const pools = splitBundleByScope(bundle, artist, title);
  const ranked = rankScopedFacts(pools).filter(
    (r) =>
      !r.junk &&
      r.interest >= 6 &&
      (!isAmbiguousCommonWordArtist(artist) || factMentionsArtistAsEntity(r.fact, artist)),
  );
  return ingestFacts(
    artist,
    title,
    ranked.slice(0, 16).map((r) => ({ fact: r.fact, scope: r.scope, source: 'wiki' as const })),
  );
}

function storedFactToSelected(fromBank: StoredFact): SelectedReferenceFact {
  return {
    fact: fromBank.fact,
    scope: fromBank.scope,
    scopeLabelRu:
      fromBank.scope === 'track' ? 'трек' : fromBank.scope === 'album' ? 'альбом' : 'группа/артист',
    interestScore: fromBank.interestScore,
    interestRating: fromBank.interestRating,
  };
}

/** Нерассказанный этому пользователю факт из банка — без wiki/web/ddg. */
export async function pickBankFactForUser(
  installId: string,
  artist: string,
  title: string,
  cover?: CoverFactContext,
): Promise<SelectedReferenceFact | null> {
  ensureAccount(installId);
  const recentForTrack = await getRecentSeedFactsForTrack(installId, artist, title);
  const used = await getUsedFingerprints(installId, artist, title);
  const keys: Array<[string, string]> = [[artist, title]];
  if (cover?.isCover) {
    keys.push([cover.factArtist, cover.factTitle]);
  }
  for (const [a, t] of keys) {
    const fromBank = pickFromBank(a, t, used, ['track', 'album', 'artist'], 0, recentForTrack);
    if (fromBank && !factsTooSimilar(fromBank.fact, recentForTrack)) {
      return storedFactToSelected(fromBank);
    }
  }
  return null;
}

export async function countUnusedBankFactsForUser(
  installId: string,
  artist: string,
  title: string,
): Promise<number> {
  ensureAccount(installId);
  const used = await getUsedFingerprints(installId, artist, title);
  const { track, artist: artistFacts } = listBankFacts(artist, title);
  let count = 0;
  for (const item of [...track, ...artistFacts]) {
    if (item.interestScore < 6) continue;
    if (used.has(factFingerprint(item.fact))) continue;
    count += 1;
  }
  return count;
}

export async function pickFactForUser(
  installId: string,
  bundle: ReferenceFactBundle,
  artist: string,
  title: string,
  storyIndex = 0,
  _narrator: StoryNarratorId = 'auto',
): Promise<SelectedReferenceFact | null> {
  const recentForTrack = await getRecentSeedFactsForTrack(installId, artist, title);
  const used = await getUsedFingerprints(installId, artist, title);
  for (let offset = 0; offset < 8; offset += 1) {
    const fromBank = pickFromBank(
      artist,
      title,
      used,
      ['track', 'album', 'artist'],
      offset,
      recentForTrack,
    );
    if (fromBank && !factsTooSimilar(fromBank.fact, recentForTrack)) {
      return storedFactToSelected(fromBank);
    }
    if (!fromBank) break;
  }

  const previous = await collectPreviousScripts(installId, artist, title);
  const mergedPrevious = [...new Set([...previous, ...recentForTrack])];
  const picked = pickReferenceFact(bundle, mergedPrevious, storyIndex, artist, title, used);
  if (picked && factsTooSimilar(picked.fact, recentForTrack)) return null;
  return picked;
}

export async function recordUserStory(
  installId: string,
  input: {
    artist: string;
    title: string;
    script: string;
    seed: SelectedReferenceFact;
  },
): Promise<void> {
  ensureAccount(installId);
  recordAccountListen(installId, input.artist, input.title);
  await recordAccountUsedSeedAsync(installId, {
    fact: input.seed.fact,
    artist: input.artist,
    title: input.title,
    scope: input.seed.scope,
    interestScore: input.seed.interestScore,
    interestRating: input.seed.interestRating,
  });

  await pushHistoryAsync(installId, {
    id: crypto.randomUUID(),
    trackKey: trackKey(input.artist, input.title),
    artist: input.artist,
    title: input.title,
    script: input.script,
    angle: input.seed.scope,
    playedAt: Date.now(),
    seedFact: input.seed.fact,
    seedScope: input.seed.scope,
    interestRating: input.seed.interestRating,
  });
  clearPendingTrackSeed(installId, input.artist, input.title);
}

/** 0–1: насколько вероятен повтор того же артиста (для prefetch запасных фактов). */
export function repeatArtistProbability(installId: string, artist: string): number {
  const stat = getAccountListenStat(installId, artist);
  if (!stat || stat.playCount < 2) return 0.15;
  const hoursSince = (Date.now() - stat.lastPlayedAt) / 3_600_000;
  if (hoursSince > 48) return 0.1;
  const streakBoost = Math.min(stat.consecutivePlays, 5) * 0.12;
  return Math.min(0.85, 0.2 + streakBoost + stat.playCount * 0.03);
}

export function shouldPrefetchArtistFacts(installId: string, artist: string): boolean {
  return repeatArtistProbability(installId, artist) >= 0.35;
}

export function prefetchArtistFactsToBank(
  installId: string,
  artist: string,
  title: string,
  bundle: ReferenceFactBundle,
): void {
  if (!shouldPrefetchArtistFacts(installId, artist)) return;
  ingestBundleToBank(artist, title, bundle);
  const pools = splitBundleByScope(bundle, artist, title);
  for (const scope of ['artist'] as const) {
    for (const fact of pools[scope].slice(0, 6)) {
      ingestFacts(artist, title, [{ fact, scope: 'artist', source: 'api' }]);
    }
  }
  console.log(
    `[fact-prefetch] install=${installId.slice(0, 8)} artist="${artist}" prob=${repeatArtistProbability(installId, artist).toFixed(2)}`,
  );
}
