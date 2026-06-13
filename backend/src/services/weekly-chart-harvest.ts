import fs from 'node:fs';
import path from 'node:path';
import { harvestAllFacts } from './fact-sources/index.js';
import { ingestHarvestFacts } from './fact-bank.js';
import {
  WEEKLY_CHART_SOURCES,
  chartTrackKey,
  type ChartTrack,
} from './chart-sources.js';
import {
  formatNextSunday3amMsk,
  isWeeklyChartHarvestEnabled,
} from './chart-harvest-schedule.js';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const SNAPSHOT_PATH = path.join(DATA_DIR, 'chart-weekly-snapshot.json');
const LAST_RUN_PATH = path.join(DATA_DIR, 'chart-harvest-last-run.json');
const DEFAULT_LIMIT = parseInt(process.env.WEEKLY_CHART_HARVEST_LIMIT ?? '60', 10);
const HARVEST_CONCURRENCY = parseInt(process.env.WEEKLY_CHART_HARVEST_CONCURRENCY ?? '2', 10);

interface ChartSnapshot {
  updatedAt: string;
  charts: Record<string, ChartTrack[]>;
  /** track key → ISO date first seen in any chart */
  firstSeen: Record<string, string>;
}

let harvestRunning = false;

function loadSnapshot(): ChartSnapshot {
  try {
    if (!fs.existsSync(SNAPSHOT_PATH)) {
      return { updatedAt: '', charts: {}, firstSeen: {} };
    }
    return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as ChartSnapshot;
  } catch {
    return { updatedAt: '', charts: {}, firstSeen: {} };
  }
}

function saveSnapshot(snapshot: ChartSnapshot): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
}

async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
}

function isSubstantiveFact(fact: { fact: string; metadataOnly?: boolean }): boolean {
  return !fact.metadataOnly && fact.fact.trim().length >= 35;
}

export interface WeeklyChartHarvestResult {
  chartsFetched: number;
  tracksTotal: number;
  newTracks: number;
  harvested: number;
  factsIngested: number;
  hotTracks: number;
  errors: number;
}

export interface ChartHarvestStatus {
  enabled: boolean;
  snapshotPath: string;
  lastRunPath: string;
  snapshotUpdatedAt: string | null;
  chartSourceCount: number;
  uniqueTracks: number;
  newTracksTracked: number;
  lastRun: (WeeklyChartHarvestResult & { finishedAt: string }) | null;
  nextScheduledMsk: string;
}

function saveLastRun(result: WeeklyChartHarvestResult): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    LAST_RUN_PATH,
    JSON.stringify({ ...result, finishedAt: new Date().toISOString() }),
    'utf8',
  );
}

export function getChartHarvestStatus(): ChartHarvestStatus {
  const snapshot = loadSnapshot();
  let lastRun: ChartHarvestStatus['lastRun'] = null;
  try {
    if (fs.existsSync(LAST_RUN_PATH)) {
      lastRun = JSON.parse(fs.readFileSync(LAST_RUN_PATH, 'utf8')) as ChartHarvestStatus['lastRun'];
    }
  } catch {
    lastRun = null;
  }

  return {
    enabled: isWeeklyChartHarvestEnabled(),
    snapshotPath: SNAPSHOT_PATH,
    lastRunPath: LAST_RUN_PATH,
    snapshotUpdatedAt: snapshot.updatedAt || null,
    chartSourceCount: Object.keys(snapshot.charts).length,
    uniqueTracks: Object.keys(snapshot.firstSeen).length,
    newTracksTracked: Object.keys(snapshot.firstSeen).length,
    lastRun,
    nextScheduledMsk: formatNextSunday3amMsk(),
  };
}

export async function runWeeklyChartHarvest(opts: { limit?: number; dryRun?: boolean } = {}): Promise<WeeklyChartHarvestResult> {
  process.env.HARVEST_RATE_LIMIT = 'true';
  process.env.BULK_HARVEST = 'true';
  if (harvestRunning) {
    console.log('[chart-harvest] already running — skip');
    return {
      chartsFetched: 0,
      tracksTotal: 0,
      newTracks: 0,
      harvested: 0,
      factsIngested: 0,
      hotTracks: 0,
      errors: 0,
    };
  }
  harvestRunning = true;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const result: WeeklyChartHarvestResult = {
    chartsFetched: 0,
    tracksTotal: 0,
    newTracks: 0,
    harvested: 0,
    factsIngested: 0,
    hotTracks: 0,
    errors: 0,
  };

  try {
    const prev = loadSnapshot();
    const charts: Record<string, ChartTrack[]> = {};
    const allTracks = new Map<string, ChartTrack & { sources: string[] }>();

    for (const source of WEEKLY_CHART_SOURCES) {
      try {
        const tracks = await source.fetch();
        if (tracks.length === 0) {
          console.warn(`[chart-harvest] empty chart ${source.id}`);
          continue;
        }
        charts[source.id] = tracks;
        result.chartsFetched += 1;
        console.log(`[chart-harvest] ${source.label}: ${tracks.length} tracks`);
        for (const t of tracks) {
          const key = chartTrackKey(t.artist, t.title);
          const existing = allTracks.get(key);
          if (existing) {
            existing.sources.push(source.id);
            if (t.rank < existing.rank) existing.rank = t.rank;
          } else {
            allTracks.set(key, { ...t, sources: [source.id] });
          }
        }
      } catch (err) {
        result.errors += 1;
        console.warn(`[chart-harvest] ${source.id} failed:`, err instanceof Error ? err.message : err);
      }
    }

    result.tracksTotal = allTracks.size;
    const nowIso = new Date().toISOString();
    const firstSeen = { ...prev.firstSeen };

    const newEntries: Array<ChartTrack & { sources: string[] }> = [];
    for (const [key, track] of allTracks) {
      if (!firstSeen[key]) {
        firstSeen[key] = nowIso;
        newEntries.push(track);
      }
    }

    newEntries.sort((a, b) => a.rank - b.rank);
    result.newTracks = newEntries.length;
    const toHarvest = newEntries.slice(0, limit);

    console.log(
      `[chart-harvest] unique=${result.tracksTotal} new=${result.newTracks} ` +
        `will-harvest=${toHarvest.length} dryRun=${Boolean(opts.dryRun)}`,
    );

    if (!opts.dryRun && toHarvest.length > 0) {
      await runPool(toHarvest, HARVEST_CONCURRENCY, async (track) => {
        try {
          const facts = await harvestAllFacts({
            artist: track.artist,
            title: track.title,
            countryCode: track.sources.some((s) => s.includes('ru') || s.includes('russia')) ? 'RU' : undefined,
          });
          const substantive = facts.filter(isSubstantiveFact);
          result.harvested += 1;
          if (substantive.length === 0) return;

          const ingested = ingestHarvestFacts(
            track.artist,
            track.title,
            substantive.map((f) => ({
              fact: f.fact,
              scope: f.scope,
              source: 'api' as const,
              harvestSource: f.source,
              minScore: 3,
            })),
          );
          result.factsIngested += ingested;
          const hasHot = substantive.some((f) => f.fact.length >= 80);
          if (hasHot) result.hotTracks += 1;
          console.log(
            `[chart-harvest] ok "${track.artist}" — "${track.title}" ` +
              `facts=${substantive.length} ingested=${ingested} charts=${track.sources.join(',')}`,
          );
        } catch (err) {
          result.errors += 1;
          console.warn(
            `[chart-harvest] harvest failed "${track.artist}" — "${track.title}":`,
            err instanceof Error ? err.message : err,
          );
        }
      });
    }

    if (!opts.dryRun) {
      saveSnapshot({
        updatedAt: nowIso,
        charts,
        firstSeen,
      });
    }

    console.log(`[chart-harvest] done ${JSON.stringify(result)}`);
    if (!opts.dryRun) saveLastRun(result);
    return result;
  } finally {
    harvestRunning = false;
  }
}
