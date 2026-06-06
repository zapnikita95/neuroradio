import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestFacts } from './fact-bank.js';
import { trackKey } from './fact-bank.js';
import type { FactScope } from './fact-picker.js';
import {
  normalizeTitleForLookup,
  resolveCoverForFacts,
} from './cover-resolve.js';

export interface CuratedFactEntry {
  artist: string;
  title: string;
  scope: FactScope;
  fact: string;
}

const __dir = dirname(fileURLToPath(import.meta.url));

let cachedEntries: CuratedFactEntry[] | null = null;

function loadJsonEntries(filename: string): CuratedFactEntry[] {
  try {
    const path = join(__dir, 'data', filename);
    return JSON.parse(readFileSync(path, 'utf8')) as CuratedFactEntry[];
  } catch {
    return [];
  }
}

function loadAllCuratedEntries(): CuratedFactEntry[] {
  if (cachedEntries) return cachedEntries;
  cachedEntries = [
    ...loadJsonEntries('curated-facts.json'),
    ...loadJsonEntries('cover-classics.json'),
  ];
  return cachedEntries;
}

/** Match curated fact by performer title, cover-resolved original, or normalized title. */
export function lookupCuratedFact(artist: string, title: string): CuratedFactEntry | null {
  const entries = loadAllCuratedEntries();
  const cover = resolveCoverForFacts(artist, title);
  const keys = new Set([
    trackKey(artist, title),
    trackKey(cover.factArtist, cover.factTitle),
    trackKey(cover.factArtist, title),
    `${cover.factArtist.trim().toLowerCase()}|${normalizeTitleForLookup(title)}`,
    `${artist.trim().toLowerCase()}|${normalizeTitleForLookup(title)}`,
  ]);

  for (const entry of entries) {
    if (keys.has(trackKey(entry.artist, entry.title))) return entry;
    if (
      normalizeTitleForLookup(entry.title) === normalizeTitleForLookup(cover.factTitle) &&
      entry.artist.trim().toLowerCase() === cover.factArtist.trim().toLowerCase()
    ) {
      return entry;
    }
  }
  return null;
}

/** Одноразово подмешивает проверенные факты в facts-bank (идемпотентно по fingerprint). */
export function ingestCuratedFactsOnBoot(): number {
  const raw = loadAllCuratedEntries();
  if (raw.length === 0) return 0;

  let total = 0;
  for (const entry of raw) {
    total += ingestFacts(entry.artist, entry.title, [
      { fact: entry.fact, scope: entry.scope, source: 'api' },
    ]);
  }
  if (total > 0) {
    console.log(`[fact-bank] curated facts ingested: ${total} new (${raw.length} catalog entries)`);
  }
  return total;
}
