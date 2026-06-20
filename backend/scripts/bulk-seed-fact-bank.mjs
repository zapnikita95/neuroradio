/**
 * Bulk harvest facts into facts-bank.json / facts-bank-seed.json.
 * Checkpoint every 10 tracks (bank + hot-seed + progress).
 * Run: node scripts/bulk-seed-fact-bank.mjs [--target=8000] [--concurrency=2] [--resume] [--retry-zero] [--no-proxy] [--skip-vpn-check]
 */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
process.env.HARVEST_RATE_LIMIT = 'true';
process.env.BULK_HARVEST = 'true';
import crypto from 'node:crypto';
import net from 'node:net';
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
const PRIORITY_ARTISTS_PATH = join(__dir, '../src/data/priority-fact-artists.json');
const PROGRESS = join(__dir, '../data/bulk-seed-progress.json');
const SEED_OUT = join(__dir, '../data/facts-bank-seed.json');

const args = process.argv.slice(2);
const target = parseInt(args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? '60000', 10);
const hotTarget = parseInt(args.find((a) => a.startsWith('--hot-target='))?.split('=')[1] ?? '20000', 10);
const hotPush = args.includes('--hot-push');
const concurrency = parseInt(
  args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ??
    (args.includes('--discogs-only') ? '1' : hotPush ? '5' : '3'),
  10,
);
const trackLimit = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const resume = args.includes('--resume');
const retryZero = args.includes('--retry-zero');
const discogsOnly = args.includes('--discogs-only');
const skipVpnCheck = args.includes('--skip-vpn-check');
const noProxy = args.includes('--no-proxy');
const backfillDiscogs = !hotPush && (args.includes('--backfill-discogs') || discogsOnly);
const backfillLastfm = !hotPush && !args.includes('--no-backfill-lastfm') && !discogsOnly;

const JUNK_ARTIST =
  /^(karaoke version|ameritz|party allstars|the latin party allstars|the latin party)$/i;
const JUNK_TITLE =
  /originally recorded|in the style of|\(karaoke|\(radio edit\)|\(instrumental\)/i;
const JUNK_FACT = /\b(?:in the style of|karaoke version)\b/i;

/** Major hits — always first in hot-push queue. */
const PRIORITY_HOT_TRACKS = [
  ['Sting', 'Shape of My Heart'],
  ['Sting', 'Fields of Gold'],
  ['Sting', 'Englishman In New York'],
  ['Sting', 'Desert Rose'],
  ['Sting', 'Fragile'],
  ['Sting', 'Russians'],
  ['The Police', 'Every Breath You Take'],
  ['The Police', 'Roxanne'],
  ['The Police', 'Message in a Bottle'],
];

function trackKey(artist, title) {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

function artistKey(artist) {
  return artist
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
}

const { priorityArtistSet, priorityArtistOrder } = loadPriorityArtists();

function loadPriorityArtists() {
  if (!existsSync(PRIORITY_ARTISTS_PATH)) {
    return { priorityArtistSet: new Set(), priorityArtistOrder: new Map() };
  }
  const data = JSON.parse(readFileSync(PRIORITY_ARTISTS_PATH, 'utf8'));
  const order = new Map();
  const set = new Set();
  for (const [i, name] of (data.artists ?? []).entries()) {
    const k = artistKey(name);
    if (!k || set.has(k)) continue;
    set.add(k);
    order.set(k, i);
  }
  return { priorityArtistSet: set, priorityArtistOrder: order };
}

function isPriorityArtist(artist) {
  return priorityArtistSet.has(artistKey(artist));
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
  if (s.startsWith('seed-global:priority-artist') || s.includes(':priority-retry')) return -7;
  if (s.startsWith('seed-global:priority')) return -6;
  if (s.startsWith('genre-top')) return -5;
  if (s.startsWith('lastfm-global-chart') || s.startsWith('deezer-chart-0')) return -5;
  if (s.startsWith('genre-year')) return -4;
  if (s.startsWith('deezer-chart-')) return -4;
  if (s.startsWith('seed-global')) return -4;
  if (s.startsWith('itunes-chart-')) return -4;
  if (s.startsWith('lastfm-year') || s.startsWith('lastfm-decade')) return -3;
  if (s.startsWith('lastfm-tag')) return -3;
  if (s.startsWith('lastfm-geo-')) return -2;
  if (s.startsWith('seed-ru')) return 0;
  if (s.startsWith('lastfm')) return 1;
  if (s.includes('deezer') || s.includes('itunes')) return 3;
  if (s === 'cover-classics') return 8;
  return 5;
}

function countTrackHotInBank(bank, artist, title) {
  const tk = trackKey(artist, title);
  return (bank.byTrack[tk] ?? []).filter((f) => f.isHot && !f.isMetadata).length;
}

function buildPriorityHotQueue(bank, doneKeys) {
  return PRIORITY_HOT_TRACKS.map(([artist, title]) => ({
    artist,
    title,
    source: 'seed-global:priority',
  })).filter(({ artist, title }) => {
    const key = trackKey(artist, title);
    if (!doneKeys.has(key)) return true;
    return countTrackHotInBank(bank, artist, title) < 1;
  });
}

function trackNeedsHotPushHarvest(bank, track, doneKeys) {
  const { artist, title } = track;
  const key = trackKey(artist, title);
  if (!doneKeys.has(key)) return true;
  if (!hasSubstantiveFactsInBank(bank, artist, title)) return true;
  return countTrackHotInBank(bank, artist, title) < 1;
}

/** All catalog tracks for fact-rich classics — any source, including playlists. */
function buildPriorityArtistQueue(allTracks, bank, doneKeys) {
  const out = [];
  for (const t of allTracks) {
    if (!isPriorityArtist(t.artist)) continue;
    if (!trackNeedsHotPushHarvest(bank, t, doneKeys)) continue;
    const key = trackKey(t.artist, t.title);
    out.push({
      ...t,
      source: doneKeys.has(key)
        ? `${t.source ?? 'catalog'}:priority-retry`
        : `seed-global:priority-artist:${t.source ?? 'catalog'}`,
    });
  }
  return out.sort((a, b) => {
    const ia = priorityArtistOrder.get(artistKey(a.artist)) ?? 9999;
    const ib = priorityArtistOrder.get(artistKey(b.artist)) ?? 9999;
    if (ia !== ib) return ia - ib;
    return compareHotPushTracks(a, b);
  });
}

function buildArtistsWithSubstantiveFacts(bank) {
  const set = new Set();
  for (const [k, pool] of Object.entries(bank.byArtist ?? {})) {
    if (hasSubstantiveInPool(pool)) set.add(k);
  }
  for (const [tk, pool] of Object.entries(bank.byTrack ?? {})) {
    if (hasSubstantiveInPool(pool)) set.add(tk.split('|')[0]);
  }
  return set;
}

function compareHotPushTracksWithBank(a, b, artistsWithFacts) {
  const gapA =
    (isPriorityArtist(a.artist) ? -4 : 0) + (artistsWithFacts.has(artistKey(a.artist)) ? 0 : -2);
  const gapB =
    (isPriorityArtist(b.artist) ? -4 : 0) + (artistsWithFacts.has(artistKey(b.artist)) ? 0 : -2);
  const pri = trackPriority(a) + gapA - (trackPriority(b) + gapB);
  if (pri !== 0) return pri;
  const yearA = parseInt(a.source?.match(/:(\d{4})(?:$|:)/)?.[1] ?? a.year ?? '0', 10);
  const yearB = parseInt(b.source?.match(/:(\d{4})(?:$|:)/)?.[1] ?? b.year ?? '0', 10);
  return yearB - yearA;
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
    s.startsWith('lastfm-decade') ||
    s.startsWith('lastfm-tag') ||
    s.startsWith('lastfm-global-chart') ||
    s.startsWith('deezer-chart-') ||
    s.startsWith('itunes-chart-') ||
    s.startsWith('seed-global')
  );
}

function compareHotPushTracks(a, b) {
  const pri = trackPriority(a) - trackPriority(b);
  if (pri !== 0) return pri;
  const yearA = parseInt(a.source?.match(/:(\d{4})(?:$|:)/)?.[1] ?? a.year ?? '0', 10);
  const yearB = parseInt(b.source?.match(/:(\d{4})(?:$|:)/)?.[1] ?? b.year ?? '0', 10);
  return yearB - yearA;
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
  const byPri = compareHotPushTracks;
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
  function shouldContinue() {
    const hotLeft = countHotInBank(bank) < hotTarget;
    if (hotPush) return hotLeft;
    return stats.total < target && hotLeft;
  }
  async function worker() {
    while (idx < tracks.length && shouldContinue()) {
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

function proxyPortAlive(port = 1301) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    s.once('connect', () => {
      s.end();
      resolve(true);
    });
    s.once('error', () => resolve(false));
    setTimeout(() => {
      s.destroy();
      resolve(false);
    }, 800);
  });
}

async function lastfmReachable() {
  const key = process.env.LASTFM_API_KEY?.trim();
  if (!key) return true;
  try {
    const url =
      `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${encodeURIComponent(key)}` +
      `&artist=The%20Beatles&track=Yesterday&format=json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Last.fm blocked in RU without hidemy — refuse to chew queue on discogs-only sludge. */
async function assertHarvestNetwork() {
  if (skipVpnCheck) {
    console.warn('[vpn] --skip-vpn-check: старт без проверки VPN/Last.fm');
    return;
  }
  if (noProxy) {
    console.warn(
      '[vpn] --no-proxy: hidemy 127.0.0.1:1301 не используется; нужен системный VPN или Last.fm не ответит',
    );
  }
  const proxyUp = await proxyPortAlive();
  if (hotPush && !noProxy && !proxyUp) {
    console.error('\n=== hot-push: hidemy VPN выключен (127.0.0.1:1301) ===');
    console.error('Last.fm и wiki без VPN в РФ не работают — процесс не стартует.');
    console.error('Включи hidemy.name → npm run seed:hot-push (или run-overnight-hot-push.ps1)');
    console.error('Принудительно без VPN: --skip-vpn-check\n');
    process.exit(1);
  }
  const lastfmOk = await lastfmReachable();
  const viaProxy = Boolean(process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim());
  if (lastfmOk) {
    console.log(
      `[vpn] Last.fm OK${proxyUp ? ' (hidemy 1301 up' + (viaProxy ? ', proxy active)' : ')') : viaProxy ? ' (via proxy)' : ''}`,
    );
    return;
  }
  console.error('\n=== Last.fm недоступен — harvest бессмысленен ===');
  console.error(`hidemy proxy 127.0.0.1:1301: ${proxyUp ? 'UP но Last.fm всё равно fail' : 'DOWN (VPN выключен?)'}`);
  console.error('Включи hidemy.name и перезапусти hot-push (без --no-proxy).');
  console.error('Принудительно: --skip-vpn-check (только discogs, без Last.fm).\n');
  process.exit(1);
}

async function main() {
  await assertHarvestNetwork();
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
    const priorityHits = buildPriorityHotQueue(bank, doneKeys);
    const priorityArtists = buildPriorityArtistQueue(tracks, bank, doneKeys);
    const priKeys = new Set(
      [...priorityHits, ...priorityArtists].map((t) => trackKey(t.artist, t.title)),
    );
    const artistsWithFacts = buildArtistsWithSubstantiveFacts(bank);
    const rest = tracks
      .filter((t) => {
        const key = trackKey(t.artist, t.title);
        if (priKeys.has(key)) return false;
        if (!trackNeedsHotPushHarvest(bank, t, doneKeys)) return false;
        return isTopCatalogTrack(t) || isPriorityArtist(t.artist);
      })
      .sort((a, b) => compareHotPushTracksWithBank(a, b, artistsWithFacts));
    queue = [...priorityHits, ...priorityArtists, ...rest];
    console.log(
      `HOT-PUSH: ${priorityHits.length} priority hits + ${priorityArtists.length} classic-artist tracks + ${rest.length} top-catalog (hot≥${hotTarget})`,
    );
    if (priorityHits.length) {
      console.log(`  hits: ${priorityHits.map((t) => `${t.artist} — ${t.title}`).join('; ')}`);
    }
    if (priorityArtists.length) {
      const sample = priorityArtists.slice(0, 8).map((t) => `${t.artist} — ${t.title}`);
      console.log(`  classics (${priorityArtists.length} tracks): ${sample.join('; ')}…`);
    }
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
