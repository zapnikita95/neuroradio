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
  OUT_DIR,
  ROOT,
} from './youtube-essay-fact-harvest.mjs';

const DATA = path.join(ROOT, 'data');
const CHANNELS_FILE = path.join(DATA, 'youtube-channels.json');
const CHANNELS_EXAMPLE = path.join(ROOT, 'config', 'youtube-channels.example.json');
const STATE_FILE = path.join(DATA, 'youtube-harvest-state.json');
const CATALOG_FILE = path.join(DATA, 'youtube-harvest-catalog.json');
const BENCHMARK_FILE = path.join(DATA, 'youtube-stt-benchmark.json');

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

async function guessArtistsFromTitles(videos) {
  const { parsed } = await groqJson(
    `Из названий YouTube-эссе о музыке верни JSON: {"items":[{"id":"videoId","artists":["главный артист"]}]}
Только реальные музыкальные артисты/группы из видео, не название канала.`,
    JSON.stringify(videos.map((v) => ({ id: v.id, title: v.title, channel: v.channelKey }))).slice(0, 24000),
    4096,
  );
  const map = new Map();
  for (const row of parsed.items ?? []) {
    map.set(row.id, Array.isArray(row.artists) ? row.artists.map(String) : []);
  }
  return map;
}

async function rankVideosByPopularity(videos) {
  const artistMap = await guessArtistsFromTitles(videos);
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
    scored.push({ ...v, topArtist, listeners: best, artists });
  }
  scored.sort((a, b) => b.listeners - a.listeners || b.durationSec - a.durationSec);
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

function mergeCatalog(catalog, report) {
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
  const maxSeconds = parseInt(argValue('max-seconds') ?? '0', 10) || 0;

  if (hasFlag('compare-stt-only')) {
    const sample = collectVideos(cfg, { processedVideoIds: [] }, 'initial')[0];
    if (!sample) throw new Error('no sample video');
    await compareSttProviders(sample, sample.languageCode);
    return;
  }

  const mode = hasFlag('weekly') ? 'weekly' : 'initial';
  let videos = collectVideos(cfg, state, mode);
  if (!videos.length) {
    console.log('[batch] no new videos to process');
    return;
  }

  console.log(`[batch] queued ${videos.length} videos (${mode})`);
  videos = await rankVideosByPopularity(videos);
  console.log('[batch] top by Last.fm listeners:', videos.slice(0, 5).map((v) => `${v.topArtist ?? '?'} (${v.listeners})`).join(', '));

  let sttProvider = cfg.defaults?.sttProvider || 'railway';
  if (hasFlag('initial') || hasFlag('compare-stt') || mode === 'initial') {
    const benchVideo = videos[0];
    sttProvider = await compareSttProviders(benchVideo, benchVideo.languageCode);
    console.log(`[batch] STT chosen: ${sttProvider}`);
  }
  if (argValue('stt')) sttProvider = argValue('stt');

  const run = {
    id: `run-${Date.now()}`,
    mode,
    startedAt: new Date().toISOString(),
    sttProvider,
    videoIds: videos.map((v) => v.id),
    reports: [],
  };

  for (let i = 0; i < videos.length; i += 1) {
    const v = videos[i];
    console.log(`\n[batch ${i + 1}/${videos.length}] ${v.channelName} — ${v.title}`);
    try {
      const report = await processVideo(v, {
        dryRun,
        maxSeconds,
        languageCode: v.languageCode,
        sttProvider,
      });
      run.reports.push({ videoId: v.id, ok: true, ingested: report.llm.factsIngested });
      if (!dryRun) {
        state.processedVideoIds = [...new Set([...(state.processedVideoIds ?? []), v.id])];
        saveState(state);
      }
      mergeCatalog(catalog, report);
      saveCatalog(catalog);
    } catch (err) {
      console.error(`[batch] FAIL ${v.id}:`, err instanceof Error ? err.message : err);
      run.reports.push({ videoId: v.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  run.finishedAt = new Date().toISOString();
  state.runs = [...(state.runs ?? []), run].slice(-40);
  saveState(state);

  const totalFacts = catalog.facts.length;
  const ingested = run.reports.filter((r) => r.ok).reduce((s, r) => s + (r.ingested ?? 0), 0);
  console.log(`\n[batch] done videos=${run.reports.filter((r) => r.ok).length}/${videos.length} ingestedThisRun=${ingested} catalogFacts=${totalFacts}`);
  console.log(`[batch] catalog: ${CATALOG_FILE}`);
  console.log(`[batch] state: ${STATE_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
