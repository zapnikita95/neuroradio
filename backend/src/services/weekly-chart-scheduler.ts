import { runWeeklyChartHarvest } from './weekly-chart-harvest.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = parseInt(process.env.WEEKLY_CHART_HARVEST_DELAY_MS ?? String(5 * 60_000), 10);

let schedulerStarted = false;

export function isWeeklyChartHarvestEnabled(): boolean {
  const flag = process.env.WEEKLY_CHART_HARVEST?.trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  // On by default when Last.fm or Spotify credentials exist (trending facts for push hints).
  if (flag === 'true' || flag === '1' || flag === 'on') return true;
  return Boolean(
    process.env.LASTFM_API_KEY?.trim() ||
      (process.env.SPOTIFY_CLIENT_ID?.trim() &&
        (process.env.SPOTIFY_SECRET?.trim() || process.env.SPOTIFY_CLIENT_SECRET?.trim())),
  );
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
