import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const PROGRESS_FILE = path.join(DATA_DIR, 'bulk-seed-progress.json');
const LIVE_FILE = path.join(DATA_DIR, 'bulk-seed-live.json');
const DASHBOARD_FILE = path.join(DATA_DIR, 'bulk-seed-dashboard.json');
const CATALOG_FILE = path.join(process.cwd(), 'src', 'data', 'popular-tracks-catalog.json');
const BANK_FILE = path.join(DATA_DIR, 'facts-bank.json');

export interface BulkSeedLiveProgress {
  status: 'running' | 'idle' | 'finished';
  artist?: string;
  title?: string;
  index?: number;
  total?: number;
  stopReason?: string;
  updatedAt?: string;
}

export interface BulkSeedDashboard {
  updatedAt: string;
  source: 'local-batch' | 'api-sync' | 'server-read';
  savedAt?: string;
  finishedAt?: string;
  /** running | stale | stopped | finished */
  runStatus: 'running' | 'stale' | 'stopped' | 'finished';
  staleMinutes?: number;
  catalogTotal: number;
  tracksDone: number;
  tracksRemaining: number;
  tracksPct: number;
  factsSubstantive: number;
  factsTarget: number;
  factsPct: number;
  hotFacts: number;
  hotTarget: number;
  hotPct: number;
  zeroFacts: number;
  metadata?: number;
  bySource: Record<string, number>;
  byScope: Record<string, number>;
  tracksPerMin?: number;
  etaMinutes?: number;
  etaLabel?: string;
  bankFileMb?: number;
  stopReason?: string;
  live?: BulkSeedLiveProgress;
}

function readJson<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function catalogTrackTotal(): number {
  const cat = readJson<{ tracks?: unknown[] }>(CATALOG_FILE, { tracks: [] });
  return cat.tracks?.length ?? 0;
}

function bankFileMb(): number | undefined {
  try {
    if (!fs.existsSync(BANK_FILE)) return undefined;
    return Math.round((fs.statSync(BANK_FILE).size / 1024 / 1024) * 10) / 10;
  } catch {
    return undefined;
  }
}

function fmtEta(minutes: number | undefined | null): string | undefined {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return undefined;
  if (minutes < 60) return `~${Math.round(minutes)} мин`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `~${h} ч ${m} мин` : `~${h} ч`;
}

export function buildBulkSeedDashboardFromFiles(): BulkSeedDashboard | null {
  if (!fs.existsSync(PROGRESS_FILE)) return null;

  const prog = readJson<{
    doneKeys?: string[];
    stats?: {
      total?: number;
      hot?: number;
      zeroFacts?: number;
      metadata?: number;
      substantive?: number;
      bySource?: Record<string, number>;
      byScope?: Record<string, number>;
    };
    target?: number;
    hotTarget?: number;
    savedAt?: string;
    finishedAt?: string;
    catalogTotal?: number;
    tracksPerMin?: number;
    etaMinutes?: number;
  }>(PROGRESS_FILE, {});

  const live = readJson<BulkSeedLiveProgress>(LIVE_FILE, { status: 'idle' });
  const catalogTotal = prog.catalogTotal ?? catalogTrackTotal();
  const done = prog.doneKeys?.length ?? 0;
  const s = prog.stats ?? {};
  const factTarget = prog.target ?? 120_000;
  const hotTarget = prog.hotTarget ?? 20_000;
  const substantive = s.substantive ?? s.total ?? 0;
  const savedAt = prog.savedAt ?? fs.statSync(PROGRESS_FILE).mtime.toISOString();
  const staleMinutes = Math.round((Date.now() - new Date(savedAt).getTime()) / 60_000);
  const reallyFinished = Boolean(prog.finishedAt) && substantive >= factTarget;

  let runStatus: BulkSeedDashboard['runStatus'] = 'stopped';
  if (reallyFinished) runStatus = 'finished';
  else if (live.status === 'running' && staleMinutes < 15) runStatus = 'running';
  else if (staleMinutes > 30 && !prog.finishedAt) runStatus = 'stale';
  else if (live.status === 'running') runStatus = 'running';

  const tracksRemaining = Math.max(0, catalogTotal - done);
  const etaMinutes = prog.etaMinutes ?? null;
  const etaLabel = fmtEta(etaMinutes);

  return {
    updatedAt: new Date().toISOString(),
    source: 'server-read',
    savedAt,
    finishedAt: prog.finishedAt,
    runStatus,
    staleMinutes,
    catalogTotal,
    tracksDone: done,
    tracksRemaining,
    tracksPct: catalogTotal ? Math.round((done / catalogTotal) * 1000) / 10 : 0,
    factsSubstantive: substantive,
    factsTarget: factTarget,
    factsPct: factTarget ? Math.round((substantive / factTarget) * 1000) / 10 : 0,
    hotFacts: s.hot ?? 0,
    hotTarget,
    hotPct: hotTarget ? Math.round(((s.hot ?? 0) / hotTarget) * 1000) / 10 : 0,
    zeroFacts: s.zeroFacts ?? 0,
    metadata: s.metadata,
    bySource: s.bySource ?? {},
    byScope: s.byScope ?? {},
    tracksPerMin: prog.tracksPerMin,
    etaMinutes: etaMinutes ?? undefined,
    etaLabel,
    bankFileMb: bankFileMb(),
    stopReason: live.stopReason,
    live: live.status !== 'idle' ? live : live.stopReason ? live : undefined,
  };
}

export function loadBulkSeedDashboard(): BulkSeedDashboard | null {
  const fromFile = readJson<BulkSeedDashboard | null>(DASHBOARD_FILE, null);
  if (fromFile && typeof fromFile === 'object' && fromFile.tracksDone != null) {
    return { ...fromFile, source: 'server-read' };
  }
  return buildBulkSeedDashboardFromFiles();
}

export function saveBulkSeedDashboard(payload: BulkSeedDashboard): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DASHBOARD_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

export function saveBulkSeedLiveProgress(live: BulkSeedLiveProgress): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LIVE_FILE, JSON.stringify({ ...live, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
}

export function loadBulkSeedLiveProgress(): BulkSeedLiveProgress {
  return readJson<BulkSeedLiveProgress>(LIVE_FILE, { status: 'idle' });
}
