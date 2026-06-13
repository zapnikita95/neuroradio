/**
 * Weekly chart harvest — fetch trending tracks, diff vs snapshot, background fact prep.
 * Run: npm run harvest:charts [--dry-run] [--limit=30]
 */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
process.env.HARVEST_RATE_LIMIT = 'true';
import { runWeeklyChartHarvest } from '../dist/services/weekly-chart-harvest.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limit = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '', 10);

const result = await runWeeklyChartHarvest({
  dryRun,
  ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.errors > 0 && result.chartsFetched === 0 ? 1 : 0);
