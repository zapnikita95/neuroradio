/**
 * Build facts-bank-seed.json from curated-facts.json (hot facts bootstrap).
 * Run: npm run build && node scripts/bootstrap-facts-seed.mjs
 */
import crypto from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { interestRating10 } from '../dist/services/fact-interest-log.js';
import { interestScore } from '../dist/services/reference-fact-quality.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const CURATED = join(__dir, '../src/data/curated-facts.json');
const OUT = join(__dir, '../src/data/facts-bank-seed.json');

function trackKey(artist, title) {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

function artistKey(artist) {
  return artist.trim().toLowerCase();
}

const entries = JSON.parse(readFileSync(CURATED, 'utf8'));
const bank = { byTrack: {}, byArtist: {} };

for (const entry of entries) {
  const score = interestScore(entry.fact);
  const rating = interestRating10(entry.fact);
  const stored = {
    id: crypto.randomUUID(),
    artist: entry.artist,
    title: entry.title,
    scope: entry.scope,
    fact: entry.fact,
    interestScore: score,
    interestRating: rating,
    source: 'api',
    isHot: true,
    harvestSource: 'curated',
    timesUsed: 0,
    addedAt: Date.now(),
  };
  if (entry.scope === 'artist') {
    const ak = artistKey(entry.artist);
    bank.byArtist[ak] ??= [];
    bank.byArtist[ak].push(stored);
  } else {
    const tk = trackKey(entry.artist, entry.title);
    bank.byTrack[tk] ??= [];
    bank.byTrack[tk].push(stored);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(bank, null, 2), 'utf8');
const hot =
  Object.values(bank.byTrack).flat().filter((f) => f.isHot).length +
  Object.values(bank.byArtist).flat().filter((f) => f.isHot).length;
console.log(`Wrote ${OUT}: track pools=${Object.keys(bank.byTrack).length} hot=${hot}`);
