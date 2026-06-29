import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const DASHBOARD_FILE = path.join(DATA_DIR, 'youtube-harvest-dashboard.json');

export interface YoutubeHarvestVideoRow {
  videoId: string;
  title: string;
  channel?: string;
  ok: boolean;
  ingested?: number;
  error?: string;
  retried?: boolean;
  checkpoint?: string;
  transcriptChars?: number;
  factsExtracted?: number;
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
  catalogFacts: number;
  catalogVideos: number;
  bankYoutubeFacts: number;
  retryQueue: number;
  failedVideoIds: string[];
  videos: YoutubeHarvestVideoRow[];
  channels?: Array<{ name: string; processed: number; total: number }>;
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

  const catalog = readJson<{ facts?: unknown[]; videos?: Array<{ id: string; title: string; channel?: string }> }>(
    path.join(DATA_DIR, 'youtube-harvest-catalog.json'),
    { facts: [], videos: [] },
  );
  const retry = readJson<{ videos?: unknown[] }>(path.join(DATA_DIR, 'youtube-harvest-retry-queue.json'), {
    videos: [],
  });

  const run = state.runs?.[state.runs.length - 1];
  const queued = run?.videoIds?.length ?? state.processedVideoIds?.length ?? 0;
  const processed = state.processedVideoIds?.length ?? 0;
  const reports = run?.reports ?? [];
  const failedIds = [...new Set(reports.filter((r) => !r.ok).map((r) => r.videoId))];
  const ingestedRun = reports.filter((r) => r.ok).reduce((s, r) => s + (r.ingested ?? 0), 0);

  const catalogById = new Map((catalog.videos ?? []).map((v) => [v.id, v]));
  const reportById = new Map(reports.map((r) => [r.videoId, r]));

  const videoIds = [...new Set([...(run?.videoIds ?? []), ...(state.processedVideoIds ?? []), ...failedIds])];
  const videos: YoutubeHarvestVideoRow[] = videoIds.map((videoId) => {
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
      checkpoint: checkpointForVideo(videoId),
      transcriptChars: transcriptCharsForVideo(videoId),
      factsExtracted: factsExtractedForVideo(videoId),
    };
  });

  videos.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    return (b.ingested ?? 0) - (a.ingested ?? 0);
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
    catalogFacts: catalog.facts?.length ?? 0,
    catalogVideos: catalog.videos?.length ?? 0,
    bankYoutubeFacts: countBankYoutubeFacts(),
    retryQueue: retry.videos?.length ?? 0,
    failedVideoIds: failedIds,
    videos,
    channels: [...channelMap.entries()].map(([name, stats]) => ({ name, ...stats })),
  };
}

export function loadYoutubeHarvestDashboard(): YoutubeHarvestDashboard | null {
  const cached = readJson<YoutubeHarvestDashboard | null>(DASHBOARD_FILE, null);
  if (cached?.videos?.length) return cached;
  const built = buildYoutubeHarvestDashboardFromFiles();
  if (!built && cached) return cached;
  if (!built) return null;
  if (cached?.updatedAt && cached.updatedAt > built.updatedAt) return cached;
  return built;
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
