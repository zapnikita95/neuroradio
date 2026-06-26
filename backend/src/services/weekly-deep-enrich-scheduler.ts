import { runWeeklyDeepEnrich } from './weekly-deep-enrich.js';
import {
  isWeeklyDeepEnrichEnabled,
  msUntilNextSunday3amMsk,
} from './weekly-deep-enrich-schedule.js';

const FIRST_RUN_MS = parseInt(
  process.env.WEEKLY_DEEP_ENRICH_DELAY_MS ?? String(6 * 60 * 60_000),
  10,
);

let started = false;
let recurringTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRecurringSunday(): void {
  if (recurringTimer) {
    clearTimeout(recurringTimer);
    recurringTimer = null;
  }
  const delay = msUntilNextSunday3amMsk();
  recurringTimer = setTimeout(() => {
    void runWeeklyDeepEnrich().finally(() => scheduleRecurringSunday());
  }, delay);
  recurringTimer.unref?.();
  console.log(
    `[weekly-deep-enrich] next Sunday run in ${Math.round(delay / 3_600_000)}h (03:00 MSK)`,
  );
}

export function startWeeklyDeepEnrichScheduler(): void {
  if (!isWeeklyDeepEnrichEnabled() || started) return;
  started = true;

  setTimeout(() => {
    void runWeeklyDeepEnrich().finally(() => scheduleRecurringSunday());
  }, FIRST_RUN_MS).unref?.();

  console.log(
    `[weekly-deep-enrich] scheduler started — first run in ${Math.round(FIRST_RUN_MS / 60_000)}m, ` +
      `then every Sunday 03:00 MSK`,
  );
}

export { isWeeklyDeepEnrichEnabled, msUntilNextSunday3amMsk } from './weekly-deep-enrich-schedule.js';
