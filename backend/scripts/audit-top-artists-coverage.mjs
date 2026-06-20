#!/usr/bin/env node
/** Cross-check known / top-catalog artists vs facts-bank. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const bank = JSON.parse(readFileSync(join(__dir, '../data/facts-bank.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(__dir, '../src/data/popular-tracks-catalog.json'), 'utf8'));
const known = JSON.parse(readFileSync(join(__dir, '../src/data/known-artists.json'), 'utf8'));

function norm(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function trackKey(a, t) {
  return `${norm(a)}|${norm(t)}`;
}

const byArtist = bank.byArtist ?? {};
const byTrack = bank.byTrack ?? {};

/** artist -> { tracks, withFacts } */
const catalogByArtist = new Map();
for (const t of catalog.tracks) {
  const a = norm(t.artist);
  if (!a) continue;
  let row = catalogByArtist.get(a);
  if (!row) {
    row = { tracks: 0, withFacts: 0 };
    catalogByArtist.set(a, row);
  }
  row.tracks += 1;
  if ((byTrack[trackKey(t.artist, t.title)] ?? []).length) row.withFacts += 1;
}

const hotPushSources = [
  (s) => s.startsWith('genre-top'),
  (s) => s.startsWith('lastfm-tag'),
  (s) => s.startsWith('lastfm-year'),
  (s) => s.startsWith('lastfm-decade'),
  (s) => s.includes('itunes-chart'),
  (s) => s.includes('deezer-playlist'),
  (s) => s.includes('seed-global'),
];

const hotPushArtists = new Set();
const genreTopOnly = new Set();
for (const t of catalog.tracks) {
  const src = t.source ?? '';
  const a = norm(t.artist);
  if (hotPushSources.some((fn) => fn(src))) hotPushArtists.add(a);
  if (src.startsWith('genre-top') || src.startsWith('lastfm-tag')) genreTopOnly.add(a);
}

function auditSet(label, names) {
  let artistPool = 0;
  let hot = 0;
  let sub2 = 0;
  let zero = 0;
  let full = 0;
  let partial = 0;
  let none = 0;
  const missing = [];

  for (const n of names) {
    if (!n) continue;
    const pool = byArtist[n] ?? [];
    const hotN = pool.filter((f) => f.isHot).length;
    const subN = pool.filter((f) => !f.isMetadata).length;
    if (pool.length) artistPool++;
    else {
      zero++;
      if (missing.length < 20) missing.push(n);
    }
    if (hotN) hot++;
    if (subN >= 2) sub2++;

    const tc = catalogByArtist.get(n);
    if (tc?.tracks) {
      if (tc.withFacts === tc.tracks) full++;
      else if (tc.withFacts > 0) partial++;
      else none++;
    }
  }

  const size = names.size;
  console.log(`\n=== ${label} (${size} artists) ===`);
  console.log(`Artist pool in bank: ${artistPool} (${((artistPool / size) * 100).toFixed(1)}%)`);
  console.log(`With ≥1 hot fact: ${hot} (${((hot / size) * 100).toFixed(1)}%)`);
  console.log(`With ≥2 substantive artist facts: ${sub2}`);
  console.log(`No artist pool: ${zero}`);
  console.log(`Catalog tracks: full=${full} partial=${partial} zero-track-facts=${none}`);
  if (missing.length) console.log(`Missing (sample): ${missing.join(' | ')}`);
}

const knownSet = new Set(known.artists.map(norm));
const knownInCatalog = new Set([...knownSet].filter((n) => catalogByArtist.has(n)));

auditSet('known-artists.json (Wikipedia list)', knownSet);
auditSet('Hot-push queue (genre-top, charts, tags)', hotPushArtists);
auditSet('genre-top + lastfm-tag only', genreTopOnly);
auditSet('Known artists that appear in catalog', knownInCatalog);

console.log(`\nBank totals: ${Object.keys(byArtist).length} artist keys, ${Object.keys(byTrack).length} track keys`);

// artist -> track keys index
const trackKeysByArtist = new Map();
for (const t of catalog.tracks) {
  const a = norm(t.artist);
  if (!a) continue;
  const keys = trackKeysByArtist.get(a) ?? [];
  keys.push(trackKey(t.artist, t.title));
  trackKeysByArtist.set(a, keys);
}

function auditAnyFactsFast(label, artistSet) {
  let substantive = 0;
  let hot = 0;
  for (const artist of artistSet) {
    const ap = byArtist[artist] ?? [];
    let hasSub = ap.some((f) => !f.isMetadata);
    let hasHot = ap.some((f) => f.isHot);
    for (const k of trackKeysByArtist.get(artist) ?? []) {
      const pool = byTrack[k] ?? [];
      if (pool.some((f) => !f.isMetadata)) hasSub = true;
      if (pool.some((f) => f.isHot)) hasHot = true;
    }
    if (hasSub) substantive++;
    if (hasHot) hot++;
  }
  const n = artistSet.size;
  console.log(
    `\n=== ${label} — combined artist+track ===\n` +
      `Substantive facts: ${substantive} (${((substantive / n) * 100).toFixed(1)}%)\n` +
      `Hot facts: ${hot} (${((hot / n) * 100).toFixed(1)}%)`,
  );
}

auditAnyFactsFast('genre-top + lastfm-tag', genreTopOnly);
auditAnyFactsFast('Known in catalog', knownInCatalog);
