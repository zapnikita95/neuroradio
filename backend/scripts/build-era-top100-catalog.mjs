#!/usr/bin/env node
/** Top-100 Last.fm tag per era year → ~500 tracks in catalog (era-top100:YYYY). */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../src/data/popular-tracks-catalog.json');
const LASTFM_KEY = process.env.LASTFM_API_KEY?.trim() ?? '';
const USER_AGENT = 'MusicStoryBFF/1.0 (era-top100 catalog)';

const nowYear = new Date().getFullYear();
/** 1y, 3y, 5y, 10y, 20y ago */
const ERA_YEARS = [0, 2, 4, 9, 19].map((off) => nowYear - 1 - off);
const LIMIT = parseInt(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '100', 10);

function trackKey(artist, title) {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

async function fetchLastfmYearTop(year, limit) {
  if (!LASTFM_KEY) return [];
  const q = new URLSearchParams({
    method: 'tag.gettoptracks',
    tag: String(year),
    limit: String(Math.min(limit, 1000)),
    api_key: LASTFM_KEY,
    format: 'json',
  });
  const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${q}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (data.error) {
    console.warn(`lastfm year ${year}: error ${data.error}`);
    return [];
  }
  return (data.tracks?.track ?? []).map((t) => ({
    artist: t.artist?.name ?? t.artist?.['#text'] ?? '',
    title: t.name ?? '',
    source: `era-top100:${year}`,
    year,
  }));
}

async function main() {
  const catalog = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, 'utf8'))
    : { tracks: [] };
  const map = new Map((catalog.tracks ?? []).map((t) => [trackKey(t.artist, t.title), t]));
  let added = 0;

  console.log(`Era years: ${ERA_YEARS.join(', ')} (limit=${LIMIT} each)`);
  for (const year of ERA_YEARS) {
    const rows = await fetchLastfmYearTop(year, LIMIT);
    console.log(`  ${year}: ${rows.length} tracks from Last.fm tag`);
    for (const t of rows) {
      const key = trackKey(t.artist, t.title);
      if (map.has(key)) continue;
      map.set(key, t);
      added += 1;
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  const tracks = [...map.values()];
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        ...catalog,
        generatedAt: new Date().toISOString(),
        count: tracks.length,
        eraTop100: { years: ERA_YEARS, limit: LIMIT, added },
        tracks,
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${tracks.length} tracks (+${added} era-top100) → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
