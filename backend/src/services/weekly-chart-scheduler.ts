import { runWeeklyChartHarvest } from './weekly-chart-harvest.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = parseInt(process.env.WEEKLY_CHART_HARVEST_DELAY_MS ?? String(5 * 60_000), 10);

let schedulerStarted = false;

/** Chart harvest is opt-in — never steal API budget from live /v1/story/full. */
export function isWeeklyChartHarvestEnabled(): boolean {
  const flag = process.env.WEEKLY_CHART_HARVEST?.trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'on';
}

export function startWeeklyChartHarvestScheduler(): void {
  if (!isWeeklyChartHarvestEnabled() || schedulerStarted) return;
  schedulerStarted = true;

  setTimeout(() => {
    void runWeeklyChartHarvest();
  }, INITIAL_DELAY_MS).unref();

  setInterval(() => {
    void runWeeklyChartHarvest();
  }, WEEK_MS).unref();

  console.log(
    `[chart-harvest] scheduler started (every 7d, first run in ${Math.round(INITIAL_DELAY_MS / 60_000)}m)`,
  );
}
