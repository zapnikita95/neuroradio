import { runWeeklyChartHarvest } from './weekly-chart-harvest.js';
import {
  isWeeklyChartHarvestEnabled,
  msUntilNextSunday3amMsk,
} from './chart-harvest-schedule.js';

const FIRST_RUN_MS = parseInt(
  process.env.WEEKLY_CHART_HARVEST_DELAY_MS ?? String(3 * 60 * 60_000),
  10,
);

let schedulerStarted = false;
let recurringTimer: ReturnType<typeof setTimeout> | null = null;

export { isWeeklyChartHarvestEnabled, msUntilNextSunday3amMsk } from './chart-harvest-schedule.js';

function scheduleRecurringSaturdayNight(): void {
  if (recurringTimer) {
    clearTimeout(recurringTimer);
    recurringTimer = null;
  }
  const delay = msUntilNextSunday3amMsk();
  recurringTimer = setTimeout(() => {
    void runWeeklyChartHarvest().finally(() => scheduleRecurringSaturdayNight());
  }, delay);
  recurringTimer.unref?.();
  console.log(
    `[chart-harvest] next Sat→Sun run in ${Math.round(delay / 3_600_000)}h ` +
      `(Sunday 03:00 MSK)`,
  );
}

export function startWeeklyChartHarvestScheduler(): void {
  if (!isWeeklyChartHarvestEnabled() || schedulerStarted) return;
  schedulerStarted = true;

  setTimeout(() => {
    void runWeeklyChartHarvest().finally(() => scheduleRecurringSaturdayNight());
  }, FIRST_RUN_MS).unref();

  console.log(
    `[chart-harvest] scheduler started — first run in ${Math.round(FIRST_RUN_MS / 60_000)}m, ` +
      `then every Sat→Sun night (Sunday 03:00 MSK)`,
  );
}
