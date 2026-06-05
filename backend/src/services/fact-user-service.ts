import crypto from 'node:crypto';
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
import { splitBundleByScope, rankScopedFacts } from './fact-ranking.js';
import { factMentionsArtistAsEntity, isAmbiguousCommonWordArtist } from './fact-relevance.js';
import type { ReferenceFactBundle } from './fact-picker.js';
import { pickReferenceFact, type SelectedReferenceFact } from './fact-picker.js';

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

export async function getUsedFingerprints(
  installId: string,
  artist: string,
  title: string,
): Promise<Set<string>> {
  const fps = await getAccountUsedFingerprintsAsync(installId, artist, title);
  for (const s of await collectPreviousScripts(installId, artist, title)) {
    fps.add(factFingerprint(s));
  }
  return fps;
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
): Promise<SelectedReferenceFact | null> {
  ensureAccount(installId);
  const used = await getUsedFingerprints(installId, artist, title);
  const fromBank = pickFromBank(artist, title, used);
  return fromBank ? storedFactToSelected(fromBank) : null;
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
): Promise<SelectedReferenceFact | null> {
  const used = await getUsedFingerprints(installId, artist, title);
  const fromBank = pickFromBank(artist, title, used);
  if (fromBank) return storedFactToSelected(fromBank);

  const previous = await collectPreviousScripts(installId, artist, title);
  return pickReferenceFact(bundle, previous, storyIndex, artist, title, used);
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
