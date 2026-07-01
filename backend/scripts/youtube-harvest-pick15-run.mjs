#!/usr/bin/env node
/** Find 15 fresh essay videos across harvest channels → queue → start batch on PC. */
import '../dist/load-env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { listChannelVideos } from './youtube-essay-fact-harvest.mjs';

const execFileAsync = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dir, '..');
const DATA = path.join(ROOT, 'data');
const CHANNELS_FULL = path.join(ROOT, 'src', 'data', 'youtube-channels-full.json');
const STATE_FILE = path.join(DATA, 'youtube-harvest-state.json');
const CATALOG_FILE = path.join(DATA, 'youtube-harvest-catalog.json');
const MANUAL_QUEUE_FILE = path.join(DATA, 'youtube-harvest-manual-queue.json');
const DASHBOARD_FILE = path.join(DATA, 'youtube-harvest-dashboard.json');

function loadJson(p, fb) {
  if (!fs.existsSync(p)) return fb;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function harvestedIds() {
  const ids = new Set();
  const state = loadJson(STATE_FILE, { processedVideoIds: [] });
  for (const id of state.processedVideoIds ?? []) ids.add(id);
  const cat = loadJson(CATALOG_FILE, { videos: [] });
  for (const v of cat.videos ?? []) if (v.id) ids.add(v.id);
  const dash = loadJson(DASHBOARD_FILE, { videos: [] });
  for (const v of dash.videos ?? []) if (v.videoId) ids.add(v.videoId);
  return ids;
}

const JUNK =
  /розыгрыш|giveaway|#shorts|shorts|тизер|trailer|preview|live stream|стрим|podcast clip|реклама|promo code|merch/i;
const GOOD =
  /разбор|истори|альбом|трек|song|album|phenomenon|how |why |deep dive|analysis|explained|эссе|музык|rap|rock|pop|панк|жанр|год:|year |влиян|создан|запис|карьер|legend|classic/i;

function scoreVideo(v) {
  let s = 0;
  const title = v.title ?? '';
  const dur = v.durationSec || 0;
  if (dur >= 480 && dur <= 4200) s += 4;
  else if (dur >= 240 && dur <= 5400) s += 2;
  else if (dur < 120 || dur > 7200) s -= 6;
  if (JUNK.test(title)) s -= 12;
  const goodHits = (title.match(new RegExp(GOOD.source, 'gi')) ?? []).length;
  s += goodHits * 2;
  if (/разбор/i.test(title)) s += 3;
  if (/истори/i.test(title)) s += 2;
  return s;
}


async function syncQueueToRailway(videos) {
  const token = process.env.HARVEST_DASHBOARD_TOKEN?.trim();
  const bff = (
    process.env.WEBSITE_DEMO_API_BASE?.trim() ||
    process.env.BFF_URL?.trim() ||
    process.env.PUBLIC_BFF_URL?.trim() ||
    'https://www.efir-ai.ru'
  ).replace(/\/$/, '');
  if (!token) {
    console.warn('[pick15] HARVEST_DASHBOARD_TOKEN missing — local queue only');
    return;
  }
  await fetch(`${bff}/v1/admin/youtube-harvest/queue`, {
    method: 'DELETE',
    headers: { 'x-harvest-dashboard-token': token },
  }).catch(() => {});
  const res = await fetch(`${bff}/v1/admin/youtube-harvest/queue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-harvest-dashboard-token': token },
    body: JSON.stringify({ videos }),
  });
  const body = await res.text();
  console.log('[pick15] railway queue', res.status, body.slice(0, 200));
}

async function startBatchDetached() {
  const ps1 = path.join(__dir, 'run-youtube-harvest-detached.ps1');
  await execFileAsync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Mode', 'from-queue'],
    { cwd: ROOT, timeout: 180_000 },
  );
}

async function main() {
  const cfg = loadJson(CHANNELS_FULL, { channels: [] });
  const skip = harvestedIds();
  console.log('[pick15] already harvested:', skip.size);

  const candidates = [];
  for (const ch of cfg.channels ?? []) {
    let listed;
    try {
      listed = listChannelVideos(ch.url, 50);
    } catch (e) {
      console.warn('[pick15] skip channel', ch.id, e instanceof Error ? e.message : e);
      continue;
    }
    for (const v of listed) {
      if (skip.has(v.id)) continue;
      const row = {
        id: v.id,
        title: v.title,
        url: v.url,
        durationSec: v.durationSec,
        channelKey: ch.id,
        channelName: ch.name,
        languageCode: ch.lang === 'eng' ? 'eng' : 'rus',
        _score: 0,
      };
      row._score = scoreVideo(row);
      if (row._score < 1) continue;
      candidates.push(row);
    }
    console.log('[pick15]', ch.name, 'fresh candidates:', candidates.filter((c) => c.channelKey === ch.id).length);
  }

  candidates.sort((a, b) => b._score - a._score || b.durationSec - a.durationSec);
  const picked = [];
  const usedChannel = new Map();
  for (const v of candidates) {
    if (picked.length >= 15) break;
    const n = usedChannel.get(v.channelKey) ?? 0;
    if (n >= 2) continue;
    usedChannel.set(v.channelKey, n + 1);
    picked.push(v);
  }

  if (picked.length < 15) {
    console.warn('[pick15] only found', picked.length, 'suitable videos');
  }
  if (!picked.length) {
    console.error('[pick15] nothing to run');
    process.exit(1);
  }

  const queueRows = picked.map((v) => ({
    id: v.id,
    title: v.title,
    url: v.url,
    channelName: v.channelName,
    languageCode: v.languageCode,
    addedAt: new Date().toISOString(),
    addedBy: 'pick15-auto',
  }));

  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(
    MANUAL_QUEUE_FILE,
    JSON.stringify({ videos: queueRows, updatedAt: new Date().toISOString() }, null, 2),
  );
  console.log('[pick15] queued locally:', picked.length);
  for (const v of picked) {
    console.log(`  · ${v.channelName}: ${v.title.slice(0, 70)} (${Math.round(v.durationSec / 60)}m)`);
  }

  await syncQueueToRailway(
    queueRows.map(({ id, title, url, channelName, languageCode }) => ({
      id,
      title,
      url,
      channelName,
      languageCode,
    })),
  );

  console.log('[pick15] starting batch (detached)...');
  await startBatchDetached();
  console.log('[pick15] done — tail: Get-Content backend/logs/youtube-harvest.log -Wait -Tail 20');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
