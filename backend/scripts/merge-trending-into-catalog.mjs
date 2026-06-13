/**
 * Merge trending chart tracks into popular-tracks-catalog.json (no wipe).
 * Run: npm run expand:catalog
 */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEEKLY_CHART_SOURCES, fetchItunesChart, fetchDeezerGlobalChart, fetchLastfmGlobalChart, fetchLastfmGeoChart } from '../dist/services/chart-sources.js';
import { primaryHarvestLookupTitle } from '../dist/services/title-harvest-variants.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const CATALOG = join(__dir, '../src/data/popular-tracks-catalog.json');
const SNAPSHOT = join(__dir, '../data/chart-weekly-snapshot.json');

function trackKey(artist, title) {
  return `${artist.trim().toLowerCase()}|${primaryHarvestLookupTitle(title).trim().toLowerCase()}`;
}

function addTrack(map, artist, title, source) {
  const a = artist?.trim();
  const t = primaryHarvestLookupTitle(title?.trim() ?? '');
  if (!a || !t || t.length < 2) return false;
  const key = trackKey(a, t);
  if (map.has(key)) return false;
  map.set(key, { artist: a, title: t, source });
  return true;
}

async function main() {
  const map = new Map();
  let loaded = 0;

  if (existsSync(CATALOG)) {
    const existing = JSON.parse(readFileSync(CATALOG, 'utf8'));
    for (const t of existing.tracks ?? []) {
      if (addTrack(map, t.artist, t.title, t.source ?? 'existing')) loaded += 1;
    }
    console.log(`loaded existing: ${loaded}`);
  }

  let fromCharts = 0;
  for (const source of WEEKLY_CHART_SOURCES) {
    try {
      const tracks = await source.fetch();
      let added = 0;
      for (const t of tracks) {
        if (addTrack(map, t.artist, t.title, `chart:${source.id}`)) {
          added += 1;
          fromCharts += 1;
        }
      }
      console.log(`+ ${source.label}: ${tracks.length} fetched, ${added} new`);
    } catch (e) {
      console.warn(`chart ${source.id}:`, e.message);
    }
  }

  const extraFetches = [
    { label: 'Last.fm Global x200', fn: () => fetchLastfmGlobalChart(200), src: 'chart:lastfm-global-200' },
    { label: 'Last.fm Russia x200', fn: () => fetchLastfmGeoChart('Russia', 200), src: 'chart:lastfm-ru-200' },
    { label: 'Last.fm Ukraine x100', fn: () => fetchLastfmGeoChart('Ukraine', 100), src: 'chart:lastfm-ua' },
    { label: 'iTunes UA', fn: () => fetchItunesChart('ua', 100), src: 'chart:itunes-ua' },
    { label: 'iTunes DE', fn: () => fetchItunesChart('de', 100), src: 'chart:itunes-de' },
    { label: 'iTunes GB', fn: () => fetchItunesChart('gb', 100), src: 'chart:itunes-gb' },
    { label: 'Deezer x200', fn: () => fetchDeezerGlobalChart(200), src: 'chart:deezer-200' },
  ];
  for (const { label, fn, src } of extraFetches) {
    try {
      const tracks = await fn();
      let added = 0;
      for (const t of tracks) {
        if (addTrack(map, t.artist, t.title, src)) {
          added += 1;
          fromCharts += 1;
        }
      }
      console.log(`+ ${label}: ${tracks.length} fetched, ${added} new`);
    } catch (e) {
      console.warn(`${label}:`, e.message);
    }
  }

  if (existsSync(SNAPSHOT)) {
    try {
      const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
      let added = 0;
      for (const pool of Object.values(snap.charts ?? {})) {
        for (const t of pool) {
          if (addTrack(map, t.artist, t.title, `chart-snapshot:${t.chartId ?? 'saved'}`)) {
            added += 1;
            fromCharts += 1;
          }
        }
      }
      console.log(`+ snapshot: ${added} new`);
    } catch (e) {
      console.warn('snapshot:', e.message);
    }
  }

  const tracks = [...map.values()];
  writeFileSync(
    CATALOG,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), count: tracks.length, tracks },
      null,
      0,
    ),
  );
  console.log(`catalog: ${tracks.length} tracks (+${fromCharts} from charts)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
