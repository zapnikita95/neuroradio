import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fetch from '../proxy-fetch.js';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const PROGRESS_FILE = path.join(DATA_DIR, 'youtube-harvest-progress.json');
const MANUAL_QUEUE_FILE = path.join(DATA_DIR, 'youtube-harvest-manual-queue.json');
const STATE_FILE = path.join(DATA_DIR, 'youtube-harvest-state.json');

const bundledChannelsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../data/youtube-channels.json',
);

export interface HarvestChannel {
  id: string;
  name: string;
  url: string;
  channelId?: string;
  lang?: string;
}

export interface HarvestDiscoverVideo {
  id: string;
  title: string;
  url: string;
  publishedAt?: string;
  channelId: string;
  channelName: string;
  alreadyProcessed: boolean;
}

export interface HarvestManualQueueVideo {
  id: string;
  title: string;
  url: string;
  channelName: string;
  languageCode?: string;
  addedAt: string;
  addedBy?: string;
}

export interface HarvestLiveProgress {
  runId?: string;
  status: 'idle' | 'running' | 'finished' | 'error';
  mode?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  current?: number;
  total?: number;
  videoId?: string;
  title?: string;
  step?: string;
  sttProvider?: string;
  queue?: Array<{ videoId: string; title: string; channel?: string }>;
  message?: string;
}

function readJson<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(p: string, data: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

export function loadHarvestChannels(): HarvestChannel[] {
  const local = path.join(DATA_DIR, 'youtube-channels.json');
  const cfg = readJson<{ channels?: HarvestChannel[] }>(
    fs.existsSync(local) ? local : bundledChannelsPath,
    { channels: [] },
  );
  return cfg.channels ?? [];
}

export function processedVideoIds(): Set<string> {
  const state = readJson<{ processedVideoIds?: string[] }>(STATE_FILE, { processedVideoIds: [] });
  return new Set(state.processedVideoIds ?? []);
}

export function loadHarvestLiveProgress(): HarvestLiveProgress {
  const p = readJson<Partial<HarvestLiveProgress>>(PROGRESS_FILE, {});
  return { status: 'idle', ...p, updatedAt: p.updatedAt ?? new Date().toISOString() };
}

export function saveHarvestLiveProgress(progress: HarvestLiveProgress): void {
  writeJson(PROGRESS_FILE, { ...progress, updatedAt: new Date().toISOString() });
}

export function loadManualQueue(): { videos: HarvestManualQueueVideo[]; updatedAt?: string } {
  return readJson(MANUAL_QUEUE_FILE, { videos: [] });
}

export function saveManualQueue(videos: HarvestManualQueueVideo[]): void {
  writeJson(MANUAL_QUEUE_FILE, { videos, updatedAt: new Date().toISOString() });
}

export function appendManualQueue(
  items: Array<Omit<HarvestManualQueueVideo, 'addedAt'>>,
): HarvestManualQueueVideo[] {
  const q = loadManualQueue();
  const seen = new Set(q.videos.map((v) => v.id));
  const processed = processedVideoIds();
  for (const item of items) {
    if (seen.has(item.id) || processed.has(item.id)) continue;
    seen.add(item.id);
    q.videos.push({ ...item, addedAt: new Date().toISOString() });
  }
  saveManualQueue(q.videos);
  return q.videos;
}

export function clearManualQueue(): void {
  saveManualQueue([]);
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** YouTube public RSS — no API key, works on Railway. */
export async function discoverChannelVideos(
  channelKey: string,
  limit = 15,
): Promise<HarvestDiscoverVideo[]> {
  const channels = loadHarvestChannels();
  const ch = channels.find((c) => c.id === channelKey);
  if (!ch?.channelId) throw new Error(`channel not found or missing channelId: ${channelKey}`);

  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(ch.channelId)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`YouTube RSS ${res.status}`);
  const xml = await res.text();
  const processed = processedVideoIds();
  const out: HarvestDiscoverVideo[] = [];

  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml)) && out.length < limit) {
    const block = m[1];
    const id = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim();
    const title = decodeXml(block.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? '');
    const publishedAt = block.match(/<published>([^<]+)<\/published>/)?.[1]?.trim();
    if (!id || !title) continue;
    out.push({
      id,
      title,
      url: `https://www.youtube.com/watch?v=${id}`,
      publishedAt,
      channelId: ch.channelId,
      channelName: ch.name,
      alreadyProcessed: processed.has(id),
    });
  }
  return out;
}

export async function syncHarvestSnapshotToRemote(
  bffBase: string,
  token: string,
  payload: { dashboard?: unknown; progress?: HarvestLiveProgress },
): Promise<void> {
  const base = bffBase.replace(/\/$/, '');
  if (payload.dashboard) {
    await fetch(`${base}/v1/admin/youtube-harvest/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-harvest-dashboard-token': token },
      body: JSON.stringify(payload.dashboard),
      signal: AbortSignal.timeout(60_000),
    });
  }
  if (payload.progress) {
    await fetch(`${base}/v1/admin/youtube-harvest/progress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-harvest-dashboard-token': token },
      body: JSON.stringify(payload.progress),
      signal: AbortSignal.timeout(30_000),
    });
  }
}
