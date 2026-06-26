import fs from 'node:fs';
import path from 'node:path';
import { huntDeepFact } from './deep-search-orchestrator.js';
import type { DeepSearchMode } from './deep-search-provider.js';
import { ingestHarvestFacts } from './fact-bank.js';
import { isListeningStatsFact } from './reference-fact-quality.js';
import { sendTelegramAdminMessage } from './telegram-admin-notify.js';
import {
  isWeeklyDeepEnrichEnabled,
  resolveWeeklyDeepEnrichCap,
  formatNextSunday3amMsk,
} from './weekly-deep-enrich-schedule.js';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const CATALOG_PATH = path.join(process.cwd(), 'src/data/popular-tracks-catalog.json');
const BANK_PATH = path.join(DATA_DIR, 'facts-bank.json');
const PROGRESS_PATH = path.join(DATA_DIR, 'bulk-seed-progress.json');
const FEEDBACK_PATH = path.join(DATA_DIR, 'story-feedback.jsonl');
const LAST_RUN_PATH = path.join(DATA_DIR, 'weekly-deep-enrich-last-run.json');
const QUEUE_SNAPSHOT_PATH = path.join(DATA_DIR, 'weekly-deep-enrich-queue.json');

export interface DeepEnrichTrack {
  artist: string;
  title: string;
  reason: 'ru_zero' | 'ru_no_hot' | 'boring_feedback' | 'genre_top_zero' | 'era_top100';
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

function norm(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function trackKey(artist: string, title: string): string {
  return `${norm(artist)}|${norm(title)}`;
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

/** Build priority queue for weekly deep enrich (deduped). */
export function buildWeeklyDeepEnrichQueue(cap: number): DeepEnrichTrack[] {
  const catalog = loadJson<{ tracks?: Array<{ artist: string; title: string; source?: string }> }>(
    CATALOG_PATH,
    { tracks: [] },
  );
  const bank = loadJson<{ byTrack?: Record<string, Array<{ isHot?: boolean; isMetadata?: boolean; fact: string }>> }>(
    BANK_PATH,
    { byTrack: {} },
  );
  const prog = loadJson<{ zeroFactKeys?: string[]; doneKeys?: string[] }>(PROGRESS_PATH, {});
  const zeroKeys = new Set(prog.zeroFactKeys ?? []);
  const doneKeys = new Set(prog.doneKeys ?? []);
  const catByKey = new Map((catalog.tracks ?? []).map((t) => [trackKey(t.artist, t.title), t]));

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

  // 2) RU zero-facts
  for (const key of zeroKeys) {
    const t = catByKey.get(key);
    if (!t || !isRu(t.artist, t.title)) continue;
    push({ artist: t.artist, title: t.title, reason: 'ru_zero', priority: 1 });
  }

  // 3) RU parsed but no hot fact
  for (const t of catalog.tracks ?? []) {
    if (!isRu(t.artist, t.title)) continue;
    const k = trackKey(t.artist, t.title);
    if (!doneKeys.has(k)) continue;
    const pool = bank.byTrack?.[k] ?? [];
    const hot = pool.filter((f) => f.isHot && !f.isMetadata);
    if (hot.length > 0) continue;
    const substantive = pool.filter((f) => !f.isMetadata && !isListeningStatsFact(f.fact));
    if (substantive.length >= 3) continue;
    push({ artist: t.artist, title: t.title, reason: 'ru_no_hot', priority: 2 });
  }

  // 4) Era top-100 (500 hits) — re-enrich if weak
  for (const t of catalog.tracks ?? []) {
    const src = t.source ?? '';
    if (!src.startsWith('era-top100:')) continue;
    const k = trackKey(t.artist, t.title);
    const pool = bank.byTrack?.[k] ?? [];
    const hot = pool.filter((f) => f.isHot && !f.isMetadata).length;
    if (hot >= 2) continue;
    push({
      artist: t.artist,
      title: t.title,
      reason: 'era_top100',
      priority: isRu(t.artist, t.title) ? 3 : 15,
    });
  }

  // 5) genre-top EN zero — second pass
  for (const key of zeroKeys) {
    const t = catByKey.get(key);
    if (!t || isRu(t.artist, t.title)) continue;
    const src = t.source ?? '';
    if (!src.startsWith('genre-top')) continue;
    push({ artist: t.artist, title: t.title, reason: 'genre_top_zero', priority: 20 });
  }

  out.sort((a, b) => a.priority - b.priority || a.artist.localeCompare(b.artist));
  return out.slice(0, cap);
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
