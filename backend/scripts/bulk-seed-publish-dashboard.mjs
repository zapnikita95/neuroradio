#!/usr/bin/env node
/** Push bulk-seed progress to site snapshot + Railway dashboard. */
import '../dist/load-env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBulkSeedDashboardFromFiles, saveBulkSeedDashboard } from '../dist/services/bulk-seed-dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

async function main() {
  const dash = buildBulkSeedDashboardFromFiles();
  if (!dash) {
    console.error('No bulk-seed-progress.json — run seed:facts first');
    process.exit(1);
  }
  dash.updatedAt = new Date().toISOString();
  dash.source = 'local-batch';

  const dashPath = path.join(ROOT, 'data', 'bulk-seed-dashboard.json');
  saveBulkSeedDashboard(dash);
  console.log('saved', dashPath);

  const siteDash = path.join(ROOT, '..', 'website', 'admin', 'bulk-seed-data.json');
  fs.mkdirSync(path.dirname(siteDash), { recursive: true });
  fs.writeFileSync(siteDash, JSON.stringify(dash, null, 2), 'utf8');
  console.log('saved', siteDash);

  console.log(
    JSON.stringify({
      tracksDone: dash.tracksDone,
      catalogTotal: dash.catalogTotal,
      factsSubstantive: dash.factsSubstantive,
      hotFacts: dash.hotFacts,
      runStatus: dash.runStatus,
      etaLabel: dash.etaLabel,
    }),
  );

  const token = process.env.HARVEST_DASHBOARD_TOKEN?.trim();
  const bff = (process.env.WEBSITE_DEMO_API_BASE || process.env.BFF_URL || 'https://www.efir-ai.ru').replace(
    /\/$/,
    '',
  );
  if (!token) {
    console.warn('HARVEST_DASHBOARD_TOKEN missing — site snapshot ok, Railway sync skipped');
    return;
  }
  const res = await fetch(`${bff}/v1/admin/bulk-seed/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-harvest-dashboard-token': token },
    body: JSON.stringify(dash),
  });
  const body = await res.text();
  console.log('sync', res.status, body.slice(0, 300));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
