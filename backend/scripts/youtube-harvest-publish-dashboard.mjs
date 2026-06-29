#!/usr/bin/env node
/** Push current local harvest stats to Railway dashboard (after batch or anytime). */
import '../dist/load-env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const OUT_DIR = path.join(DATA, 'youtube-harvest');

function loadJson(p, fb) {
  if (!fs.existsSync(p)) return fb;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

async function main() {
  const state = loadJson(path.join(DATA, 'youtube-harvest-state.json'), { processedVideoIds: [], runs: [] });
  const catalog = loadJson(path.join(DATA, 'youtube-harvest-catalog.json'), { facts: [], videos: [] });
  const run = state.runs?.[state.runs.length - 1] ?? { id: 'manual', reports: [], videoIds: state.processedVideoIds ?? [] };
  const failedIds = [...new Set((run.reports ?? []).filter((r) => !r.ok).map((r) => r.videoId))];
  const videoIds = [...new Set([...(run.videoIds ?? []), ...(state.processedVideoIds ?? []), ...failedIds])];

  const checkpointStep = (id) => {
    const cp = path.join(OUT_DIR, id, 'checkpoint.json');
    if (!fs.existsSync(cp)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(cp, 'utf8')).step;
    } catch {
      return undefined;
    }
  };
  const transcriptChars = (id) => {
    const p = path.join(OUT_DIR, id, 'transcript.txt');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim().length : undefined;
  };
  const factsExtracted = (id) => {
    const p = path.join(OUT_DIR, id, 'facts-raw.json');
    if (!fs.existsSync(p)) return undefined;
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      return Array.isArray(raw.facts) ? raw.facts.length : undefined;
    } catch {
      return undefined;
    }
  };

  const catalogById = new Map((catalog.videos ?? []).map((v) => [v.id, v]));
  const reportById = new Map((run.reports ?? []).map((r) => [r.videoId, r]));
  const ingestedRun = (run.reports ?? []).filter((r) => r.ok).reduce((s, r) => s + (r.ingested ?? 0), 0);

  const dashboard = {
    updatedAt: new Date().toISOString(),
    source: 'local-batch',
    runId: run.id,
    mode: run.mode,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    sttProvider: run.sttProvider,
    queued: run.videoIds?.length ?? videoIds.length,
    processed: state.processedVideoIds?.length ?? 0,
    pending: Math.max(0, (run.videoIds?.length ?? 0) - (state.processedVideoIds?.length ?? 0)),
    failed: failedIds.length,
    ok: (run.reports ?? []).filter((r) => r.ok).length,
    ingestedRun,
    catalogFacts: catalog.facts?.length ?? 0,
    catalogVideos: catalog.videos?.length ?? 0,
    bankYoutubeFacts: 0,
    retryQueue: loadJson(path.join(DATA, 'youtube-harvest-retry-queue.json'), { videos: [] }).videos?.length ?? 0,
    failedVideoIds: failedIds,
    videos: videoIds.map((videoId) => {
      const meta = catalogById.get(videoId);
      const rep = reportById.get(videoId);
      return {
        videoId,
        title: meta?.title ?? videoId,
        channel: meta?.channel,
        ok: rep ? rep.ok : (state.processedVideoIds ?? []).includes(videoId),
        ingested: rep?.ingested,
        error: rep?.error?.slice(0, 200),
        retried: rep?.retried,
        checkpoint: checkpointStep(videoId),
        transcriptChars: transcriptChars(videoId),
        factsExtracted: factsExtracted(videoId),
      };
    }),
  };

  const dashPath = path.join(DATA, 'youtube-harvest-dashboard.json');
  saveJson(dashPath, dashboard);
  console.log('saved', dashPath);
  console.log(JSON.stringify({
    processed: dashboard.processed,
    pending: dashboard.pending,
    failed: dashboard.failed,
    ingestedRun: dashboard.ingestedRun,
    catalogFacts: dashboard.catalogFacts,
  }));

  const token = process.env.HARVEST_DASHBOARD_TOKEN?.trim();
  const bff = (process.env.WEBSITE_DEMO_API_BASE || process.env.BFF_URL || 'https://www.efir-ai.ru').replace(/\/$/, '');
  if (!token) {
    console.warn('HARVEST_DASHBOARD_TOKEN missing — skip Railway sync');
    return;
  }
  const res = await fetch(`${bff}/v1/admin/youtube-harvest/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-harvest-dashboard-token': token },
    body: JSON.stringify(dashboard),
  });
  console.log('sync', res.status, (await res.text()).slice(0, 200));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
