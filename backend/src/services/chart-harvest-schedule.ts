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
  const target = nextSunday3amMskUtc(fromMs);
  return Math.max(60_000, target - fromMs);
}

/** UTC ms of the most recent Sunday 03:00 MSK at or before fromMs. */
export function lastSunday3amMskUtc(fromMs = Date.now()): number {
  const next = nextSunday3amMskUtc(fromMs);
  const msk = new Date(fromMs + MSK_OFFSET_MS);
  const dow = msk.getUTCDay();
  const hour = msk.getUTCHours();
  if (dow === 0 && hour >= SUNDAY_3AM_MSK_HOUR) {
    const targetMsk = new Date(msk);
    targetMsk.setUTCHours(SUNDAY_3AM_MSK_HOUR, 0, 0, 0);
    return targetMsk.getTime() - MSK_OFFSET_MS;
  }
  return next - 7 * 24 * 60 * 60_000;
}

function nextSunday3amMskUtc(fromMs: number): number {
  const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
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
  return targetMsk.getTime() - MSK_OFFSET_MS;
}

export function formatNextSunday3amMsk(fromMs = Date.now()): string {
  const targetUtc = fromMs + msUntilNextSunday3amMsk(fromMs);
  const d = new Date(targetUtc + MSK_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(SUNDAY_3AM_MSK_HOUR)}:00 MSK`;
}
