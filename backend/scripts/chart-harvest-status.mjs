import '../dist/bootstrap-logs.js';
import '../dist/bootstrap-proxy.js';
import { getChartHarvestStatus } from '../dist/services/weekly-chart-harvest.js';

const status = getChartHarvestStatus();
console.log(JSON.stringify(status, null, 2));

if (!status.enabled) {
  console.log('\n⚠ WEEKLY_CHART_HARVEST is not enabled on this server.');
}
if (!status.snapshotUpdatedAt) {
  console.log('\n⚠ No chart snapshot yet — run npm run harvest:charts or wait for scheduler.');
} else {
  console.log(`\n✓ Snapshot updated: ${status.snapshotUpdatedAt}`);
  console.log(`  Charts: ${status.chartSourceCount}, unique tracks: ${status.uniqueTracks}`);
}
if (status.lastRun) {
  console.log(`\n✓ Last harvest: ${status.lastRun.finishedAt}`);
  console.log(`  factsIngested=${status.lastRun.factsIngested} harvested=${status.lastRun.harvested} errors=${status.lastRun.errors}`);
} else {
  console.log('\n⚠ No last-run record yet (chart-harvest-last-run.json).');
}
console.log(`\nNext Sat→Sun run (MSK): ${status.nextScheduledMsk}`);
