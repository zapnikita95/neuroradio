/** Moscow is UTC+3 year-round (no DST). */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const SUNDAY_3AM_MSK_HOUR = 3;

/** Chart harvest is opt-in — never steal API budget from live /v1/story/full. */
export function isWeeklyChartHarvestEnabled(): boolean {
  const flag = process.env.WEEKLY_CHART_HARVEST?.trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'on';
}

/** Ms until next Sunday 03:00 MSK (night Sat → Sun). */
export function msUntilNextSunday3amMsk(fromMs = Date.now()): number {
  const msk = new Date(fromMs + MSK_OFFSET_MS);
  const dow = msk.getUTCDay();
  const hour = msk.getUTCHours();

  let daysToAdd = 0;
  if (dow === 0 && hour < SUNDAY_3AM_MSK_HOUR) {
    daysToAdd = 0;
  } else if (dow === 0) {
    daysToAdd = 7;
  } else {
    daysToAdd = 7 - dow;
  }

  const targetMsk = new Date(msk);
  targetMsk.setUTCDate(targetMsk.getUTCDate() + daysToAdd);
  targetMsk.setUTCHours(SUNDAY_3AM_MSK_HOUR, 0, 0, 0);
  const targetUtc = targetMsk.getTime() - MSK_OFFSET_MS;
  return Math.max(60_000, targetUtc - fromMs);
}

export function formatNextSunday3amMsk(fromMs = Date.now()): string {
  const delay = msUntilNextSunday3amMsk(fromMs);
  return new Date(fromMs + delay + MSK_OFFSET_MS).toISOString();
}
