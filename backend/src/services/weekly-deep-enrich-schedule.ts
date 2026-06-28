/** Weekly deep enrich: queue Mon–Sat, run Sunday 03:00 MSK (same window as chart harvest). */
export function isWeeklyDeepEnrichEnabled(): boolean {
  const flag = process.env.WEEKLY_DEEP_ENRICH?.trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'on';
}

export function resolveWeeklyDeepEnrichCap(): number {
  return Math.max(1, parseInt(process.env.WEEKLY_DEEP_ENRICH_CAP ?? '50', 10));
}

export { msUntilNextSunday3amMsk, formatNextSunday3amMsk, lastSunday3amMskUtc } from './chart-harvest-schedule.js';
