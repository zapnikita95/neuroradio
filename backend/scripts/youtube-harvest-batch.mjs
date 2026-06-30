#!/usr/bin/env node
/**
 * Batch YouTube essay harvest: channels → STT benchmark → popularity sort → ingest.
 *
 *   node scripts/youtube-harvest-batch.mjs --initial
 *   node scripts/youtube-harvest-batch.mjs --weekly
 *   node scripts/youtube-harvest-batch.mjs --compare-stt-only
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  processVideo,
  listChannelVideos,
  downloadAudio,
  transcribeAudio,
  groqJson,
  isTransientHarvestError,
  OUT_DIR,
  ROOT,
} from './youtube-essay-fact-harvest.mjs';

const DATA = path.join(ROOT, 'data');
const CHANNELS_FILE = path.join(DATA, 'youtube-channels.json');
const CHANNELS_EXAMPLE = path.join(ROOT, 'config', 'youtube-channels.example.json');
const STATE_FILE = path.join(DATA, 'youtube-harvest-state.json');
const CATALOG_FILE = path.join(DATA, 'youtube-harvest-catalog.json');
const BENCHMARK_FILE = path.join(DATA, 'youtube-stt-benchmark.json');
const PROGRESS_FILE = path.join(DATA, 'youtube-harvest-progress.json');
const RETRY_QUEUE_FILE = path.join(DATA, 'youtube-harvest-retry-queue.json');
const MAX_VIDEO_RETRIES = 5;

function argValue(name) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1];
  }
  return null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function loadJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function ensureChannelsFile() {
  if (!fs.existsSync(CHANNELS_FILE)) {
    fs.copyFileSync(CHANNELS_EXAMPLE, CHANNELS_FILE);
    console.log(`[batch] created ${CHANNELS_FILE} from example`);
  }
}

function loadState() {
  return loadJson(STATE_FILE, { processedVideoIds: [], runs: [] });
}

function saveState(state) {
  saveJson(STATE_FILE, state);
}

function loadCatalog() {
  return loadJson(CATALOG_FILE, { facts: [], videos: [], updatedAt: null });
}

function saveCatalog(catalog) {
  catalog.updatedAt = new Date().toISOString();
  saveJson(CATALOG_FILE, catalog);
}

async function lastfmListeners(artist) {
  const key = process.env.LASTFM_API_KEY?.trim();
  if (!key || !artist?.trim()) return 0;
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=${encodeURIComponent(artist)}&api_key=${key}&format=json&autocorrect=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data?.artist?.stats?.listeners) || 0;
  } catch {
    return 0;
  }
}

/** RU market priority: mainstream RU → global stars → RU underground. */
const TIER_RANK = {
  ru_mainstream: 0,
  int_mainstream: 1,
  ru_underground: 2,
  other: 3,
};

function hasCyrillic(text) {
  return /[\u0400-\u04FF]/.test(text ?? '');
}

function ruChannel(channelKey, languageCode) {
  return languageCode === 'rus' || /broken|fast_flow|risazatvorchestvo/i.test(channelKey ?? '');
}

function classifyMarketTier(artist, listeners, video, llmTier) {
  const tier = String(llmTier ?? '').trim();
  if (tier in TIER_RANK) return tier;

  const name = artist ?? '';
  const ruName = hasCyrillic(name) || (ruChannel(video.channelKey, video.languageCode) && hasCyrillic(video.title));
  const ruMainMin = 60_000;
  const intMainMin = 120_000;

  if (ruName && listeners >= ruMainMin) return 'ru_mainstream';
  if (ruName) return 'ru_underground';
  if (listeners >= intMainMin) return 'int_mainstream';
  if (!ruName && listeners >= 30_000) return 'int_mainstream';
  return ruName ? 'ru_underground' : 'other';
}

async function guessArtistsFromTitles(videos) {
  const { parsed } = await groqJson(
    `Из названий YouTube-эссе о музыке (аудитория — Россия / русскоязычные). JSON:
{"items":[{"id":"videoId","artists":["главный артист"],"marketTier":"ru_mainstream|int_mainstream|ru_underground"}]}
marketTier:
- ru_mainstream — массово известен в РФ (Каста, Бастa, Скриптонит, Кино, Земфира, Макс Корж, Morgenshtern, ЛSP…)
- int_mainstream — мировая звезда, которую слушают в РФ (Eminem, Bowie, Beatles, Radiohead, Kanye…)
- ru_underground — русский андеграунд/ниша/культ, не топ-радио (Krec/Крек, ранний питерский рэп, малоизвестные инди)
Только реальные артисты из видео, не канал.`,
    JSON.stringify(videos.map((v) => ({ id: v.id, title: v.title, channel: v.channelKey }))).slice(0, 24000),
    4096,
  );
  const artists = new Map();
  const tiers = new Map();
  for (const row of parsed.items ?? []) {
    artists.set(row.id, Array.isArray(row.artists) ? row.artists.map(String) : []);
    if (row.marketTier) tiers.set(row.id, String(row.marketTier));
  }
  return { artists, tiers };
}

async function rankVideosByPopularity(videos) {
  const { artists: artistMap, tiers: tierMap } = await guessArtistsFromTitles(videos);
  const scored = [];
  for (const v of videos) {
    const artists = artistMap.get(v.id) ?? [];
    let best = 0;
    let topArtist = artists[0] ?? null;
    for (const a of artists.slice(0, 2)) {
      const listeners = await lastfmListeners(a);
      if (listeners > best) {
        best = listeners;
        topArtist = a;
      }
    }
    const marketTier = classifyMarketTier(topArtist, best, v, tierMap.get(v.id));
    scored.push({ ...v, topArtist, listeners: best, artists, marketTier });
  }
  scored.sort((a, b) => {
    const ta = TIER_RANK[a.marketTier] ?? 9;
    const tb = TIER_RANK[b.marketTier] ?? 9;
    if (ta !== tb) return ta - tb;
    return b.listeners - a.listeners || b.durationSec - a.durationSec;
  });
  return scored;
}

function tokenOverlap(a, b) {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length >= 4));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length >= 4));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  return hit / Math.max(ta.size, tb.size);
}

async function compareSttProviders(sampleVideo, languageCode) {
  const workDir = path.join(OUT_DIR, `stt-bench-${sampleVideo.id}`);
  const { audioPath } = downloadAudio(sampleVideo.url, workDir, 120);
  const eleven = await transcribeAudio(audioPath, { languageCode, sttProvider: 'railway' });
  const groq = await transcribeAudio(audioPath, { languageCode, sttProvider: 'groq' });
  const overlap = tokenOverlap(eleven.text, groq.text);

  let llmWinner = 'tie';
  try {
    const { parsed } = await groqJson(
      `Сравни две расшифровки одного рус/англ музыкального эссе. JSON: {"winner":"elevenlabs|groq|tie","elevenScore":1-10,"groqScore":1-10,"reason":"..."}
Критерии: имена, даты, цитаты, муз. термины, меньше галлюцинаций.`,
      `ELEVENLABS (${eleven.text.length} chars):\n${eleven.text.slice(0, 6000)}\n\nGROQ (${groq.text.length} chars):\n${groq.text.slice(0, 6000)}`,
      1024,
    );
    llmWinner = parsed.winner || 'tie';
    var llmScores = { eleven: parsed.elevenScore, groq: parsed.groqScore, reason: parsed.reason };
  } catch {
    llmScores = { eleven: null, groq: null, reason: 'llm_compare_failed' };
  }

  const bench = {
    at: new Date().toISOString(),
    videoId: sampleVideo.id,
    title: sampleVideo.title,
    tokenOverlap: Math.round(overlap * 1000) / 1000,
    eleven: { provider: eleven.provider, chars: eleven.text.length, ms: eleven.latencyMs },
    groq: { provider: groq.provider, chars: groq.text.length, ms: groq.latencyMs },
    llmWinner,
    llmScores,
    chosenProvider:
      llmWinner === 'groq' || (llmWinner === 'tie' && overlap > 0.75) ? 'railway-groq' : 'railway',
  };
  saveJson(BENCHMARK_FILE, bench);
  console.log('[stt-bench]', JSON.stringify(bench, null, 2));
  return bench.chosenProvider;
}

function collectVideos(cfg, state, mode) {
  const perChannel = mode === 'weekly'
    ? cfg.defaults?.weeklyNewPerChannel ?? 1
    : parseInt(argValue('per-channel') ?? String(cfg.defaults?.videosPerChannel ?? 10), 10);
  const processed = new Set(state.processedVideoIds ?? []);
  const all = [];

  for (const ch of cfg.channels ?? []) {
    const listed = listChannelVideos(ch.url, Math.max(perChannel * 3, 30)).map((v) => ({
      ...v,
      channelKey: ch.id,
      channelName: ch.name,
      languageCode: ch.lang === 'eng' ? 'eng' : 'rus',
    }));
    const fresh = listed.filter((v) => !processed.has(v.id));
    all.push(...fresh.slice(0, perChannel));
  }
  return all;
}

function saveProgress(progress) {
  progress.updatedAt = new Date().toISOString();
  saveJson(PROGRESS_FILE, progress);
  void syncProgressRemote(progress);
}

async function syncProgressRemote(progress) {
  const token = process.env.HARVEST_DASHBOARD_TOKEN?.trim();
  const bff =
    process.env.WEBSITE_DEMO_API_BASE?.trim() ||
    process.env.BFF_URL?.trim() ||
    process.env.PUBLIC_BFF_URL?.trim() ||
    'https://music-story-production.up.railway.app';
  if (!token) return;
  try {
    await fetch(`${bff.replace(/\/$/, '')}/v1/admin/youtube-harvest/progress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-harvest-dashboard-token': token },
      body: JSON.stringify({ status: 'running', ...progress }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    /* best-effort */
  }
}

async function pullRemoteManualQueue() {
  const token = process.env.HARVEST_DASHBOARD_TOKEN?.trim();
  const bff =
    process.env.WEBSITE_DEMO_API_BASE?.trim() ||
    process.env.BFF_URL?.trim() ||
    process.env.PUBLIC_BFF_URL?.trim() ||
    'https://music-story-production.up.railway.app';
  if (!token) return [];
  try {
    const res = await fetch(`${bff.replace(/\/$/, '')}/v1/admin/youtube-harvest/queue`, {
      headers: { 'x-harvest-dashboard-token': token },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.videos ?? []).map((v) => ({
      id: v.id,
      title: v.title,
      url: v.url,
      channelName: v.channelName,
      languageCode: v.languageCode ?? 'rus',
    }));
  } catch {
    return [];
  }
}

async function clearRemoteManualQueue() {
  const token = process.env.HARVEST_DASHBOARD_TOKEN?.trim();
  const bff =
    process.env.WEBSITE_DEMO_API_BASE?.trim() ||
    process.env.BFF_URL?.trim() ||
    process.env.PUBLIC_BFF_URL?.trim() ||
    'https://music-story-production.up.railway.app';
  if (!token) return;
  try {
    await fetch(`${bff.replace(/\/$/, '')}/v1/admin/youtube-harvest/queue`, {
      method: 'DELETE',
      headers: { 'x-harvest-dashboard-token': token },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    /* best-effort */
  }
}

function loadRetryQueue() {
  return loadJson(RETRY_QUEUE_FILE, { videos: [] }).videos ?? [];
}

function saveRetryQueue(videos) {
  saveJson(RETRY_QUEUE_FILE, { videos, updatedAt: new Date().toISOString() });
}

function upsertRetryQueue(video, error) {
  const queue = loadRetryQueue();
  const idx = queue.findIndex((q) => q.id === video.id);
  const row = {
    id: video.id,
    title: video.title,
    url: video.url,
    channelName: video.channelName,
    languageCode: video.languageCode,
    lastError: error,
    attempts: (idx >= 0 ? queue[idx].attempts : 0) + 1,
    queuedAt: new Date().toISOString(),
  };
  if (idx >= 0) queue[idx] = row;
  else queue.push(row);
  saveRetryQueue(queue);
  return row;
}

function removeFromRetryQueue(videoId) {
  saveRetryQueue(loadRetryQueue().filter((q) => q.id !== videoId));
}

async function runOneVideo(v, ctx) {
  const report = await processVideo(v, {
    dryRun: ctx.dryRun,
    maxSeconds: ctx.maxSeconds,
    languageCode: v.languageCode,
    sttProvider: ctx.sttProvider,
    onFactSaved: (f, video, meta) => appendCatalogFact(ctx.catalog, f, video, meta),
  });
  ctx.run.reports.push({ videoId: v.id, ok: true, ingested: report.llm.factsIngested });
  if (!ctx.dryRun) {
    ctx.state.processedVideoIds = [...new Set([...(ctx.state.processedVideoIds ?? []), v.id])];
    ctx.state.lastCompletedVideoId = v.id;
    saveState(ctx.state);
  }
  removeFromRetryQueue(v.id);
  mergeCatalog(ctx.catalog, report);
  saveCatalog(ctx.catalog);
  return report;
}

function appendCatalogFact(catalog, f, video, meta) {
  const fp = `${video.id}:${f.fact.slice(0, 80)}`;
  if (catalog.facts.some((x) => x._fp === fp)) return;
  catalog.facts.push({
    _fp: fp,
    artist: f.artist,
    title: f.title,
    scope: f.scope,
    fact: f.fact,
    interest: f.interest,
    bankQuality: f.bankQuality ?? f.interest,
    videoId: video.id,
    videoTitle: meta.title,
    saved: f.saved,
    at: new Date().toISOString(),
  });
  catalog.facts.sort((a, b) => (b.bankQuality ?? b.interest) - (a.bankQuality ?? a.interest));
  saveCatalog(catalog);
}

function mergeCatalog(catalog, report) {
  if (catalog.videos.some((v) => v.id === report.video.id)) return;
  catalog.videos.push({
    id: report.video.id,
    title: report.video.title,
    channel: report.video.channel,
    processedAt: new Date().toISOString(),
    stt: report.scribe.provider,
    factsIngested: report.llm.factsIngested,
  });
  for (const f of report.bankCandidates ?? []) {
    catalog.facts.push({
      artist: f.artist,
      title: f.title,
      scope: f.scope,
      fact: f.fact,
      interest: f.interest,
      bankQuality: f.bankQuality ?? f.interest,
      videoId: report.video.id,
      videoTitle: report.video.title,
      saved: report.ingestLog?.find((x) => x.fact === f.fact)?.saved ?? null,
    });
  }
  catalog.facts.sort((a, b) => (b.bankQuality ?? b.interest) - (a.bankQuality ?? a.interest));
}

async function main() {
  ensureChannelsFile();
  const cfg = loadJson(CHANNELS_FILE, { channels: [], defaults: {} });
  const state = loadState();
  const catalog = loadCatalog();
  const dryRun = hasFlag('dry-run');
  const maxSeconds =
    parseInt(argValue('max-seconds') ?? String(cfg.defaults?.maxAudioSeconds ?? 600), 10) || 600;

  if (hasFlag('compare-stt-only')) {
    const sample = collectVideos(cfg, { processedVideoIds: [] }, 'initial')[0];
    if (!sample) throw new Error('no sample video');
    await compareSttProviders(sample, sample.languageCode);
    return;
  }

  const mode = hasFlag('weekly') ? 'weekly' : 'initial';
  const retryOnly = hasFlag('retry-only');
  const fromQueue = hasFlag('from-queue');
  let videos = retryOnly || fromQueue ? [] : collectVideos(cfg, state, mode);
  const pendingRetry = loadRetryQueue().filter((q) => !(state.processedVideoIds ?? []).includes(q.id));
  if (fromQueue) {
    const manual = await pullRemoteManualQueue();
    if (!manual.length) {
      console.log('[batch] from-queue: remote queue empty');
      return;
    }
    videos = manual;
    console.log(`[batch] from-queue: ${videos.length} video(s) from dashboard`);
  } else if (retryOnly) {
    if (!pendingRetry.length) {
      console.log('[batch] retry-only: retry queue empty');
      return;
    }
    videos = pendingRetry.map((q) => ({
      id: q.id,
      title: q.title,
      url: q.url,
      channelName: q.channelName,
      languageCode: q.languageCode ?? 'rus',
      _retryCount: q.attempts ?? 0,
    }));
    console.log(`[batch] retry-only: ${videos.length} video(s): ${videos.map((v) => v.id).join(', ')}`);
  } else if (!videos.length && !pendingRetry.length) {
    console.log('[batch] no new videos to process');
    return;
  }

  if (!retryOnly) {
    console.log(`[batch] queued ${videos.length} videos (${mode})`);
    videos = await rankVideosByPopularity(videos);
  }

  if (!retryOnly && pendingRetry.length) {
    const byId = new Map(videos.map((v) => [v.id, v]));
    const retryVideos = pendingRetry
      .map(
        (q) =>
          byId.get(q.id) ?? {
            id: q.id,
            title: q.title,
            url: q.url,
            channelName: q.channelName,
            languageCode: q.languageCode ?? 'rus',
            _retryCount: q.attempts ?? 0,
          },
      )
      .filter((v) => !(state.processedVideoIds ?? []).includes(v.id));
    const retryIds = new Set(retryVideos.map((v) => v.id));
    videos = [...retryVideos, ...videos.filter((v) => !retryIds.has(v.id))];
    console.log(`[batch] priority retry queue (${retryVideos.length}): ${retryVideos.map((v) => v.id).join(', ')}`);
  }
  const tierLabel = { ru_mainstream: 'RU★', int_mainstream: 'INT★', ru_underground: 'RUUG' };
  console.log(
    '[batch] order RU→INT→underground:',
    videos
      .slice(0, 8)
      .map((v) => `${tierLabel[v.marketTier] ?? v.marketTier}:${v.topArtist ?? '?'}`)
      .join(', '),
  );

  let sttProvider = cfg.defaults?.sttProvider || 'railway';
  if ((hasFlag('initial') || hasFlag('compare-stt') || mode === 'initial') && pendingRetry.length === 0 && !retryOnly) {
    try {
      const benchVideo = videos[0];
      sttProvider = await compareSttProviders(benchVideo, benchVideo.languageCode);
      console.log(`[batch] STT chosen: ${sttProvider}`);
    } catch (err) {
      console.warn(
        `[batch] STT benchmark skipped: ${err instanceof Error ? err.message : err} → ${sttProvider}`,
      );
    }
  } else if (pendingRetry.length > 0 || retryOnly) {
    console.log(`[batch] STT benchmark skipped (retry${retryOnly ? '-only' : ` queue ${pendingRetry.length}`}) → ${sttProvider}`);
  }
  if (argValue('stt')) sttProvider = argValue('stt');

  const run = {
    id: `run-${Date.now()}`,
    mode: fromQueue ? 'manual-queue' : mode,
    startedAt: new Date().toISOString(),
    sttProvider,
    videoIds: videos.map((v) => v.id),
    reports: [],
  };

  saveProgress({
    runId: run.id,
    status: 'running',
    mode: run.mode,
    startedAt: run.startedAt,
    current: 0,
    total: videos.length,
    sttProvider,
    queue: videos.map((v) => ({ videoId: v.id, title: v.title, channel: v.channelName })),
    message: `Старт: ${videos.length} видео`,
  });

  for (let i = 0; i < videos.length; i += 1) {
    const v = videos[i];
    console.log(`\n[batch ${i + 1}/${videos.length}] ${v.channelName} — ${v.title}`);
    saveProgress({
      runId: run.id,
      status: 'running',
      mode: run.mode,
      startedAt: run.startedAt,
      current: i + 1,
      total: videos.length,
      videoId: v.id,
      title: v.title,
      step: 'processing',
      sttProvider,
      queue: videos.slice(i).map((x) => ({ videoId: x.id, title: x.title, channel: x.channelName })),
    });
    const ctx = { dryRun, maxSeconds, sttProvider, catalog, state, run };
    try {
      await runOneVideo(v, ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[batch] FAIL ${v.id}:`, msg);
      const retryCount = v._retryCount ?? 0;
      if (isTransientHarvestError(err) && retryCount < MAX_VIDEO_RETRIES) {
        const requeued = { ...v, _retryCount: retryCount + 1 };
        videos.splice(i + 1, 0, requeued);
        upsertRetryQueue(v, msg);
        console.warn(`[batch] re-queued ${v.id} at position ${i + 2} (${retryCount + 1}/${MAX_VIDEO_RETRIES}): ${msg}`);
        run.reports.push({ videoId: v.id, ok: false, error: msg, requeued: true, retryCount: retryCount + 1 });
      } else {
        run.reports.push({ videoId: v.id, ok: false, error: msg, requeued: false });
        upsertRetryQueue(v, msg);
      }
      saveProgress({
        runId: run.id,
        current: i + 1,
        total: videos.length,
        videoId: v.id,
        title: v.title,
        error: msg,
        requeued: isTransientHarvestError(err) && retryCount < MAX_VIDEO_RETRIES,
        sttProvider,
      });
    }
  }

  const failedIds = [...new Set(run.reports.filter((r) => !r.ok).map((r) => r.videoId))];
  if (failedIds.length > 0) {
    console.log(`\n[batch] final retry pass for ${failedIds.length} failed video(s): ${failedIds.join(', ')}`);
    const ctx = { dryRun, maxSeconds, sttProvider, catalog, state, run };
    for (const videoId of failedIds) {
      const v = videos.find((x) => x.id === videoId);
      if (!v || (state.processedVideoIds ?? []).includes(v.id)) continue;
      console.log(`\n[batch retry] ${v.channelName} — ${v.title}`);
      try {
        await runOneVideo(v, ctx);
        const idx = run.reports.findIndex((r) => r.videoId === videoId);
        if (idx >= 0) run.reports[idx] = { ...run.reports[idx], ok: true, retried: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[batch retry] FAIL ${v.id}:`, msg);
        upsertRetryQueue(v, msg);
      }
    }
  }

  saveProgress({ runId: run.id, status: 'finished', finishedAt: new Date().toISOString(), mode: run.mode });
  if (fromQueue) await clearRemoteManualQueue();

  run.finishedAt = new Date().toISOString();
  state.runs = [...(state.runs ?? []), run].slice(-40);
  saveState(state);

  const totalFacts = catalog.facts.length;
  const ingested = run.reports.filter((r) => r.ok).reduce((s, r) => s + (r.ingested ?? 0), 0);
  console.log(`\n[batch] done videos=${run.reports.filter((r) => r.ok).length}/${videos.length} ingestedThisRun=${ingested} catalogFacts=${totalFacts}`);
  console.log(`[batch] catalog: ${CATALOG_FILE}`);
  console.log(`[batch] state: ${STATE_FILE}`);

  await publishHarvestDashboard();
}

async function publishHarvestDashboard() {
  const { buildYoutubeHarvestDashboardFromFiles, saveYoutubeHarvestDashboard } = await import(
    '../dist/services/youtube-harvest-dashboard.js'
  );
  const dashboard = buildYoutubeHarvestDashboardFromFiles();
  if (!dashboard) {
    console.warn('[batch] dashboard build skipped — no state');
    return;
  }
  saveYoutubeHarvestDashboard(dashboard);
  const DASHBOARD_FILE = path.join(DATA, 'youtube-harvest-dashboard.json');
  const siteDash = path.join(ROOT, '..', 'website', 'admin', 'harvest-data.json');
  saveJson(DASHBOARD_FILE, dashboard);
  saveJson(siteDash, dashboard);
  console.log(`[batch] dashboard: ${DASHBOARD_FILE}`);
  console.log(`[batch] site snapshot: ${siteDash}`);

  const token = process.env.HARVEST_DASHBOARD_TOKEN?.trim();
  const bff =
    process.env.WEBSITE_DEMO_API_BASE?.trim() ||
    process.env.BFF_URL?.trim() ||
    process.env.PUBLIC_BFF_URL?.trim() ||
    'https://music-story-production.up.railway.app';
  if (!token) {
    console.warn('[batch] HARVEST_DASHBOARD_TOKEN missing — dashboard not synced to Railway');
    return;
  }
  try {
    const res = await fetch(`${bff.replace(/\/$/, '')}/v1/admin/youtube-harvest/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-harvest-dashboard-token': token,
      },
      body: JSON.stringify(dashboard),
      signal: AbortSignal.timeout(60_000),
    });
    const raw = await res.text();
    if (!res.ok) {
      console.warn(`[batch] dashboard sync ${res.status}: ${raw.slice(0, 200)}`);
      return;
    }
    console.log(`[batch] dashboard synced → ${bff}`);
  } catch (err) {
    console.warn(`[batch] dashboard sync failed: ${err instanceof Error ? err.message : err}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
