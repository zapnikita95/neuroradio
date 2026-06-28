import { eraOverlayAgeMs, isEraTop100AutoEnabled, runEraTop100CatalogUpdate } from './era-top100-catalog.js';
import {
  runWeeklyDeepEnrich,
  sendWeeklyDeepEnrichBootDigest,
  persistWeeklyDeepEnrichQueueSnapshot,
  weeklyDeepEnrichRanSinceLastSunday,
  getWeeklyDeepEnrichLastRun,
} from './weekly-deep-enrich.js';
import {
  isWeeklyDeepEnrichEnabled,
  msUntilNextSunday3amMsk,
} from './weekly-deep-enrich-schedule.js';

const CATCHUP_DELAY_MS = parseInt(
  process.env.WEEKLY_DEEP_ENRICH_CATCHUP_DELAY_MS ?? String(3 * 60_000),
  10,
);
const ERA_MAX_AGE_MS = parseInt(
  process.env.ERA_TOP100_MAX_AGE_MS ?? String(7 * 24 * 60 * 60_000),
  10,
);

let started = false;
let recurringTimer: ReturnType<typeof setTimeout> | null = null;
let catchupTimer: ReturnType<typeof setTimeout> | null = null;

async function maybeRefreshEraTop100Catalog(reason: string, force = false): Promise<void> {
  if (!isEraTop100AutoEnabled()) return;
  const age = eraOverlayAgeMs();
  if (!force && age !== null && age < ERA_MAX_AGE_MS) {
    console.log(`[era-top100] skip (${reason}) — overlay age ${Math.round(age / 3_600_000)}h`);
    return;
  }
  try {
    const r = await runEraTop100CatalogUpdate();
    console.log(`[era-top100] ${reason}: +${r.added} tracks, total ${r.total}`);
    persistWeeklyDeepEnrichQueueSnapshot();
  } catch (err) {
    console.warn('[era-top100] update failed:', err instanceof Error ? err.message : err);
  }
}

async function runWeeklyDeepEnrichCycle(reason: string, opts: { forceEra?: boolean } = {}): Promise<void> {
  try {
    console.log(`[weekly-deep-enrich] cycle start (${reason})`);
    await maybeRefreshEraTop100Catalog('pre-enrich', opts.forceEra === true);
    await runWeeklyDeepEnrich();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already running')) {
      console.warn(`[weekly-deep-enrich] skip (${reason}) — previous run still active`);
      return;
    }
    console.error(`[weekly-deep-enrich] cycle failed (${reason}):`, msg);
  }
}

function scheduleRecurringSunday(): void {
  if (recurringTimer) {
    clearTimeout(recurringTimer);
    recurringTimer = null;
  }
  const delay = msUntilNextSunday3amMsk();
  recurringTimer = setTimeout(() => {
    void runWeeklyDeepEnrichCycle('sunday-03-msk').finally(() => scheduleRecurringSunday());
  }, delay);
  recurringTimer.unref?.();
  console.log(
    `[weekly-deep-enrich] next Sunday run in ${Math.round(delay / 3_600_000)}h (03:00 MSK)`,
  );
}

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const SUNDAY_3AM_MSK_HOUR = 3;

function shouldRunCatchUp(): boolean {
  if (weeklyDeepEnrichRanSinceLastSunday()) return false;
  const now = Date.now();
  const msk = new Date(now + MSK_OFFSET_MS);
  const dow = msk.getUTCDay();
  const hour = msk.getUTCHours();
  // Before today's Sunday 03:00 MSK — regular timer will fire, don't duplicate
  if (dow === 0 && hour < SUNDAY_3AM_MSK_HOUR) return false;
  return true;
}

function scheduleCatchUpIfMissed(): void {
  if (catchupTimer) {
    clearTimeout(catchupTimer);
    catchupTimer = null;
  }
  if (!shouldRunCatchUp()) {
    const last = getWeeklyDeepEnrichLastRun();
    console.log(
      `[weekly-deep-enrich] catch-up skip — last=${last?.finishedAt ?? 'never'} ` +
        `ranSinceSunday=${weeklyDeepEnrichRanSinceLastSunday()}`,
    );
    return;
  }

  const now = Date.now();
  const msk = new Date(now + MSK_OFFSET_MS);
  const sundayPast3am = msk.getUTCDay() === 0 && msk.getUTCHours() >= SUNDAY_3AM_MSK_HOUR;
  const delay = sundayPast3am ? 5_000 : CATCHUP_DELAY_MS;

  console.log(
    `[weekly-deep-enrich] catch-up scheduled in ${Math.round(delay / 1000)}s (missed weekly slot)`,
  );
  catchupTimer = setTimeout(() => {
    void runWeeklyDeepEnrichCycle('boot-catchup-missed-sunday');
  }, delay);
  catchupTimer.unref?.();
}

/** Manual / admin trigger — starts immediately (async, non-blocking caller). */
export function triggerWeeklyDeepEnrichNow(
  reason = 'manual',
  opts: { forceEra?: boolean } = {},
): void {
  if (catchupTimer) {
    clearTimeout(catchupTimer);
    catchupTimer = null;
  }
  void runWeeklyDeepEnrichCycle(reason, opts);
}

export function startWeeklyDeepEnrichScheduler(): void {
  if (!isWeeklyDeepEnrichEnabled() || started) return;
  started = true;

  // Sunday timer immediately — survives independently of any catch-up run
  scheduleRecurringSunday();
  scheduleCatchUpIfMissed();

  void (async () => {
    await maybeRefreshEraTop100Catalog('boot');
    persistWeeklyDeepEnrichQueueSnapshot();
    await sendWeeklyDeepEnrichBootDigest();
  })();

  console.log('[weekly-deep-enrich] scheduler started — Sunday 03:00 MSK + catch-up if missed');
}

export { isWeeklyDeepEnrichEnabled, msUntilNextSunday3amMsk } from './weekly-deep-enrich-schedule.js';
