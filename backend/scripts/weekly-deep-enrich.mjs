#!/usr/bin/env node
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
import { buildWeeklyDeepEnrichQueue, runWeeklyDeepEnrich } from '../dist/services/weekly-deep-enrich.js';
import { getWeeklyDeepEnrichStatus } from '../dist/services/weekly-deep-enrich.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const cap = parseInt(args.find((a) => a.startsWith('--cap='))?.split('=')[1] ?? '0', 10) || undefined;

if (args.includes('--status')) {
  console.log(JSON.stringify(getWeeklyDeepEnrichStatus(), null, 2));
  process.exit(0);
}

if (args.includes('--queue')) {
  const q = buildWeeklyDeepEnrichQueue(cap ?? 50);
  console.log(`Queue (${q.length}):`);
  for (const row of q.slice(0, 30)) {
    console.log(`  [${row.reason}] ${row.artist} — ${row.title}`);
  }
  process.exit(0);
}

runWeeklyDeepEnrich({ dryRun, cap })
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
