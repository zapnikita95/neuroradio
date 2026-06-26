import { eraOverlayAgeMs, isEraTop100AutoEnabled, runEraTop100CatalogUpdate } from './era-top100-catalog.js';
import { runWeeklyDeepEnrich, sendWeeklyDeepEnrichBootDigest } from './weekly-deep-enrich.js';
import {
  isWeeklyDeepEnrichEnabled,
  msUntilNextSunday3amMsk,
} from './weekly-deep-enrich-schedule.js';

const FIRST_RUN_MS = parseInt(
  process.env.WEEKLY_DEEP_ENRICH_DELAY_MS ?? String(6 * 60 * 60_000),
  10,
);
const ERA_BOOT_DELAY_MS = parseInt(process.env.ERA_TOP100_BOOT_DELAY_MS ?? String(3 * 60_000), 10);
const ERA_MAX_AGE_MS = parseInt(
  process.env.ERA_TOP100_MAX_AGE_MS ?? String(7 * 24 * 60 * 60_000),
  10,
);

let started = false;
let recurringTimer: ReturnType<typeof setTimeout> | null = null;

async function maybeRefreshEraTop100Catalog(reason: string): Promise<void> {
  if (!isEraTop100AutoEnabled()) return;
  const age = eraOverlayAgeMs();
  if (age !== null && age < ERA_MAX_AGE_MS) {
    console.log(`[era-top100] skip (${reason}) — overlay age ${Math.round(age / 3_600_000)}h`);
    return;
  }
  try {
    const r = await runEraTop100CatalogUpdate();
    console.log(`[era-top100] ${reason}: +${r.added} tracks, total ${r.total}`);
  } catch (err) {
    console.warn('[era-top100] update failed:', err instanceof Error ? err.message : err);
  }
}

async function runWeeklyDeepEnrichCycle(): Promise<void> {
  await maybeRefreshEraTop100Catalog('pre-sunday-enrich');
  await runWeeklyDeepEnrich();
}

function scheduleRecurringSunday(): void {
  if (recurringTimer) {
    clearTimeout(recurringTimer);
    recurringTimer = null;
  }
  const delay = msUntilNextSunday3amMsk();
  recurringTimer = setTimeout(() => {
    void runWeeklyDeepEnrichCycle().finally(() => scheduleRecurringSunday());
  }, delay);
  recurringTimer.unref?.();
  console.log(
    `[weekly-deep-enrich] next Sunday run in ${Math.round(delay / 3_600_000)}h (03:00 MSK)`,
  );
}

export function startWeeklyDeepEnrichScheduler(): void {
  if (!isWeeklyDeepEnrichEnabled() || started) return;
  started = true;

  void sendWeeklyDeepEnrichBootDigest();

  setTimeout(() => {
    void maybeRefreshEraTop100Catalog('boot');
  }, ERA_BOOT_DELAY_MS).unref?.();

  setTimeout(() => {
    void runWeeklyDeepEnrichCycle().finally(() => scheduleRecurringSunday());
  }, FIRST_RUN_MS).unref?.();

  console.log(
    `[weekly-deep-enrich] scheduler started — first run in ${Math.round(FIRST_RUN_MS / 60_000)}m, ` +
      `then every Sunday 03:00 MSK`,
  );
}

export { isWeeklyDeepEnrichEnabled, msUntilNextSunday3amMsk } from './weekly-deep-enrich-schedule.js';
