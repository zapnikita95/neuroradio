/**
 * Bulk harvest facts into facts-bank.json / facts-bank-seed.json.
 * Run: npm run build && node scripts/bulk-seed-fact-bank.mjs [--target=8000] [--concurrency=4] [--resume]
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
import { classifyFactTopic, poolHasTopicDuplicate } from '../dist/services/fact-topic.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const CATALOG = join(__dir, '../src/data/popular-tracks-catalog.json');
const PROGRESS = join(__dir, '../data/bulk-seed-progress.json');
const SEED_OUT = join(__dir, '../data/facts-bank-seed.json');

const args = process.argv.slice(2);
const target = parseInt(args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? '8000', 10);
const concurrency = parseInt(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? '4', 10);
const trackLimit = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const resume = args.includes('--resume');
const backfillLastfm = !args.includes('--no-backfill-lastfm');

const JUNK_ARTIST =
  /^(karaoke version|ameritz|party allstars|the latin party allstars|the latin party)$/i;
const JUNK_TITLE =
  /originally recorded|in the style of|\(karaoke|\(radio edit\)|\(instrumental\)/i;

function trackKey(artist, title) {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

function artistKey(artist) {
  return artist.trim().toLowerCase();
}

function isHarvestableTrack(track) {
  const { artist, title } = track;
  if (!artist?.trim() || !title?.trim()) return false;
  if (JUNK_ARTIST.test(artist.trim())) return false;
  if (JUNK_TITLE.test(title)) return false;
  return true;
}

function trackPriority(track) {
  const s = track.source ?? '';
  if (s.startsWith('seed-ru')) return 0;
  if (s.startsWith('lastfm')) return 1;
  if (s.startsWith('seed-global')) return 2;
  if (s.includes('deezer') || s.includes('itunes')) return 3;
  if (s === 'cover-classics') return 8;
  return 5;
}

function hasLastfmInBank(bank, artist, title) {
  const tk = trackKey(artist, title);
  const ak = artistKey(artist);
  const pool = [...(bank.byTrack[tk] ?? []), ...(bank.byArtist[ak] ?? [])];
  return pool.some((f) => f.harvestSource === 'lastfm');
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
  const topicKey = classifyFactTopic(trimmed);
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
    topicKey,
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
  if (
    topicKey !== 'misc' &&
    pool.some((f) => f.topicKey === topicKey && f.topicKey !== 'misc')
  ) {
    return false;
  }
  if (poolHasTopicDuplicate(trimmed, pool.map((f) => f.fact))) {
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
  let savedLastfm = 0;
  for (const f of facts) {
    if (upsertFact(bank, artist, title, f)) {
      saved += 1;
      stats.bySource[f.source] = (stats.bySource[f.source] ?? 0) + 1;
      if (f.source === 'lastfm') savedLastfm += 1;
      if (interestRating10(f.fact) >= 6) savedHot += 1;
    }
  }
  stats.total += saved;
  stats.hot += savedHot;
  stats.tracks += 1;
  return { saved, savedLastfm };
}

function orderTracks(tracks, doneKeys, bank) {
  const pending = [];
  const backfill = [];
  for (const t of tracks) {
    const key = trackKey(t.artist, t.title);
    if (!doneKeys.has(key)) {
      pending.push(t);
    } else if (backfillLastfm && !hasLastfmInBank(bank, t.artist, t.title)) {
      backfill.push(t);
    }
  }
  const byPri = (a, b) => trackPriority(a) - trackPriority(b);
  return [...pending.sort(byPri), ...backfill.sort(byPri)];
}

async function runPool(tracks, bank, stats, doneKeys) {
  let idx = 0;
  async function worker() {
    while (idx < tracks.length && stats.total < target) {
      const i = idx++;
      const track = tracks[i];
      const key = trackKey(track.artist, track.title);
      try {
        const { saved, savedLastfm } = await processTrack(bank, track, stats);
        doneKeys.add(key);
        if (saved > 0) {
          const lf = savedLastfm > 0 ? ` lastfm=${savedLastfm}` : '';
          console.log(`[${stats.tracks}] ${track.artist} — ${track.title}: +${saved}${lf} (total=${stats.total})`);
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
  let tracks = (catalog.tracks ?? []).filter(isHarvestableTrack);
  if (trackLimit > 0) tracks = tracks.slice(0, trackLimit);

  const bank = loadBank(BANK_PATH);
  const stats = { total: 0, hot: 0, tracks: 0, bySource: {} };
  const doneKeys = new Set();

  if (resume && existsSync(PROGRESS)) {
    const prog = JSON.parse(readFileSync(PROGRESS, 'utf8'));
    for (const k of prog.doneKeys ?? []) doneKeys.add(k);
    Object.assign(stats, prog.stats ?? {});
    console.log(`Resuming: ${doneKeys.size} tracks marked done, facts=${stats.total}`);
  }

  const ordered = orderTracks(tracks, doneKeys, bank);
  const backfillCount = ordered.filter((t) => doneKeys.has(trackKey(t.artist, t.title))).length;
  console.log(
    `Catalog: ${tracks.length} harvestable / ${(catalog.tracks ?? []).length} total | queue: ${ordered.length} (${backfillCount} lastfm backfill)`,
  );

  await runPool(ordered, bank, stats, doneKeys);

  saveBank(BANK_PATH, bank);
  const hotOnly = { byTrack: {}, byArtist: {} };
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

  const hotCount =
    Object.values(bank.byTrack).flat().filter((f) => f.isHot).length +
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
