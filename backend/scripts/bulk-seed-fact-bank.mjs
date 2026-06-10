/**
 * Bulk harvest facts into facts-bank.json / facts-bank-seed.json.
 * Run: npm run build && node scripts/bulk-seed-fact-bank.mjs [--target 8000] [--concurrency 8] [--resume] [--limit 100]
 */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
import crypto from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harvestAllFacts } from '../dist/services/fact-sources/index.js';
import { interestScore } from '../dist/services/reference-fact-quality.js';
import { interestRating10 } from '../dist/services/fact-interest-log.js';
import { isBoringFact } from '../dist/services/reference-fact-quality.js';
import { BANK_PATH } from '../dist/services/fact-bank.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const CATALOG = join(__dir, '../src/data/popular-tracks-catalog.json');
const PROGRESS = join(__dir, '../data/bulk-seed-progress.json');
const SEED_OUT = join(__dir, '../data/facts-bank-seed.json');

const args = process.argv.slice(2);
const target = parseInt(args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? '8000', 10);
const concurrency = parseInt(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? '8', 10);
const trackLimit = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const resume = args.includes('--resume');

function trackKey(artist, title) {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

function artistKey(artist) {
  return artist.trim().toLowerCase();
}

function loadBank(path) {
  if (!existsSync(path)) return { byTrack: {}, byArtist: {} };
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveBank(path, bank) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(bank, null, 2), 'utf8');
}

function upsertFact(bank, artist, title, item) {
  const trimmed = item.fact.trim();
  if (trimmed.length < 35 || isBoringFact(trimmed)) return false;
  const score = interestScore(trimmed);
  if (score < 3) return false;
  const rating = interestRating10(trimmed);
  const stored = {
    id: crypto.randomUUID(),
    artist,
    title,
    scope: item.scope,
    fact: trimmed,
    interestScore: score,
    interestRating: rating,
    source: 'api',
    isHot: rating >= 6,
    harvestSource: item.source,
    timesUsed: 0,
    addedAt: Date.now(),
  };
  const fp = trimmed.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
  const tk = trackKey(artist, title);
  const ak = artistKey(artist);
  const pool = item.scope === 'artist' ? (bank.byArtist[ak] ??= []) : (bank.byTrack[tk] ??= []);
  if (pool.some((f) => f.fact.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200) === fp)) {
    return false;
  }
  pool.push(stored);
  pool.sort((a, b) => b.interestScore - a.interestScore);
  if (pool.length > 80) pool.length = 80;
  return true;
}

async function processTrack(bank, track, stats) {
  const { artist, title } = track;
  const countryCode = /[\u0400-\u04FF]/.test(artist + title) ? 'RU' : undefined;
  const facts = await harvestAllFacts({ artist, title, countryCode });
  let saved = 0;
  let savedHot = 0;
  for (const f of facts) {
    if (upsertFact(bank, artist, title, f)) {
      saved += 1;
      stats.bySource[f.source] = (stats.bySource[f.source] ?? 0) + 1;
      if (interestRating10(f.fact) >= 6) savedHot += 1;
    }
  }
  stats.total += saved;
  stats.hot += savedHot;
  stats.tracks += 1;
  return saved;
}

async function runPool(tracks, bank, stats, doneKeys) {
  let idx = 0;
  async function worker() {
    while (idx < tracks.length && stats.total < target) {
      const i = idx++;
      const track = tracks[i];
      const key = trackKey(track.artist, track.title);
      if (doneKeys.has(key)) continue;
      try {
        const saved = await processTrack(bank, track, stats);
        doneKeys.add(key);
        if (saved > 0) {
          console.log(`[${stats.tracks}] ${track.artist} — ${track.title}: +${saved} (total=${stats.total})`);
        }
        if (stats.tracks % 10 === 0) {
          saveBank(BANK_PATH, bank);
          writeFileSync(PROGRESS, JSON.stringify({ doneKeys: [...doneKeys], stats }, null, 2));
        }
      } catch (e) {
        console.warn(`fail ${track.artist} — ${track.title}:`, e.message);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
  let tracks = catalog.tracks ?? [];
  if (trackLimit > 0) tracks = tracks.slice(0, trackLimit);

  const bank = loadBank(BANK_PATH);
  const stats = { total: 0, hot: 0, tracks: 0, bySource: {} };
  const doneKeys = new Set();

  if (resume && existsSync(PROGRESS)) {
    const prog = JSON.parse(readFileSync(PROGRESS, 'utf8'));
    for (const k of prog.doneKeys ?? []) doneKeys.add(k);
    Object.assign(stats, prog.stats ?? {});
    console.log(`Resuming: ${doneKeys.size} tracks already done`);
  }

  await runPool(tracks, bank, stats, doneKeys);

  saveBank(BANK_PATH, bank);
  const hotOnly = {
    byTrack: {},
    byArtist: {},
  };
  for (const [k, pool] of Object.entries(bank.byTrack)) {
    const hot = pool.filter((f) => f.isHot);
    if (hot.length) hotOnly.byTrack[k] = hot;
  }
  for (const [k, pool] of Object.entries(bank.byArtist)) {
    const hot = pool.filter((f) => f.isHot);
    if (hot.length) hotOnly.byArtist[k] = hot;
  }
  saveBank(SEED_OUT, hotOnly);
  writeFileSync(
    PROGRESS,
    JSON.stringify({ doneKeys: [...doneKeys], stats, finishedAt: new Date().toISOString() }, null, 2),
  );

  const hotCount = Object.values(bank.byTrack).flat().filter((f) => f.isHot).length +
    Object.values(bank.byArtist).flat().filter((f) => f.isHot).length;
  console.log('\n=== Bulk seed report ===');
  console.log(`Tracks processed: ${stats.tracks}`);
  console.log(`Facts saved: ${stats.total}`);
  console.log(`Hot facts in bank: ${hotCount}`);
  console.log('By source:', stats.bySource);
  console.log(`Bank: ${BANK_PATH}`);
  console.log(`Hot seed: ${SEED_OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
