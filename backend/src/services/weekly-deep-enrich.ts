import fs from 'node:fs';
import path from 'node:path';
import { loadCatalogWithOverlays } from './catalog-overlay.js';
import { huntDeepFact } from './deep-search-orchestrator.js';
import type { DeepSearchMode } from './deep-search-provider.js';
import { ingestHarvestFacts, trackKey as bankTrackKey } from './fact-bank.js';
import { isListeningStatsFact } from './reference-fact-quality.js';
import { isTelegramAdminNotifyConfigured, sendTelegramAdminMessage } from './telegram-admin-notify.js';
import {
  isWeeklyDeepEnrichEnabled,
  resolveWeeklyDeepEnrichCap,
  formatNextSunday3amMsk,
  lastSunday3amMskUtc,
} from './weekly-deep-enrich-schedule.js';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const BANK_PATH = path.join(DATA_DIR, 'facts-bank.json');
const FEEDBACK_PATH = path.join(DATA_DIR, 'story-feedback.jsonl');
const LAST_RUN_PATH = path.join(DATA_DIR, 'weekly-deep-enrich-last-run.json');
const QUEUE_SNAPSHOT_PATH = path.join(DATA_DIR, 'weekly-deep-enrich-queue.json');

export interface DeepEnrichTrack {
  artist: string;
  title: string;
  reason: 'ru_zero' | 'ru_no_hot' | 'boring_feedback' | 'era_top100';
  priority: number;
}

export interface WeeklyDeepEnrichResult {
  cap: number;
  queued: number;
  processed: number;
  wins: number;
  errors: number;
  costUsd: number;
  tracks: Array<{
    artist: string;
    title: string;
    reason: string;
    ok: boolean;
    fact?: string;
    scope?: string;
    costUsd?: number;
    error?: string;
  }>;
}

let running = false;

function trackKey(artist: string, title: string): string {
  return bankTrackKey(artist, title);
}

function isRu(artist: string, title: string): boolean {
  return /[\u0400-\u04FF]/.test(artist + title);
}

function loadJson<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function resolveEnrichMode(): DeepSearchMode {
  const env = process.env.DEEP_ENRICH_MODE?.trim().toLowerCase();
  if (env === 'baseline_ddg' || env === 'ddg_jina' || env === 'tavily' || env === 'perplexity') {
    return env;
  }
  return 'ddg_jina';
}

function useLlmVerify(): boolean {
  const flag = process.env.DEEP_ENRICH_LLM_VERIFY?.trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'on';
}

type BankPool = Array<{ isHot?: boolean; isMetadata?: boolean; fact: string }>;

function trackPool(
  bank: { byTrack?: Record<string, BankPool> },
  artist: string,
  title: string,
): BankPool {
  return bank.byTrack?.[trackKey(artist, title)] ?? [];
}

function substantiveFacts(pool: BankPool): BankPool {
  return pool.filter((f) => !f.isMetadata && !isListeningStatsFact(f.fact));
}

function hotFacts(pool: BankPool): BankPool {
  return pool.filter((f) => f.isHot && !f.isMetadata);
}

function eraOverlayFileCount(): number {
  try {
    const p = path.join(DATA_DIR, 'era-top100-tracks.json');
    if (!fs.existsSync(p)) return 0;
    const overlay = JSON.parse(fs.readFileSync(p, 'utf8')) as { tracks?: unknown[] };
    return overlay.tracks?.length ?? 0;
  } catch {
    return 0;
  }
}

function eraTop100Stats(
  catalog: ReturnType<typeof loadCatalogWithOverlays>,
  bank: { byTrack?: Record<string, BankPool> },
): { catalogTagged: number; eligible: number; skippedHot: number; overlayFile: number } {
  let catalogTagged = 0;
  let eligible = 0;
  let skippedHot = 0;
  for (const t of catalog.tracks ?? []) {
    if (!t.source?.startsWith('era-top100:')) continue;
    catalogTagged += 1;
    const pool = trackPool(bank, t.artist, t.title);
    if (hotFacts(pool).length >= 2) {
      skippedHot += 1;
    } else {
      eligible += 1;
    }
  }
  return { catalogTagged, eligible, skippedHot, overlayFile: eraOverlayFileCount() };
}

/** Full priority queue (deduped). Does not depend on bulk-seed-progress — scans bank + catalog. */
export function buildWeeklyDeepEnrichQueueAll(): DeepEnrichTrack[] {
  const catalog = loadCatalogWithOverlays();
  const bank = loadJson<{ byTrack?: Record<string, BankPool> }>(BANK_PATH, { byTrack: {} });
  const bankTrackCount = Object.keys(bank.byTrack ?? {}).length;

  const out: DeepEnrichTrack[] = [];
  const seen = new Set<string>();

  function push(row: DeepEnrichTrack): void {
    const k = trackKey(row.artist, row.title);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(row);
  }

  // 1) User marked story boring — highest signal for «need better fact»
  if (fs.existsSync(FEEDBACK_PATH)) {
    for (const line of fs.readFileSync(FEEDBACK_PATH, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { reason?: string; artist?: string; title?: string; vote?: string };
        if (row.vote !== 'down' || row.reason !== 'boring_fact') continue;
        if (!row.artist?.trim() || !row.title?.trim()) continue;
        push({
          artist: row.artist.trim(),
          title: row.title.trim(),
          reason: 'boring_feedback',
          priority: isRu(row.artist, row.title) ? 0 : 10,
        });
      } catch {
        /* skip bad line */
      }
    }
  }

  // 2) RU catalog tracks with no substantive facts in bank (zero-facts)
  for (const t of catalog.tracks ?? []) {
    if (!isRu(t.artist, t.title)) continue;
    const pool = trackPool(bank, t.artist, t.title);
    if (substantiveFacts(pool).length > 0) continue;
    push({ artist: t.artist, title: t.title, reason: 'ru_zero', priority: 1 });
  }

  // 3) RU parsed but weak / no hot fact
  for (const t of catalog.tracks ?? []) {
    if (!isRu(t.artist, t.title)) continue;
    const pool = trackPool(bank, t.artist, t.title);
    const substantive = substantiveFacts(pool);
    if (substantive.length === 0) continue;
    if (hotFacts(pool).length > 0) continue;
    if (substantive.length >= 3) continue;
    push({ artist: t.artist, title: t.title, reason: 'ru_no_hot', priority: 2 });
  }

  // 4) Era top-100 overlay — re-enrich if weak
  for (const t of catalog.tracks ?? []) {
    const src = t.source ?? '';
    if (!src.startsWith('era-top100:')) continue;
    const pool = trackPool(bank, t.artist, t.title);
    if (hotFacts(pool).length >= 2) continue;
    push({
      artist: t.artist,
      title: t.title,
      reason: 'era_top100',
      priority: isRu(t.artist, t.title) ? 3 : 15,
    });
  }

  out.sort((a, b) => a.priority - b.priority || a.artist.localeCompare(b.artist));

  if (out.length === 0) {
    console.warn(
      `[weekly-deep-enrich] queue empty — catalog=${catalog.tracks?.length ?? 0} ` +
        `bankTracks=${bankTrackCount} bankPath=${BANK_PATH} ` +
        `eraOverlay=${fs.existsSync(path.join(DATA_DIR, 'era-top100-tracks.json'))}`,
    );
  }

  return out;
}

/** Build priority queue for weekly deep enrich (deduped, capped). */
export function buildWeeklyDeepEnrichQueue(cap: number): DeepEnrichTrack[] {
  return buildWeeklyDeepEnrichQueueAll().slice(0, cap);
}

/** Persist queue snapshot after era overlay / bank refresh (Railway volume). */
export function persistWeeklyDeepEnrichQueueSnapshot(cap?: number): {
  cap: number;
  queue: DeepEnrichTrack[];
  totalEligible: number;
} {
  const limit = cap ?? resolveWeeklyDeepEnrichCap();
  const all = buildWeeklyDeepEnrichQueueAll();
  const queue = all.slice(0, limit);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    QUEUE_SNAPSHOT_PATH,
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        cap: limit,
        totalEligible: all.length,
        queue,
      },
      null,
      2,
    ),
  );
  console.log(
    `[weekly-deep-enrich] queue snapshot ${queue.length}/${all.length} eligible → ${QUEUE_SNAPSHOT_PATH}`,
  );
  return { cap: limit, queue, totalEligible: all.length };
}

function countByReason(rows: DeepEnrichTrack[]): Record<DeepEnrichTrack['reason'], number> {
  const byReason: Record<DeepEnrichTrack['reason'], number> = {
    boring_feedback: 0,
    ru_zero: 0,
    ru_no_hot: 0,
    era_top100: 0,
  };
  for (const row of rows) byReason[row.reason] += 1;
  return byReason;
}

export function summarizeWeeklyDeepEnrichQueue(cap: number): {
  cap: number;
  totalEligible: number;
  batchSize: number;
  byReason: Record<DeepEnrichTrack['reason'], number>;
  byReasonTotal: Record<DeepEnrichTrack['reason'], number>;
  bankTracks: number;
  catalogTracks: number;
  eraOverlay: boolean;
  eraTop100: { catalogTagged: number; eligible: number; skippedHot: number; overlayFile: number };
  nextRunMsk: string;
  mode: string;
  llmVerify: boolean;
} {
  const catalog = loadCatalogWithOverlays();
  const bank = loadJson<{ byTrack?: Record<string, BankPool> }>(BANK_PATH, { byTrack: {} });
  const all = buildWeeklyDeepEnrichQueueAll();
  const batch = all.slice(0, cap);
  const era = eraTop100Stats(catalog, bank);
  return {
    cap,
    totalEligible: all.length,
    batchSize: batch.length,
    byReason: countByReason(batch),
    byReasonTotal: countByReason(all),
    bankTracks: Object.keys(bank.byTrack ?? {}).length,
    catalogTracks: catalog.tracks?.length ?? 0,
    eraOverlay: fs.existsSync(path.join(DATA_DIR, 'era-top100-tracks.json')),
    eraTop100: era,
    nextRunMsk: formatNextSunday3amMsk(),
    mode: resolveEnrichMode(),
    llmVerify: useLlmVerify(),
  };
}

/** Telegram preview on boot: how many tracks Sunday job will take. */
export function getWeeklyDeepEnrichLastRun(): (WeeklyDeepEnrichResult & {
  finishedAt?: string;
  mode?: string;
}) | null {
  return loadJson(LAST_RUN_PATH, null);
}

/** True if a successful weekly run finished since last Sunday 03:00 MSK. */
export function weeklyDeepEnrichRanSinceLastSunday(): boolean {
  const last = getWeeklyDeepEnrichLastRun();
  if (!last?.finishedAt) return false;
  const finishedMs = new Date(last.finishedAt).getTime();
  return finishedMs >= lastSunday3amMskUtc();
}

/** Telegram preview on boot: how many tracks Sunday job will take. */
export async function sendWeeklyDeepEnrichBootDigest(): Promise<void> {
  if (!isWeeklyDeepEnrichEnabled() || !isTelegramAdminNotifyConfigured()) return;
  const cap = resolveWeeklyDeepEnrichCap();
  const s = summarizeWeeklyDeepEnrichQueue(cap);
  const last = getWeeklyDeepEnrichLastRun();
  const lastLine = last?.finishedAt
    ? `Последний прогон: ${last.finishedAt} (wins ${last.wins ?? 0}/${last.processed ?? 0})\n`
    : 'Последний прогон: ещё не было\n';
  const emptyHint =
    s.totalEligible === 0
      ? `\n⚠️ очередь пуста: bank=${s.bankTracks} треков, catalog=${s.catalogTracks}, era=${s.eraOverlay ? 'ok' : 'нет overlay'}`
      : '';
  await sendTelegramAdminMessage(
    `📅 Weekly deep enrich (preview)\n` +
      lastLine +
      `Следующий прогон: ${s.nextRunMsk}\n` +
      `Cap: ${s.cap} | возьмёт: ${s.batchSize} из ${s.totalEligible} eligible\n` +
      `Bank: ${s.bankTracks} треков | catalog: ${s.catalogTracks} | era overlay: ${s.eraOverlay ? 'да' : 'нет'}\n` +
      `Mode: ${s.mode} | LLM verify: ${s.llmVerify ? 'on (~$0.005/fact)' : 'off ($0)'}\n\n` +
      `👎 boring: ${s.byReason.boring_feedback} (всего ${s.byReasonTotal.boring_feedback})\n` +
      `🇷🇺 zero: ${s.byReason.ru_zero} (всего ${s.byReasonTotal.ru_zero})\n` +
      `🇷🇺 no hot: ${s.byReason.ru_no_hot} (всего ${s.byReasonTotal.ru_no_hot})\n` +
      `📻 era-top100: в overlay ${s.eraTop100.overlayFile} | в каталоге ${s.eraTop100.catalogTagged} | в очередь ${s.eraTop100.eligible} (≥2 hot: ${s.eraTop100.skippedHot})` +
      emptyHint,
  );
}

export async function runWeeklyDeepEnrich(
  opts: { cap?: number; dryRun?: boolean } = {},
): Promise<WeeklyDeepEnrichResult> {
  if (running) {
    throw new Error('weekly-deep-enrich already running');
  }
  running = true;
  const cap = opts.cap ?? resolveWeeklyDeepEnrichCap();
  const queue = buildWeeklyDeepEnrichQueue(cap * 3);
  const batch = queue.slice(0, cap);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(QUEUE_SNAPSHOT_PATH, JSON.stringify({ builtAt: new Date().toISOString(), queue: batch }, null, 2));

  const result: WeeklyDeepEnrichResult = {
    cap,
    queued: batch.length,
    processed: 0,
    wins: 0,
    errors: 0,
    costUsd: 0,
    tracks: [],
  };

  if (opts.dryRun) {
    running = false;
    return result;
  }

  const mode = resolveEnrichMode();
  const llm = useLlmVerify();
  const openRouterKey = llm ? process.env.OPEN_ROUTER_API_KEY?.trim() : undefined;

  console.log(
    `[weekly-deep-enrich] start cap=${cap} mode=${mode} llmVerify=${llm} queue=${batch.length}`,
  );
  if (isTelegramAdminNotifyConfigured()) {
    await sendTelegramAdminMessage(
      `▶️ Weekly deep enrich START\n` +
        `Cap: ${cap} | mode: ${mode} | LLM verify: ${llm ? 'on' : 'off'}\n` +
        `Очередь: ${batch.length} треков`,
    );
  }

  for (const row of batch) {
    result.processed += 1;
    try {
      const deep = await huntDeepFact({
        artist: row.artist,
        title: row.title,
        mode,
        openRouterApiKey: openRouterKey,
        openRouterModel: process.env.OPENROUTER_FACT_MODEL?.trim(),
        tavilyApiKey: mode === 'tavily' ? process.env.TAVILY_API_KEY?.trim() : undefined,
        perplexityApiKey: mode === 'perplexity' ? process.env.PERPLEXITY_API_KEY?.trim() : undefined,
      });
      result.costUsd += deep?.costUsd ?? 0;
      if (deep?.fact) {
        ingestHarvestFacts(row.artist, row.title, [
          {
            fact: deep.fact,
            scope: deep.scope,
            source: 'llm',
            harvestSource: 'deep-search',
            minScore: 3,
          },
        ]);
        result.wins += 1;
        result.tracks.push({
          artist: row.artist,
          title: row.title,
          reason: row.reason,
          ok: true,
          fact: deep.fact,
          scope: deep.scope,
          costUsd: deep.costUsd,
        });
        console.log(
          `[weekly-deep-enrich] WIN ${row.artist} — ${row.title}: ${deep.fact.slice(0, 90)}…`,
        );
      } else {
        result.tracks.push({
          artist: row.artist,
          title: row.title,
          reason: row.reason,
          ok: false,
          error: 'no_fact',
        });
      }
    } catch (err) {
      result.errors += 1;
      result.tracks.push({
        artist: row.artist,
        title: row.title,
        reason: row.reason,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const finishedAt = new Date().toISOString();
  fs.writeFileSync(
    LAST_RUN_PATH,
    JSON.stringify({ ...result, finishedAt, mode }, null, 2),
    'utf8',
  );

  if (result.wins > 0) {
    const lines = result.tracks
      .filter((t) => t.ok && t.fact)
      .slice(0, 15)
      .map(
        (t) =>
          `• ${t.artist} — ${t.title}\n  ${t.fact!.slice(0, 120)}${t.fact!.length > 120 ? '…' : ''}`,
      );
    await sendTelegramAdminMessage(
      `🎵 Weekly deep enrich (${mode})\n` +
        `Wins: ${result.wins}/${result.processed} | $${result.costUsd.toFixed(3)}\n\n` +
        lines.join('\n\n') +
        (result.wins > 15 ? `\n\n…ещё ${result.wins - 15}` : ''),
    );
  } else {
    await sendTelegramAdminMessage(
      `Weekly deep enrich: 0/${result.processed} wins (mode=${mode}). Queue exhausted or sources weak.`,
    );
  }

  console.log(
    `[weekly-deep-enrich] done wins=${result.wins}/${result.processed} cost=$${result.costUsd.toFixed(3)}`,
  );
  running = false;
  return result;
}

export function getWeeklyDeepEnrichStatus(): {
  enabled: boolean;
  cap: number;
  mode: string;
  lastRun: (WeeklyDeepEnrichResult & { finishedAt?: string; mode?: string }) | null;
  nextScheduledMsk: string;
} {
  return {
    enabled: isWeeklyDeepEnrichEnabled(),
    cap: resolveWeeklyDeepEnrichCap(),
    mode: resolveEnrichMode(),
    lastRun: loadJson(LAST_RUN_PATH, null),
    nextScheduledMsk: formatNextSunday3amMsk(),
  };
}
