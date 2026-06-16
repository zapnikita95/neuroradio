/**
 * Bulk harvest facts into facts-bank.json / facts-bank-seed.json.
 * Checkpoint every 10 tracks (bank + hot-seed + progress).
 * Run: node scripts/bulk-seed-fact-bank.mjs [--target=8000] [--concurrency=2] [--resume] [--retry-zero] [--no-proxy]
 */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
process.env.HARVEST_RATE_LIMIT = 'true';
process.env.BULK_HARVEST = 'true';
import crypto from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harvestAllFacts, fetchDiscogsFacts } from '../dist/services/fact-sources/index.js';
import { interestScore } from '../dist/services/reference-fact-quality.js';
import { interestRating10 } from '../dist/services/fact-interest-log.js';
import { isBoringFact, isMetadataHarvestFact } from '../dist/services/reference-fact-quality.js';
import { BANK_PATH, refreshBankInterestScores } from '../dist/services/fact-bank.js';
import { classifyFactTopic, poolHasTopicDuplicate } from '../dist/services/fact-topic.js';
import { isParserTrustedHarvestSource } from '../dist/services/fact-sources/types.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const CATALOG = join(__dir, '../src/data/popular-tracks-catalog.json');
const PROGRESS = join(__dir, '../data/bulk-seed-progress.json');
const SEED_OUT = join(__dir, '../data/facts-bank-seed.json');

const args = process.argv.slice(2);
const target = parseInt(args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? '60000', 10);
const hotTarget = parseInt(args.find((a) => a.startsWith('--hot-target='))?.split('=')[1] ?? '20000', 10);
const concurrency = parseInt(
  args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ??
    (args.includes('--discogs-only') ? '1' : hotPush ? '5' : '3'),
  10,
);
const trackLimit = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const resume = args.includes('--resume');
const retryZero = args.includes('--retry-zero');
const hotPush = args.includes('--hot-push');
const discogsOnly = args.includes('--discogs-only');
const backfillDiscogs = !hotPush && (args.includes('--backfill-discogs') || discogsOnly);
const backfillLastfm = !hotPush && !args.includes('--no-backfill-lastfm') && !discogsOnly;

const JUNK_ARTIST =
  /^(karaoke version|ameritz|party allstars|the latin party allstars|the latin party)$/i;
const JUNK_TITLE =
  /originally recorded|in the style of|\(karaoke|\(radio edit\)|\(instrumental\)/i;
const JUNK_FACT = /\b(?:in the style of|karaoke version)\b/i;

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
  if (s.startsWith('genre-top')) return -5;
  if (s.startsWith('genre-year')) return -4;
  if (s.startsWith('lastfm-year') || s.startsWith('lastfm-decade')) return -3;
  if (s.startsWith('lastfm-tag')) return -2;
  if (s.startsWith('seed-ru')) return 0;
  if (s.startsWith('lastfm')) return 1;
  if (s.startsWith('seed-global')) return 2;
  if (s.includes('deezer') || s.includes('itunes')) return 3;
  if (s === 'cover-classics') return 8;
  return 5;
}

function hasSubstantiveInPool(pool) {
  return (pool ?? []).some((f) => !f.isMetadata);
}

function hasSubstantiveFactsInBank(bank, artist, title) {
  const tk = trackKey(artist, title);
  if (hasSubstantiveInPool(bank.byTrack[tk])) return true;
  const ak = artistKey(artist);
  return hasSubstantiveInPool(bank.byArtist[ak]);
}

function summarizeBank(bank) {
  const byScope = { track: 0, album: 0, artist: 0 };
  let substantive = 0;
  let metadata = 0;
  let hot = 0;
  for (const pool of [...Object.values(bank.byTrack ?? {}), ...Object.values(bank.byArtist ?? {})]) {
    for (const f of pool) {
      if (f.isMetadata) {
        metadata += 1;
        continue;
      }
      substantive += 1;
      if (f.scope === 'album') byScope.album += 1;
      else if (f.scope === 'artist') byScope.artist += 1;
      else byScope.track += 1;
      if (f.isHot) hot += 1;
    }
  }
  return { byScope, substantive, metadata, hot };
}

function buildHotSeed(bank) {
  const hotOnly = { byTrack: {}, byArtist: {} };
  for (const [k, pool] of Object.entries(bank.byTrack ?? {})) {
    const hot = pool.filter((f) => f.isHot && !f.isMetadata);
    if (hot.length) hotOnly.byTrack[k] = hot;
  }
  for (const [k, pool] of Object.entries(bank.byArtist ?? {})) {
    const hot = pool.filter((f) => f.isHot && !f.isMetadata);
    if (hot.length) hotOnly.byArtist[k] = hot;
  }
  return hotOnly;
}

function hasLastfmInBank(bank, artist, title) {
  const tk = trackKey(artist, title);
  const ak = artistKey(artist);
  const pool = [...(bank.byTrack[tk] ?? []), ...(bank.byArtist[ak] ?? [])];
  return pool.some((f) => f.harvestSource === 'lastfm');
}

function hasDiscogsInBank(bank, artist, title) {
  const tk = trackKey(artist, title);
  const pool = bank.byTrack[tk] ?? [];
  return pool.some((f) => f.harvestSource === 'discogs' || f.scope === 'album');
}

function countHotInBank(bank) {
  return (
    Object.values(bank.byTrack ?? {})
      .flat()
      .filter((f) => f.isHot && !f.isMetadata).length +
    Object.values(bank.byArtist ?? {})
      .flat()
      .filter((f) => f.isHot && !f.isMetadata).length
  );
}

function loadBank(path) {
  if (!existsSync(path)) return { byTrack: {}, byArtist: {} };
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveBank(path, bank) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(bank, null, 2), 'utf8');
}

function normalizeBankMetadata(bank) {
  for (const pool of [...Object.values(bank.byTrack ?? {}), ...Object.values(bank.byArtist ?? {})]) {
    for (const f of pool) {
      if (!f.isMetadata && isMetadataHarvestFact(f.fact)) {
        f.isMetadata = true;
        f.isHot = false;
      }
    }
  }
}

function saveCheckpoint(bank, stats, doneKeys, zeroFactKeys) {
  normalizeBankMetadata(bank);
  const bankSummary = summarizeBank(bank);
  stats.hot = bankSummary.hot;
  stats.metadata = bankSummary.metadata;
  stats.byScope = bankSummary.byScope;
  stats.substantive = bankSummary.substantive;
  saveBank(BANK_PATH, bank);
  saveBank(SEED_OUT, buildHotSeed(bank));
  writeFileSync(
    PROGRESS,
    JSON.stringify(
      {
        doneKeys: [...doneKeys],
        zeroFactKeys: [...zeroFactKeys],
        stats,
        savedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function shouldRejectFact(trimmed, item) {
  if (JUNK_FACT.test(trimmed)) return 'junk';
  if (isParserTrustedHarvestSource(item.source)) return null;
  if (item.scope === 'artist' && item.source === 'wiki' && trimmed.length >= 80) {
    return interestScore(trimmed) < 2 ? 'wiki_low_score' : null;
  }
  if (isBoringFact(trimmed)) return 'boring';
  return null;
}

function upsertRejectReason(bank, artist, title, item) {
  const trimmed = item.fact.trim();
  if (trimmed.length < 35) return 'short';
  const quality = shouldRejectFact(trimmed, item);
  if (quality) return quality;
  const score = interestScore(trimmed);
  const minScore = isParserTrustedHarvestSource(item.source) ? 0 : 3;
  if (score < minScore) return `score<${minScore}`;
  const fp = trimmed.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
  const tk = trackKey(artist, title);
  const ak = artistKey(artist);
  const pool = item.scope === 'artist' ? (bank.byArtist[ak] ?? []) : (bank.byTrack[tk] ?? []);
  if (pool.some((f) => f.fact.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200) === fp)) {
    return 'duplicate';
  }
  const topicKey = classifyFactTopic(trimmed);
  if (
    topicKey !== 'misc' &&
    pool.some((f) => f.topicKey === topicKey && f.topicKey !== 'misc')
  ) {
    return `topic:${topicKey}`;
  }
  if (poolHasTopicDuplicate(trimmed, pool.map((f) => f.fact))) return 'topic_overlap';
  return null;
}

function isMetadataItem(item) {
  return Boolean(item.metadataOnly) || isMetadataHarvestFact(item.fact);
}

function upsertFact(bank, artist, title, item) {
  const trimmed = item.fact.trim();
  if (upsertRejectReason(bank, artist, title, item)) return false;
  const isMetadata = isMetadataItem(item);
  const score = interestScore(trimmed);
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
    isMetadata,
    isHot: !isMetadata && rating >= 6 && !JUNK_FACT.test(trimmed),
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
  return isMetadata ? 'metadata' : 'substantive';
}

async function saveFacts(bank, artist, title, facts, stats) {
  let savedSubstantive = 0;
  let savedMetadata = 0;
  let savedLastfm = 0;
  const rejectCounts = {};
  for (const f of facts) {
    const result = upsertFact(bank, artist, title, f);
    if (result === 'substantive') {
      savedSubstantive += 1;
      stats.bySource[f.source] = (stats.bySource[f.source] ?? 0) + 1;
      if (f.source === 'lastfm') savedLastfm += 1;
    } else if (result === 'metadata') {
      savedMetadata += 1;
    } else {
      const why = upsertRejectReason(bank, artist, title, f) ?? 'unknown';
      rejectCounts[why] = (rejectCounts[why] ?? 0) + 1;
    }
  }
  stats.total += savedSubstantive;
  stats.metadata = (stats.metadata ?? 0) + savedMetadata;
  stats.hot = countHotInBank(bank);
  stats.tracks += 1;
  return {
    saved: savedSubstantive,
    savedMetadata,
    savedLastfm,
    harvested: facts.length,
    rejectCounts,
  };
}

async function processTrack(bank, track, stats) {
  const { artist, title } = track;
  const countryCode = /[\u0400-\u04FF]/.test(artist + title) ? 'RU' : undefined;
  const facts = discogsOnly
    ? await fetchDiscogsFacts({ artist, title, countryCode })
    : await harvestAllFacts({ artist, title, countryCode });
  return saveFacts(bank, artist, title, facts, stats);
}

function isTopCatalogTrack(track) {
  const s = track.source ?? '';
  return (
    s.startsWith('genre-top') ||
    s.startsWith('genre-year') ||
    s.startsWith('lastfm-year') ||
    s.startsWith('lastfm-decade')
  );
}

function orderTracks(tracks, doneKeys, bank, zeroFactKeys) {
  const pending = [];
  const backfill = [];
  const discogsBackfill = [];
  for (const t of tracks) {
    const key = trackKey(t.artist, t.title);
    if (!doneKeys.has(key)) {
      pending.push(t);
    } else if (backfillDiscogs && !hasDiscogsInBank(bank, t.artist, t.title)) {
      discogsBackfill.push(t);
    } else if (backfillLastfm && !hasLastfmInBank(bank, t.artist, t.title)) {
      backfill.push(t);
    }
  }
  const byPri = (a, b) => trackPriority(a) - trackPriority(b);
  const pendingTops = pending.filter(isTopCatalogTrack);
  const pendingRest = pending.filter((t) => !isTopCatalogTrack(t));

  if (backfillDiscogs && discogsBackfill.length) {
    console.log(`Discogs backfill: ${discogsBackfill.length} tracks without album facts (after tops)`);
  }
  console.log(
    `Queue priority: tops=${pendingTops.length} pending=${pendingRest.length} discogs=${discogsBackfill.length} backfill=${backfill.length}`,
  );

  if (retryZero) {
    const retry = tracks.filter((t) => {
      const key = trackKey(t.artist, t.title);
      return zeroFactKeys.has(key) || (doneKeys.has(key) && !hasSubstantiveFactsInBank(bank, t.artist, t.title));
    });
    return [
      ...pendingTops.sort(byPri),
      ...discogsBackfill.sort(byPri),
      ...pendingRest.sort(byPri),
      ...backfill.sort(byPri),
      ...retry.sort(byPri),
    ];
  }

  return [
    ...pendingTops.sort(byPri),
    ...discogsBackfill.sort(byPri),
    ...pendingRest.sort(byPri),
    ...backfill.sort(byPri),
  ];
}

async function runPool(tracks, bank, stats, doneKeys, zeroFactKeys) {
  let idx = 0;
  async function worker() {
    while (
      idx < tracks.length &&
      stats.total < target &&
      countHotInBank(bank) < hotTarget
    ) {
      const i = idx++;
      const track = tracks[i];
      const key = trackKey(track.artist, track.title);
      try {
        const { saved, savedMetadata, savedLastfm, harvested, rejectCounts } = await processTrack(
          bank,
          track,
          stats,
        );
        doneKeys.add(key);
        const substantiveNow = hasSubstantiveFactsInBank(bank, track.artist, track.title);
        if (!substantiveNow) {
          zeroFactKeys.add(key);
          stats.zeroFacts = (stats.zeroFacts ?? 0) + 1;
          const rejectHint =
            harvested > 0 && Object.keys(rejectCounts).length
              ? ` rejected=${JSON.stringify(rejectCounts)}`
              : '';
          const metaHint = savedMetadata > 0 ? ` metaOnly=${savedMetadata}` : '';
          console.warn(
            `[${stats.tracks}] ZERO ${track.artist} — ${track.title} (harvested=${harvested}${rejectHint}${metaHint}, zeroTotal=${stats.zeroFacts})`,
          );
        } else {
          zeroFactKeys.delete(key);
          const lf = savedLastfm > 0 ? ` lastfm=${savedLastfm}` : '';
          const meta = savedMetadata > 0 ? ` meta=${savedMetadata}` : '';
          console.log(
            `[${stats.tracks}] ${track.artist} — ${track.title}: +${saved}${lf}${meta} (total=${stats.total})`,
          );
        }
        if (stats.tracks % 10 === 0) {
          saveCheckpoint(bank, stats, doneKeys, zeroFactKeys);
        }
      } catch (e) {
        console.warn(`fail ${track.artist} — ${track.title}:`, e.message);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

async function main() {
  refreshBankInterestScores();
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
  let tracks = (catalog.tracks ?? []).filter(isHarvestableTrack);
  if (trackLimit > 0) tracks = tracks.slice(0, trackLimit);

  const bank = loadBank(BANK_PATH);
  const stats = { total: 0, hot: 0, tracks: 0, zeroFacts: 0, bySource: {} };
  const doneKeys = new Set();
  const zeroFactKeys = new Set();

  if (resume && existsSync(PROGRESS)) {
    const prog = JSON.parse(readFileSync(PROGRESS, 'utf8'));
    for (const k of prog.doneKeys ?? []) doneKeys.add(k);
    for (const k of prog.zeroFactKeys ?? []) zeroFactKeys.add(k);
    Object.assign(stats, prog.stats ?? {});
    // Recount substantive total without metadata after bank normalization.
    normalizeBankMetadata(bank);
    const recap = summarizeBank(bank);
    stats.total = recap.substantive;
    stats.metadata = recap.metadata;
    stats.byScope = recap.byScope;
    stats.substantive = recap.substantive;
    stats.hot = recap.hot;
    console.log(
      `Resuming: ${doneKeys.size} tracks done, zero=${zeroFactKeys.size}, substantive=${recap.substantive}, metadata=${recap.metadata}`,
    );
  }

  if (retryZero && zeroFactKeys.size === 0) {
    for (const t of tracks) {
      const key = trackKey(t.artist, t.title);
      if (doneKeys.has(key) && !hasSubstantiveFactsInBank(bank, t.artist, t.title)) {
        zeroFactKeys.add(key);
      }
    }
    console.log(`Bootstrapped ${zeroFactKeys.size} zero-fact track keys from bank gap`);
  }

  saveCheckpoint(bank, stats, doneKeys, zeroFactKeys);
  console.log(`Checkpoint: hot-seed rebuilt from bank (${Object.keys(buildHotSeed(bank).byTrack).length} track keys)`);

  const ordered = orderTracks(tracks, doneKeys, bank, zeroFactKeys);
  let queue = ordered;
  if (hotPush) {
    queue = tracks
      .filter((t) => !doneKeys.has(trackKey(t.artist, t.title)) && isTopCatalogTrack(t))
      .sort((a, b) => trackPriority(a) - trackPriority(b));
    console.log(
      `HOT-PUSH: ${queue.length} top-catalog tracks only (skip discogs/backfill/obscure until hot≥${hotTarget})`,
    );
  }
  const backfillCount = queue.filter((t) => doneKeys.has(trackKey(t.artist, t.title))).length;
  console.log(
    `Targets: facts=${target} hot=${hotTarget} | mode=${hotPush ? 'hot-push' : discogsOnly ? 'discogs-only' : 'full'} concurrency=${concurrency}`,
  );
  console.log(
    `Catalog: ${tracks.length} harvestable / ${(catalog.tracks ?? []).length} total | queue: ${queue.length} (${backfillCount} backfill) | bank hot=${countHotInBank(bank)}`,
  );

  await runPool(queue, bank, stats, doneKeys, zeroFactKeys);

  saveCheckpoint(bank, stats, doneKeys, zeroFactKeys);
  writeFileSync(
    PROGRESS,
    JSON.stringify(
      {
        doneKeys: [...doneKeys],
        zeroFactKeys: [...zeroFactKeys],
        stats,
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  const hotCount =
    Object.values(bank.byTrack).flat().filter((f) => f.isHot && !f.isMetadata).length +
    Object.values(bank.byArtist).flat().filter((f) => f.isHot && !f.isMetadata).length;
  const bankSummary = summarizeBank(bank);
  console.log('\n=== Bulk seed report ===');
  console.log(`Tracks processed: ${stats.tracks}`);
  console.log(`Substantive facts: ${bankSummary.substantive} (progress total=${stats.total})`);
  console.log(`Metadata stored (not counted): ${bankSummary.metadata}`);
  console.log(`By scope: track=${bankSummary.byScope.track} album=${bankSummary.byScope.album} artist=${bankSummary.byScope.artist}`);
  console.log(`Tracks with zero substantive facts: ${stats.zeroFacts ?? zeroFactKeys.size}`);
  console.log(`Hot facts in bank: ${hotCount}`);
  console.log('By source:', stats.bySource);
  console.log(`Bank: ${BANK_PATH}`);
  console.log(`Hot seed: ${SEED_OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
