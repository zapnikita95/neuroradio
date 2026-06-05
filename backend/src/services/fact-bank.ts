import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { interestRating10 } from './fact-interest-log.js';
import { factMentionsArtistAsEntity, isAmbiguousCommonWordArtist } from './fact-relevance.js';
import { interestScore } from './reference-fact-quality.js';
import type { FactScope } from './fact-picker.js';

export interface StoredFact {
  id: string;
  artist: string;
  title: string;
  scope: FactScope;
  fact: string;
  interestScore: number;
  interestRating: number;
  source: 'api' | 'llm' | 'wiki';
  timesUsed: number;
  addedAt: number;
  lastUsedAt?: number;
}

interface FactBankFile {
  byTrack: Record<string, StoredFact[]>;
  byArtist: Record<string, StoredFact[]>;
}

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const BANK_PATH = path.join(DATA_DIR, 'facts-bank.json');

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
  pool.push(entry);
  pool.sort((a, b) => b.interestScore - a.interestScore);
  if (pool.length > 40) pool.length = 40;
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
  const bank = loadBank();
  const tk = trackKey(artist, title);
  const ak = artistKey(artist);
  const trackPool = bank.byTrack[tk] ?? [];
  const artistPool = bank.byArtist[ak] ?? [];
  let saved = 0;

  for (const item of facts) {
    const trimmed = item.fact.trim();
    if (trimmed.length < 35) continue;
    if (!isValidStoredFact({ id: '', artist, title, scope: item.scope, fact: trimmed, interestScore: 0, interestRating: 0, source: item.source ?? 'api', timesUsed: 0, addedAt: 0 })) {
      continue;
    }
    const score = interestScore(trimmed);
    if (score < 6) continue;
    const stored: StoredFact = {
      id: crypto.randomUUID(),
      artist,
      title,
      scope: item.scope,
      fact: trimmed,
      interestScore: score,
      interestRating: interestRating10(trimmed),
      source: item.source ?? 'api',
      timesUsed: 0,
      addedAt: Date.now(),
    };
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
      `[fact-bank] saved ${saved} fact(s) score≥6 artist="${artist}" title="${title}" ` +
        `trackPool=${trackPool.length} artistPool=${artistPool.length} path=${BANK_PATH}`,
    );
  }

  return saved;
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
): StoredFact | null {
  const { track, artist: artistFacts } = listBankFacts(artist, title);
  const pools: Record<FactScope, StoredFact[]> = {
    track: track.filter((f) => f.scope === 'track'),
    album: track.filter((f) => f.scope === 'album'),
    artist: artistFacts,
  };

  for (const scope of preferScope) {
    for (const fact of pools[scope] ?? []) {
      if (usedFingerprints.has(factFingerprint(fact.fact))) continue;
      if (fact.interestScore < 6) continue;
      if (isAmbiguousCommonWordArtist(artist) && !factMentionsArtistAsEntity(fact.fact, artist)) continue;
      markFactUsed(fact.id, artist, title);
      return fact;
    }
  }
  return null;
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
