#!/usr/bin/env node
/**
 * Live fact search — 5 diverse tracks, source breakdown.
 * npm run build && node scripts/test-live-facts-5tracks.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repoRoot = resolve(root, '..');

function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (v && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(resolve(repoRoot, '.env'));
loadEnv(resolve(root, '.env'));

await import('./setup-hidemy-proxy.mjs');

const TRACKS = [
  { artist: 'Queen', title: 'Bohemian Rhapsody', cc: 'US', note: 'классика + genius' },
  { artist: 'Eminem', title: 'Lose Yourself', cc: 'US', note: 'rap + genius' },
  { artist: 'Кино', title: 'Группа крови', cc: 'RU', note: 'RU артист' },
  { artist: 'Redbone', title: 'Come and Get Your Love', cc: 'US', note: 'lastfm' },
  { artist: 'Nirvana', title: 'Smells Like Teen Spirit', cc: 'US', note: 'setlistfm/songfacts' },
];

const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
const { pickReferenceFact } = await import('../dist/services/fact-picker.js');
const { interestScore } = await import('../dist/services/reference-fact-quality.js');

const BUDGET_MS = 45_000;
const results = [];

console.log('LIVE fact search — 5 tracks\n');
console.log(
  `Keys: GENIUS=${process.env.GENIUS_ACCESS_TOKEN ? 'yes' : 'NO'} ` +
    `LASTFM=${process.env.LASTFM_API_KEY ? 'yes' : 'NO'} ` +
    `SETLIST=${process.env.SETLISTFM_API_KEY ? 'yes' : 'NO'}`,
);
console.log(`Proxy: HTTP_PROXY=${process.env.HTTP_PROXY ?? process.env.HTTPS_PROXY ?? 'none'}\n`);

for (const { artist, title, cc, note } of TRACKS) {
  console.log(`${'='.repeat(64)}`);
  console.log(`${artist} — ${title} (${note})`);
  const t0 = Date.now();
  const ctx = await fetchAggregatedFactContext(artist, title, cc);
  const ms = Date.now() - t0;
  const picked = pickReferenceFact(ctx.bundle, [], 0, artist, title);

  const srcCounts = {};
  for (const s of ctx.snippetSources) srcCounts[s] = (srcCounts[s] ?? 0) + 1;

  const dedicatedSources = ['genius', 'lastfm', 'setlistfm', 'songfacts', 'whosampled', 'secondhandsongs', 'rap-ru', 'the-flow'];
  const dedicatedHits = dedicatedSources.filter((s) => (srcCounts[s] ?? 0) > 0);

  results.push({
    artist,
    title,
    ms,
    trackN: ctx.bundle.trackFacts.length,
    artistN: ctx.bundle.artistFacts.length,
    snippets: ctx.rawSnippets.length,
    dedicatedHits,
    picked: Boolean(picked),
    ok:
      ms <= BUDGET_MS &&
      (ctx.bundle.trackFacts.length + ctx.bundle.artistFacts.length > 0 || dedicatedHits.length > 0),
  });

  console.log(`Time: ${(ms / 1000).toFixed(1)}s | track=${ctx.bundle.trackFacts.length} artist=${ctx.bundle.artistFacts.length} snippets=${ctx.rawSnippets.length}`);
  console.log(`Sources in raw: ${JSON.stringify(srcCounts)}`);
  console.log(`Dedicated parsers hit: ${dedicatedHits.length ? dedicatedHits.join(', ') : 'NONE'}`);
  console.log(`Picked seed: ${picked ? picked.fact.slice(0, 120) + (picked.fact.length > 120 ? '…' : '') : '(none)'}`);
  if (ctx.bundle.trackFacts[0]) {
    console.log(`Best track [${interestScore(ctx.bundle.trackFacts[0])}]: ${ctx.bundle.trackFacts[0].slice(0, 140)}…`);
  }
}

console.log(`\n${'='.repeat(64)}`);
console.log('SUMMARY:');
let pass = 0;
for (const r of results) {
  const status = r.ok ? 'PASS' : 'FAIL';
  if (r.ok) pass += 1;
  console.log(
    `  [${status}] ${r.artist} — ${r.title}: ${(r.ms / 1000).toFixed(1)}s ` +
      `facts=${r.trackN + r.artistN} dedicated=[${r.dedicatedHits.join(',')}] seed=${r.picked}`,
  );
}
console.log(`\n${pass}/${results.length} passed (facts>0, time<${BUDGET_MS / 1000}s)`);
process.exit(pass === results.length ? 0 : 1);
