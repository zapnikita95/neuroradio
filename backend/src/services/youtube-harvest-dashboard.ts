import fs from 'node:fs';
import path from 'node:path';

import { loadHarvestLiveProgress, loadManualQueue } from './youtube-harvest-admin.js';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const DASHBOARD_FILE = path.join(DATA_DIR, 'youtube-harvest-dashboard.json');

export interface YoutubeHarvestVideoRow {
  videoId: string;
  title: string;
  channel?: string;
  ok: boolean;
  /** Facts extracted by LLM (work dir or catalog). */
  factsExtracted?: number;
  /** Facts marked saved in harvest catalog (= actually in bank). */
  catalogSaved?: number;
  /** All bank candidates in catalog for this video. */
  catalogFacts?: number;
  /** Ingested during last batch run only (legacy). */
  ingestedLastRun?: number;
  /** @deprecated use catalogSaved */
  ingested?: number;
  error?: string;
  retried?: boolean;
  checkpoint?: string;
  transcriptChars?: number;
  inRetryQueue?: boolean;
}

export interface YoutubeHarvestDashboard {
  updatedAt: string;
  source: 'local-batch' | 'api-sync' | 'server-read';
  runId?: string;
  mode?: string;
  startedAt?: string;
  finishedAt?: string;
  sttProvider?: string;
  queued: number;
  processed: number;
  pending: number;
  failed: number;
  ok: number;
  ingestedRun: number;
  /** Total facts saved to bank across all videos (catalog). */
  catalogSavedTotal?: number;
  catalogFacts: number;
  catalogVideos: number;
  bankYoutubeFacts: number;
  retryQueue: number;
  manualQueue?: number;
  failedVideoIds: string[];
  videos: YoutubeHarvestVideoRow[];
  channels?: Array<{ name: string; processed: number; total: number }>;
  live?: import('./youtube-harvest-admin.js').HarvestLiveProgress;
}

function catalogStatsByVideo(
  facts: Array<{ videoId?: string; saved?: boolean }>,
): Map<string, { total: number; saved: number }> {
  const map = new Map<string, { total: number; saved: number }>();
  for (const f of facts) {
    const id = f.videoId?.trim();
    if (!id) continue;
    const row = map.get(id) ?? { total: 0, saved: 0 };
    row.total += 1;
    if (f.saved === true) row.saved += 1;
    map.set(id, row);
  }
  return map;
}

function readJson<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function countBankYoutubeFacts(): number {
  const bank = readJson<{ byTrack?: Record<string, Array<{ harvestSource?: string }>>; byArtist?: Record<string, Array<{ harvestSource?: string }>> }>(
    path.join(DATA_DIR, 'facts-bank.json'),
    {},
  );
  let n = 0;
  for (const pool of [bank.byTrack, bank.byArtist]) {
    if (!pool) continue;
    for (const facts of Object.values(pool)) {
      for (const f of facts) {
        if (String(f.harvestSource ?? '').startsWith('youtube:')) n += 1;
      }
    }
  }
  return n;
}

function checkpointForVideo(videoId: string): string | undefined {
  const cpPath = path.join(DATA_DIR, 'youtube-harvest', videoId, 'checkpoint.json');
  const cp = readJson<{ step?: string }>(cpPath, {});
  return cp.step;
}

function transcriptCharsForVideo(videoId: string): number | undefined {
  const p = path.join(DATA_DIR, 'youtube-harvest', videoId, 'transcript.txt');
  try {
    if (!fs.existsSync(p)) return undefined;
    return fs.readFileSync(p, 'utf8').trim().length;
  } catch {
    return undefined;
  }
}

function factsExtractedForVideo(videoId: string): number | undefined {
  const p = path.join(DATA_DIR, 'youtube-harvest', videoId, 'facts-raw.json');
  const raw = readJson<{ facts?: unknown[] }>(p, {});
  return Array.isArray(raw.facts) ? raw.facts.length : undefined;
}

/** Build dashboard from local harvest JSON files (batch machine or volume). */
export function buildYoutubeHarvestDashboardFromFiles(): YoutubeHarvestDashboard | null {
  const statePath = path.join(DATA_DIR, 'youtube-harvest-state.json');
  if (!fs.existsSync(statePath) && !fs.existsSync(DASHBOARD_FILE)) return null;

  const cached = readJson<YoutubeHarvestDashboard | null>(DASHBOARD_FILE, null);
  if (cached?.updatedAt && !fs.existsSync(statePath)) return cached;

  const state = readJson<{
    processedVideoIds?: string[];
    runs?: Array<{
      id: string;
      mode?: string;
      startedAt?: string;
      finishedAt?: string;
      sttProvider?: string;
      videoIds?: string[];
      reports?: Array<{
        videoId: string;
        ok: boolean;
        ingested?: number;
        error?: string;
        retried?: boolean;
      }>;
    }>;
  }>(statePath, { processedVideoIds: [], runs: [] });

  const catalog = readJson<{
    facts?: Array<{ videoId?: string; saved?: boolean; videoTitle?: string }>;
    videos?: Array<{ id: string; title: string; channel?: string }>;
  }>(path.join(DATA_DIR, 'youtube-harvest-catalog.json'), { facts: [], videos: [] });
  const retry = readJson<{ videos?: Array<{ id: string }> }>(path.join(DATA_DIR, 'youtube-harvest-retry-queue.json'), {
    videos: [],
  });
  const retryIds = new Set((retry.videos ?? []).map((v) => v.id));
  const catalogByVideo = catalogStatsByVideo(catalog.facts ?? []);
  const catalogSavedTotal = [...catalogByVideo.values()].reduce((s, r) => s + r.saved, 0);

  const run = state.runs?.[state.runs.length - 1];
  const allRunReports = new Map<string, { ok: boolean; ingested?: number; error?: string; retried?: boolean }>();
  for (const r of state.runs ?? []) {
    for (const rep of r.reports ?? []) {
      const prev = allRunReports.get(rep.videoId);
      allRunReports.set(rep.videoId, {
        ok: prev?.ok ?? rep.ok,
        ingested: (prev?.ingested ?? 0) + (rep.ingested ?? 0),
        error: rep.error ?? prev?.error,
        retried: rep.retried ?? prev?.retried,
      });
    }
  }
  const queued = run?.videoIds?.length ?? state.processedVideoIds?.length ?? 0;
  const processed = state.processedVideoIds?.length ?? 0;
  const reports = run?.reports ?? [];
  const failedIds = [...new Set([...allRunReports.entries()].filter(([, r]) => !r.ok).map(([id]) => id))];
  const ingestedRun = [...allRunReports.values()].reduce((s, r) => s + (r.ingested ?? 0), 0);

  const catalogById = new Map((catalog.videos ?? []).map((v) => [v.id, v]));
  const lastReportById = new Map(reports.map((r) => [r.videoId, r]));

  const videoIds = [...new Set([...(run?.videoIds ?? []), ...(state.processedVideoIds ?? []), ...failedIds])];
  const videos: YoutubeHarvestVideoRow[] = videoIds.map((videoId) => {
    const meta = catalogById.get(videoId);
    const agg = allRunReports.get(videoId);
    const lastRep = lastReportById.get(videoId);
    const cat = catalogByVideo.get(videoId);
    const factsFromDir = factsExtractedForVideo(videoId);
    return {
      videoId,
      title: meta?.title ?? videoId,
      channel: meta?.channel,
      ok: agg ? agg.ok : (state.processedVideoIds ?? []).includes(videoId),
      catalogFacts: cat?.total ?? 0,
      catalogSaved: cat?.saved ?? 0,
      factsExtracted: factsFromDir ?? cat?.total ?? 0,
      ingestedLastRun: lastRep?.ingested,
      ingested: cat?.saved ?? 0,
      error: agg?.error?.slice(0, 200),
      retried: agg?.retried,
      inRetryQueue: retryIds.has(videoId),
      checkpoint: checkpointForVideo(videoId),
      transcriptChars: transcriptCharsForVideo(videoId),
    };
  });

  videos.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    return (b.catalogSaved ?? 0) - (a.catalogSaved ?? 0);
  });

  const channelMap = new Map<string, { processed: number; total: number }>();
  for (const v of videos) {
    const ch = v.channel || '—';
    const row = channelMap.get(ch) ?? { processed: 0, total: 0 };
    row.total += 1;
    if (v.ok) row.processed += 1;
    channelMap.set(ch, row);
  }

  return {
    updatedAt: new Date().toISOString(),
    source: 'server-read',
    runId: run?.id,
    mode: run?.mode,
    startedAt: run?.startedAt,
    finishedAt: run?.finishedAt,
    sttProvider: run?.sttProvider,
    queued,
    processed,
    pending: Math.max(0, queued - processed),
    failed: failedIds.length,
    ok: reports.filter((r) => r.ok).length,
    ingestedRun,
    catalogSavedTotal,
    catalogFacts: catalog.facts?.length ?? 0,
    catalogVideos: catalog.videos?.length ?? 0,
    bankYoutubeFacts: countBankYoutubeFacts(),
    retryQueue: retry.videos?.length ?? 0,
    manualQueue: loadManualQueue().videos.length,
    failedVideoIds: failedIds,
    videos,
    channels: [...channelMap.entries()].map(([name, stats]) => ({ name, ...stats })),
    live: loadHarvestLiveProgress(),
  };
}

export function loadYoutubeHarvestDashboard(): YoutubeHarvestDashboard | null {
  const built = buildYoutubeHarvestDashboardFromFiles();
  const cached = readJson<YoutubeHarvestDashboard | null>(DASHBOARD_FILE, null);
  if (built) {
    built.live = loadHarvestLiveProgress();
    return built;
  }
  if (cached?.videos?.length) {
    cached.live = loadHarvestLiveProgress();
    return cached;
  }
  return null;
}

export function saveYoutubeHarvestDashboard(payload: YoutubeHarvestDashboard): void {
  fs.mkdirSync(path.dirname(DASHBOARD_FILE), { recursive: true });
  const tmp = `${DASHBOARD_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, DASHBOARD_FILE);
}

export function harvestDashboardTokenOk(token: string | undefined): boolean {
  const expected = process.env.HARVEST_DASHBOARD_TOKEN?.trim();
  if (!expected || !token?.trim()) return false;
  return token.trim() === expected;
}

export function harvestDashboardTokenFromRequest(
  req: { get(name: string): string | undefined; query?: Record<string, unknown> },
): string | undefined {
  const header = req.get('x-harvest-dashboard-token')?.trim();
  if (header) return header;
  const q = req.query?.token;
  return typeof q === 'string' ? q.trim() : undefined;
}
