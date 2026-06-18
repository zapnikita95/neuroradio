import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { interestRating10 } from './fact-interest-log.js';
import { rejectSeedForTrackStory, hasAnchoredTrackContext } from './fact-track-anchor.js';
import {
  factMentionsArtistAsEntity,
  factMentionsArtistLoose,
  factMentionsTitle,
  isAmbiguousCommonWordArtist,
} from './fact-relevance.js';
import {
  adjustedInterestScore,
  interestScore,
  isCatalogMetadataSeed,
  isEncyclopediaDefinitionSeed,
  MIN_PICK_INTEREST_SCORE,
  isMetadataHarvestFact,
  isArtistFormationBioSeed,
} from './reference-fact-quality.js';
import { isSpeakableReferenceFact, isArtistIdentityBioSnippet } from './web-snippet-accept.js';
import { factsTooSimilar, type FactScope } from './fact-picker.js';
import {
  classifyFactTopic,
  poolHasTopicDuplicate,
  type FactTopicKey,
} from './fact-topic.js';
import { factFitsStoryLanguage } from './fact-language-fit.js';
import type { StoryLanguageId } from './story-language.js';
import { harvestTitleVariants } from './title-harvest-variants.js';
import {
  computeLiveInterest,
  isEligibleHotFact,
  isRejectedPickSeed,
} from './fact-seed-pick.js';

export interface StoredFact {
  id: string;
  artist: string;
  title: string;
  scope: FactScope;
  fact: string;
  interestScore: number;
  interestRating: number;
  source: 'api' | 'llm' | 'wiki';
  /** True when interestRating >= 6 — eligible for push hints. */
  isHot?: boolean;
  /** Source parser used during bulk harvest (genius, wiki, rap-ru, …). */
  harvestSource?: string;
  /** Generic topic for cross-source dedup (no track names). */
  topicKey?: FactTopicKey;
  /** Last.fm stats / album listing — stored but not a story seed. */
  isMetadata?: boolean;
  /** User dislikes (boring / hallucination) — lowers pick priority. */
  feedbackDislikes?: number;
  timesUsed: number;
  addedAt: number;
  lastUsedAt?: number;
}

interface FactBankFile {
  byTrack: Record<string, StoredFact[]>;
  byArtist: Record<string, StoredFact[]>;
}

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
export const BANK_PATH = path.join(DATA_DIR, 'facts-bank.json');
const SEED_BANK_PATHS = [
  path.join(DATA_DIR, 'facts-bank-seed.json'),
  path.join(process.cwd(), 'src/data/facts-bank-seed.json'),
  path.join(process.cwd(), 'dist/data/facts-bank-seed.json'),
];
const MAX_POOL_SIZE = 80;
const MIN_INGEST_SCORE = 3;
const HOT_MIN_RATING = 6;

let cache: FactBankFile | null = null;

const SAVE_DEBOUNCE_MS = Math.max(
  500,
  parseInt(process.env.FACT_BANK_SAVE_DEBOUNCE_MS ?? '3000', 10) || 3000,
);
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveInFlight = false;
let saveQueued = false;

function emptyBank(): FactBankFile {
  return { byTrack: {}, byArtist: {} };
}

function loadBank(): FactBankFile {
  if (cache) return cache;
  try {
    if (!fs.existsSync(BANK_PATH)) {
      cache = emptyBank();
      return cache;
    }
    cache = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8')) as FactBankFile;
    return cache;
  } catch {
    cache = emptyBank();
    return cache;
  }
}

function writeBankFileSync(bank: FactBankFile): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${BANK_PATH}.${process.pid}.tmp`;
  const json = JSON.stringify(bank);
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, BANK_PATH);
}

function writeBankFileAsync(bank: FactBankFile): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${BANK_PATH}.${process.pid}.tmp`;
    const json = JSON.stringify(bank);
    fs.writeFile(tmp, json, 'utf8', (err) => {
      if (err) {
        reject(err);
        return;
      }
      fs.rename(tmp, BANK_PATH, (renameErr) => {
        if (renameErr) reject(renameErr);
        else resolve();
      });
    });
  });
}

async function flushBankToDisk(): Promise<void> {
  if (saveInFlight) {
    saveQueued = true;
    return;
  }
  const bank = cache;
  if (!bank) return;
  saveInFlight = true;
  try {
    await writeBankFileAsync(bank);
  } catch (err) {
    console.error('[fact-bank] async save failed:', err);
  } finally {
    saveInFlight = false;
    if (saveQueued) {
      saveQueued = false;
      await flushBankToDisk();
    }
  }
}

function scheduleBankSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushBankToDisk();
  }, SAVE_DEBOUNCE_MS);
  saveTimer.unref?.();
}

/** Memory-first update; disk write is debounced so live story requests do not block the event loop. */
function saveBank(bank: FactBankFile): void {
  cache = bank;
  scheduleBankSave();
}

/** Flush pending fact-bank writes before process exit (Railway SIGTERM). */
export function flushFactBankSync(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const bank = cache;
  if (!bank) return;
  writeBankFileSync(bank);
}

export async function flushFactBank(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await flushBankToDisk();
}

export function trackKey(artist: string, title: string): string {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

/** All bank keys to try for a playing title (long catalog name vs short lookup). */
export function resolveTrackLookupKeys(artist: string, title: string): string[] {
  const keys = new Set<string>();
  keys.add(trackKey(artist, title));
  for (const variant of harvestTitleVariants(title)) {
    keys.add(trackKey(artist, variant));
  }
  return [...keys];
}

function mergeTrackPools(bank: FactBankFile, keys: string[]): StoredFact[] {
  const byId = new Map<string, StoredFact>();
  for (const k of keys) {
    for (const fact of bank.byTrack[k] ?? []) {
      byId.set(fact.id, fact);
    }
  }
  return [...byId.values()].sort((a, b) => b.interestScore - a.interestScore);
}

export function artistKey(artist: string): string {
  return artist.trim().toLowerCase();
}

export function factFingerprint(fact: string): string {
  return crypto
    .createHash('sha256')
    .update(fact.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 400))
    .digest('hex')
    .slice(0, 24);
}

function upsertIntoPool(pool: StoredFact[], entry: StoredFact): void {
  const fp = factFingerprint(entry.fact);
  const idx = pool.findIndex((f) => factFingerprint(f.fact) === fp);
  if (idx >= 0) {
    const existing = pool[idx]!;
    if (entry.interestScore > existing.interestScore) {
      pool[idx] = { ...existing, ...entry, timesUsed: existing.timesUsed, addedAt: existing.addedAt };
    }
    return;
  }
  const topicDup = pool.find(
    (f) =>
      f.topicKey &&
      entry.topicKey &&
      f.topicKey === entry.topicKey &&
      f.topicKey !== 'misc',
  );
  if (topicDup && entry.interestScore <= topicDup.interestScore) return;
  if (topicDup && entry.interestScore > topicDup.interestScore) {
    const dupIdx = pool.indexOf(topicDup);
    if (dupIdx >= 0) pool.splice(dupIdx, 1);
  }
  if (poolHasTopicDuplicate(entry.fact, pool.map((p) => p.fact))) {
    const weaker = pool.find((f) => poolHasTopicDuplicate(entry.fact, [f.fact]));
    if (weaker && entry.interestScore <= weaker.interestScore) return;
    if (weaker) {
      const wi = pool.indexOf(weaker);
      if (wi >= 0) pool.splice(wi, 1);
    }
  }
  pool.push(entry);
  pool.sort((a, b) => b.interestScore - a.interestScore);
  if (pool.length > MAX_POOL_SIZE) pool.length = MAX_POOL_SIZE;
}

function buildStoredFact(
  artist: string,
  title: string,
  item: {
    fact: string;
    scope: FactScope;
    source?: StoredFact['source'];
    harvestSource?: string;
    minScore?: number;
  },
): StoredFact | null {
  const trimmed = item.fact.trim();
  if (trimmed.length < 35) return null;
  const score = interestScore(trimmed);
  const minScore = item.minScore ?? 6;
  if (score < minScore) return null;
  const rating = interestRating10(trimmed);
  const isMetadata = isMetadataHarvestFact(trimmed);
  const draft: StoredFact = {
    id: crypto.randomUUID(),
    artist,
    title,
    scope: item.scope,
    fact: trimmed,
    interestScore: score,
    interestRating: rating,
    source: item.source ?? 'api',
    isMetadata,
    isHot: isEligibleHotFact(trimmed, { metadata: isMetadata, artist, title }),
    harvestSource: item.harvestSource,
    topicKey: classifyFactTopic(trimmed),
    timesUsed: 0,
    addedAt: Date.now(),
  };
  if (!isValidStoredFact(draft)) return null;
  return draft;
}

function isValidStoredFact(fact: StoredFact): boolean {
  if (isAmbiguousCommonWordArtist(fact.artist) && !factMentionsArtistAsEntity(fact.fact, fact.artist)) {
    return false;
  }
  if (
    fact.artist.trim() &&
    !factMentionsArtistLoose(fact.fact, fact.artist) &&
    !(fact.scope === 'track' && fact.title.trim() && factMentionsTitle(fact.fact, fact.title))
  ) {
    return false;
  }
  if (
    isAmbiguousCommonWordArtist(fact.artist) &&
    /(?:скандал|проститу|шантаж|измен|развод|арест|убий|наркот)/i.test(fact.fact)
  ) {
    return false;
  }
  const trackPool = (loadBank().byTrack[trackKey(fact.artist, fact.title)] ?? []).map((f) => f.fact);
  if (rejectSeedForTrackStory(fact.fact, fact.artist, fact.title, { trackPoolFacts: trackPool })) {
    return false;
  }
  if (isCatalogMetadataSeed(fact.fact)) return false;
  if (isEncyclopediaDefinitionSeed(fact.fact)) return false;
  return true;
}

/** Удаляет ложные факты (Привет и т.п.) из volume-банка. */
export function purgeInvalidBankFacts(): number {
  const bank = loadBank();
  let removed = 0;
  for (const key of Object.keys(bank.byTrack)) {
    const pool = bank.byTrack[key] ?? [];
    const filtered = pool.filter(isValidStoredFact);
    removed += pool.length - filtered.length;
    if (filtered.length === 0) delete bank.byTrack[key];
    else bank.byTrack[key] = filtered;
  }
  for (const key of Object.keys(bank.byArtist)) {
    const pool = bank.byArtist[key] ?? [];
    const filtered = pool.filter(isValidStoredFact);
    removed += pool.length - filtered.length;
    if (filtered.length === 0) delete bank.byArtist[key];
    else bank.byArtist[key] = filtered;
  }
  if (removed > 0) {
    saveBank(bank);
    console.log(`[fact-bank] purged ${removed} invalid fact(s) from ${BANK_PATH}`);
  }
  return removed;
}

/** Сохраняем хорошие факты из API — база растёт по мере прослушивания. */
export function ingestFacts(
  artist: string,
  title: string,
  facts: Array<{ fact: string; scope: FactScope; source?: StoredFact['source'] }>,
): number {
  return ingestHarvestFacts(
    artist,
    title,
    facts.map((f) => ({ ...f, minScore: 6 })),
  );
}

/** Bulk harvest ingest — keeps facts with score ≥ 3; marks hot when rating ≥ 6. */
export function ingestHarvestFacts(
  artist: string,
  title: string,
  facts: Array<{
    fact: string;
    scope: FactScope;
    source?: StoredFact['source'];
    harvestSource?: string;
    minScore?: number;
  }>,
): number {
  const bank = loadBank();
  const tk = trackKey(artist, title);
  const ak = artistKey(artist);
  const trackPool = bank.byTrack[tk] ?? [];
  const artistPool = bank.byArtist[ak] ?? [];
  let saved = 0;

  for (const item of facts) {
    const stored = buildStoredFact(artist, title, {
      ...item,
      minScore: item.minScore ?? MIN_INGEST_SCORE,
    });
    if (!stored) continue;
    const poolSizeBefore =
      item.scope === 'artist' ? artistPool.length : trackPool.length;
    if (item.scope === 'artist') upsertIntoPool(artistPool, stored);
    else upsertIntoPool(trackPool, stored);
    const poolSizeAfter =
      item.scope === 'artist' ? artistPool.length : trackPool.length;
    if (poolSizeAfter >= poolSizeBefore) saved += 1;
  }

  bank.byTrack[tk] = trackPool;
  bank.byArtist[ak] = artistPool;
  saveBank(bank);

  if (saved > 0) {
    console.log(
      `[fact-bank] saved ${saved} fact(s) artist="${artist}" title="${title}" ` +
        `trackPool=${trackPool.length} artistPool=${artistPool.length} path=${BANK_PATH}`,
    );
  }

  return saved;
}

/** Пересчёт interestScore/isHot в JSON-банке по актуальным правилам pick. */
export function refreshBankInterestScores(): number {
  const bank = loadBank();
  let updated = 0;
  const refreshPool = (pool: StoredFact[], artist: string, title: string) => {
    const trackPoolFacts = pool.map((f) => f.fact);
    for (const entry of pool) {
      const live = computeLiveInterest(entry.fact);
      const hot = isEligibleHotFact(entry.fact, {
        metadata: entry.isMetadata,
        artist: entry.artist || artist,
        title: entry.title || title,
        trackPool: trackPoolFacts,
      });
      if (
        entry.interestScore !== live.score ||
        entry.interestRating !== live.rating ||
        Boolean(entry.isHot) !== hot
      ) {
        entry.interestScore = live.score;
        entry.interestRating = live.rating;
        entry.isHot = hot;
        updated += 1;
      }
    }
    pool.sort((a, b) => b.interestScore - a.interestScore);
  };
  for (const [key, pool] of Object.entries(bank.byTrack)) {
    const [artist, ...titleParts] = key.split('|');
    refreshPool(pool, artist ?? '', titleParts.join('|'));
  }
  for (const [artist, pool] of Object.entries(bank.byArtist)) {
    refreshPool(pool, artist, '');
  }
  if (updated > 0) {
    saveBank(bank);
    console.log(`[fact-bank] refreshed interest scores for ${updated} fact(s)`);
  }
  return updated;
}

/** Count hot facts (rating ≥ 6) for push hint — no fact text returned. */
export function countHotFacts(artist: string, title: string): { hotCount: number; hasHotFact: boolean } {
  const { track, artist: artistFacts } = listBankFacts(artist, title);
  const trackPoolFacts = [...track, ...artistFacts].map((f) => f.fact);
  const all = [...track, ...artistFacts];
  const hot = all.filter(
    (f) =>
      isEligibleHotFact(f.fact, {
        metadata: f.isMetadata,
        artist,
        title,
        trackPool: trackPoolFacts,
      }) && isSpeakableReferenceFact(f.fact, artist, title),
  );
  return { hotCount: hot.length, hasHotFact: hot.length > 0 };
}

/** Merge seed bank from data/facts-bank-seed.json on boot (idempotent). */
function resolveSeedBankPath(): string | null {
  for (const candidate of SEED_BANK_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function mergeSeedBankOnBoot(): number {
  try {
    const seedPath = resolveSeedBankPath();
    if (!seedPath) return 0;
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as FactBankFile;
    const bank = loadBank();
    let merged = 0;
    for (const pool of Object.values(seed.byTrack ?? {})) {
      for (const fact of pool) {
        merged += ingestHarvestFacts(fact.artist, fact.title, [
          {
            fact: fact.fact,
            scope: fact.scope,
            source: fact.source,
            harvestSource: fact.harvestSource,
            minScore: MIN_INGEST_SCORE,
          },
        ]);
      }
    }
    for (const pool of Object.values(seed.byArtist ?? {})) {
      for (const fact of pool) {
        merged += ingestHarvestFacts(fact.artist, fact.title || '', [
          {
            fact: fact.fact,
            scope: 'artist',
            source: fact.source,
            harvestSource: fact.harvestSource,
            minScore: MIN_INGEST_SCORE,
          },
        ]);
      }
    }
    if (merged > 0) {
      console.log(`[fact-bank] seed bank merged: ${merged} new facts from ${seedPath}`);
    }
    return merged;
  } catch (err) {
    console.warn('[fact-bank] seed merge failed:', err);
    return 0;
  }
}

export function exportBankSnapshot(): FactBankFile {
  return loadBank();
}

export function listBankFacts(
  artist: string,
  title: string,
): { track: StoredFact[]; artist: StoredFact[] } {
  const bank = loadBank();
  return {
    track: mergeTrackPools(bank, resolveTrackLookupKeys(artist, title)),
    artist: bank.byArtist[artistKey(artist)] ?? [],
  };
}

const FEEDBACK_PENALTY: Record<'hallucination' | 'boring_fact', number> = {
  hallucination: 12,
  boring_fact: 6,
};

/** Lower pick priority after user marks seed boring or hallucinated. */
export function applyFactFeedbackPenalty(
  artist: string,
  title: string,
  factText: string,
  reason: 'hallucination' | 'boring_fact',
): boolean {
  const bank = loadBank();
  const fp = factFingerprint(factText);
  const penalty = FEEDBACK_PENALTY[reason];
  let found = false;

  const touch = (pool: StoredFact[]) => {
    for (const f of pool) {
      if (factFingerprint(f.fact) !== fp) continue;
      f.feedbackDislikes = (f.feedbackDislikes ?? 0) + 1;
      f.interestScore = Math.max(0, f.interestScore - penalty);
      f.interestRating = Math.max(1, f.interestRating - (reason === 'hallucination' ? 3 : 1));
      f.isHot = false;
      found = true;
    }
  };

  for (const k of resolveTrackLookupKeys(artist, title)) {
    touch(bank.byTrack[k] ?? []);
  }
  touch(bank.byArtist[artistKey(artist)] ?? []);

  if (found) {
    saveBank(bank);
    console.log(
      `[fact-bank] feedback penalty reason=${reason} artist="${artist}" title="${title}" ` +
        `penalty=${penalty}`,
    );
  }
  return found;
}

function effectivePickScore(fact: StoredFact, liveScore: number): number {
  const base = Math.max(liveScore, fact.interestScore ?? 0);
  return Math.max(0, base - (fact.feedbackDislikes ?? 0) * 4);
}

export function pickFromBank(
  artist: string,
  title: string,
  usedFingerprints: Set<string>,
  preferScope: FactScope[] = ['track', 'album', 'artist'],
  startOffset = 0,
  rejectSimilarTo: string[] = [],
  blockedTopics: Set<FactTopicKey> = new Set(),
  storyLanguage: StoryLanguageId = 'ru',
  options: { markUsed?: boolean; recentScopes?: FactScope[] } = {},
): StoredFact | null {
  const { track, artist: artistFacts } = listBankFacts(artist, title);
  const trackScopeStreak = (options.recentScopes ?? []).slice(0, 2).filter((s) => s === 'track').length;
  const rotatingFromTrack = (options.recentScopes ?? [])[0] === 'track';
  const minScoreForScope = (scope: FactScope): number => {
    if (scope === 'track') return MIN_PICK_INTEREST_SCORE;
    if (trackScopeStreak >= 2 || rotatingFromTrack) {
      return Math.max(6, MIN_PICK_INTEREST_SCORE - 6);
    }
    return MIN_PICK_INTEREST_SCORE;
  };
  const minRatingForScope = (scope: FactScope): number =>
    scope === 'artist' && rotatingFromTrack ? 5 : HOT_MIN_RATING;
  const pools: Record<FactScope, StoredFact[]> = {
    track: track.filter((f) => f.scope === 'track'),
    album: track.filter((f) => f.scope === 'album'),
    artist: artistFacts,
  };
  const trackPoolFacts = [
    ...pools.track.map((f) => f.fact),
    ...pools.album.map((f) => f.fact),
  ];

  const unused: StoredFact[] = [];
  for (const scope of preferScope) {
    const scopeCandidates: StoredFact[] = [];
    for (const fact of pools[scope] ?? []) {
      if (usedFingerprints.has(factFingerprint(fact.fact))) continue;
      if (fact.topicKey && fact.topicKey !== 'misc' && blockedTopics.has(fact.topicKey)) continue;
      if (factsTooSimilar(fact.fact, rejectSimilarTo, { pickScope: scope, recentScopes: options.recentScopes })) continue;
      if (!factFitsStoryLanguage(fact.fact, storyLanguage)) continue;
      if (
        scope !== 'artist' &&
        scope !== 'album' &&
        rejectSeedForTrackStory(fact.fact, artist, title, { trackPoolFacts })
      ) {
        continue;
      }
      if (isRejectedPickSeed(fact.fact, title, storyLanguage, trackPoolFacts, artist, scope)) continue;
      if (
        scope === 'track' &&
        artist &&
        !factMentionsArtistLoose(fact.fact, artist)
      ) {
        continue;
      }
      if (
        (scope === 'track' || scope === 'album') &&
        title.trim() &&
        !factMentionsTitle(fact.fact, title) &&
        !hasAnchoredTrackContext(fact.fact, title)
      ) {
        continue;
      }
      const live = computeLiveInterest(fact.fact);
      const effective = effectivePickScore(fact, live.score);
      const profileBio =
        scope === 'artist' &&
        (isArtistIdentityBioSnippet(fact.fact) ||
          isArtistFormationBioSeed(fact.fact) ||
          /\b(?:frontman|lead singer|co[- ]?founder|started (?:his|her|their) solo career|until its break-up)\b/i.test(fact.fact));
      if (!profileBio && effective < minScoreForScope(scope)) continue;
      if (!profileBio && live.rating < minRatingForScope(scope)) continue;
      if (!profileBio && !isSpeakableReferenceFact(fact.fact, artist, title)) continue;
      if (isAmbiguousCommonWordArtist(artist) && !factMentionsArtistAsEntity(fact.fact, artist)) continue;
      scopeCandidates.push({
        ...fact,
        interestScore: effective,
        interestRating: live.rating,
      });
    }
    scopeCandidates.sort(
      (a, b) => adjustedInterestScore(b.fact, 'auto') - adjustedInterestScore(a.fact, 'auto'),
    );
    unused.push(...scopeCandidates);
  }
  if (unused.length === 0) return null;
  const picked = unused[startOffset % unused.length]!;
  if (options.markUsed !== false) {
    markFactUsed(picked.id, artist, title);
  }
  return picked;
}

function markFactUsed(id: string, artist: string, title: string): void {
  const bank = loadBank();
  const keys = resolveTrackLookupKeys(artist, title);
  for (const k of keys) {
    for (const pool of [bank.byTrack[k] ?? [], bank.byArtist[artistKey(artist)] ?? []]) {
      const hit = pool.find((f) => f.id === id);
      if (hit) {
        hit.timesUsed += 1;
        hit.lastUsedAt = Date.now();
      }
    }
  }
  saveBank(bank);
}
