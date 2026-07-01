#!/usr/bin/env node
/** Push current local harvest stats to Railway dashboard (after batch or anytime). */
import '../dist/load-env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildYoutubeHarvestDashboardFromFiles,
  saveYoutubeHarvestDashboard,
  slimYoutubeHarvestDashboardForSync,
} from '../dist/services/youtube-harvest-dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

async function main() {
  let dashboard = buildYoutubeHarvestDashboardFromFiles();
  if (!dashboard) {
    const dashPath = path.join(DATA, 'youtube-harvest-dashboard.json');
    if (fs.existsSync(dashPath)) {
      dashboard = JSON.parse(fs.readFileSync(dashPath, 'utf8'));
    }
  }
  if (!dashboard) {
    console.error('No harvest data — run batch first');
    process.exit(1);
  }
  dashboard.updatedAt = new Date().toISOString();
  dashboard.source = 'local-batch';

  const dashPath = path.join(DATA, 'youtube-harvest-dashboard.json');
  saveYoutubeHarvestDashboard(dashboard);
  console.log('saved', dashPath);

  const siteDash = path.join(ROOT, '..', 'website', 'admin', 'harvest-data.json');
  fs.mkdirSync(path.dirname(siteDash), { recursive: true });
  fs.writeFileSync(siteDash, JSON.stringify(dashboard, null, 2), 'utf8');
  console.log('saved', siteDash);

  console.log(
    JSON.stringify({
      processed: dashboard.processed,
      pending: dashboard.pending,
      failed: dashboard.failed,
      ingestedRun: dashboard.ingestedRun,
      catalogFacts: dashboard.catalogFacts,
      videos: dashboard.videos?.length ?? 0,
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
  const syncBody = slimYoutubeHarvestDashboardForSync(dashboard);
  const res = await fetch(`${bff}/v1/admin/youtube-harvest/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-harvest-dashboard-token': token },
    body: JSON.stringify(syncBody),
  });
  const body = await res.text();
  console.log('sync', res.status, body.slice(0, 300));
  if (!res.ok) process.exit(1);

  const check = await fetch(`${bff}/v1/admin/youtube-harvest/status?token=${encodeURIComponent(token)}`);
  const checkBody = await check.text();
  console.log('verify GET', check.status, checkBody.slice(0, 120));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
