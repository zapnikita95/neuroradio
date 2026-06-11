import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { interestRating10 } from './fact-interest-log.js';
import { factMentionsArtistAsEntity, isAmbiguousCommonWordArtist } from './fact-relevance.js';
import { interestScore } from './reference-fact-quality.js';
import { isSpeakableReferenceFact } from './web-snippet-accept.js';
import { factsTooSimilar, type FactScope } from './fact-picker.js';
import {
  classifyFactTopic,
  poolHasTopicDuplicate,
  type FactTopicKey,
} from './fact-topic.js';
import { factFitsStoryLanguage } from './fact-language-fit.js';
import type { StoryLanguageId } from './story-language.js';

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

function saveBank(bank: FactBankFile): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(BANK_PATH, JSON.stringify(bank, null, 2), 'utf8');
  cache = bank;
}

export function trackKey(artist: string, title: string): string {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
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
  const draft: StoredFact = {
    id: crypto.randomUUID(),
    artist,
    title,
    scope: item.scope,
    fact: trimmed,
    interestScore: score,
    interestRating: rating,
    source: item.source ?? 'api',
    isHot: rating >= HOT_MIN_RATING,
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
    isAmbiguousCommonWordArtist(fact.artist) &&
    /(?:скандал|проститу|шантаж|измен|развод|арест|убий|наркот)/i.test(fact.fact)
  ) {
    return false;
  }
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

/** Count hot facts (rating ≥ 6) for push hint — no fact text returned. */
export function countHotFacts(artist: string, title: string): { hotCount: number; hasHotFact: boolean } {
  const { track, artist: artistFacts } = listBankFacts(artist, title);
  const all = [...track, ...artistFacts];
  const hot = all.filter(
    (f) =>
      (f.isHot ?? f.interestRating >= HOT_MIN_RATING) &&
      f.interestScore >= 6 &&
      isSpeakableReferenceFact(f.fact, artist, title),
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
    track: bank.byTrack[trackKey(artist, title)] ?? [],
    artist: bank.byArtist[artistKey(artist)] ?? [],
  };
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
): StoredFact | null {
  const { track, artist: artistFacts } = listBankFacts(artist, title);
  const pools: Record<FactScope, StoredFact[]> = {
    track: track.filter((f) => f.scope === 'track'),
    album: track.filter((f) => f.scope === 'album'),
    artist: artistFacts,
  };

  const unused: StoredFact[] = [];
  for (const scope of preferScope) {
    for (const fact of pools[scope] ?? []) {
      if (usedFingerprints.has(factFingerprint(fact.fact))) continue;
      if (fact.topicKey && fact.topicKey !== 'misc' && blockedTopics.has(fact.topicKey)) continue;
      if (factsTooSimilar(fact.fact, rejectSimilarTo)) continue;
      if (!factFitsStoryLanguage(fact.fact, storyLanguage)) continue;
      if (!(fact.isHot ?? fact.interestRating >= HOT_MIN_RATING)) continue;
      if (!isSpeakableReferenceFact(fact.fact, artist, title)) continue;
      if (isAmbiguousCommonWordArtist(artist) && !factMentionsArtistAsEntity(fact.fact, artist)) continue;
      unused.push(fact);
    }
  }
  if (unused.length === 0) return null;
  const picked = unused[startOffset % unused.length]!;
  markFactUsed(picked.id, artist, title);
  return picked;
}

function markFactUsed(id: string, artist: string, title: string): void {
  const bank = loadBank();
  for (const pool of [bank.byTrack[trackKey(artist, title)] ?? [], bank.byArtist[artistKey(artist)] ?? []]) {
    const hit = pool.find((f) => f.id === id);
    if (hit) {
      hit.timesUsed += 1;
      hit.lastUsedAt = Date.now();
    }
  }
  saveBank(bank);
}
