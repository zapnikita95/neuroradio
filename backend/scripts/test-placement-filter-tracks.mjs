#!/usr/bin/env node
/** Live bundle + pick — no «N-й трек/сингл с альбома» in pool or seed. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
  { artist: 'The Killers', title: 'Read My Mind', cc: 'US' },
  { artist: 'Panic! At The Disco', title: 'House of Memories', cc: 'US' },
  { artist: 'Muse', title: 'Time is Running Out', cc: 'GB' },
  { artist: 'Axwell /\\ Ingrosso', title: 'More Than You Know', cc: 'SE' },
  { artist: 'Imagine Dragons', title: 'Lonely', cc: 'US' },
  { artist: 'Green Day', title: 'Holiday', cc: 'US' },
];

const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
const { pickReferenceFact, explainReferenceFactSelection } = await import('../dist/services/fact-picker.js');
const { splitBundleByScope, rankScopedFacts } = await import('../dist/services/fact-ranking.js');
const { isThinReleaseCatalogSeed } = await import('../dist/services/reference-fact-quality.js');

let failed = 0;

console.log('Placement-filter live check\n');

for (const { artist, title, cc } of TRACKS) {
  console.log('═'.repeat(72));
  console.log(`${artist} — ${title}`);
  const t0 = Date.now();
  const ctx = await fetchAggregatedFactContext(artist, title, cc);
  const ms = Date.now() - t0;

  const allFacts = [...ctx.bundle.trackFacts, ...ctx.bundle.artistFacts];
  const thinInBundle = allFacts.filter((f) => isThinReleaseCatalogSeed(f));
  const pools = splitBundleByScope(ctx.bundle, artist, title);
  const ranked = rankScopedFacts(pools).filter((r) => !r.junk);
  const pick = pickReferenceFact(ctx.bundle, [], 0, artist, title);

  console.log(`⏱ ${(ms / 1000).toFixed(1)}s | track=${ctx.bundle.trackFacts.length} artist=${ctx.bundle.artistFacts.length} raw=${ctx.rawSnippets.length}`);

  if (thinInBundle.length > 0) {
    failed += 1;
    console.log(`❌ THIN PLACEMENT IN BUNDLE (${thinInBundle.length}):`);
    thinInBundle.forEach((f) => console.log(`   · ${f.slice(0, 140)}…`));
  } else {
    console.log('✓ bundle: no placement-only facts');
  }

  const curatedHit = allFacts.some((f) => /curated|«Read My Mind» — The Killers: Brandon Flowers написал|House of Memories» — Panic/i.test(f));
  if (curatedHit) {
    failed += 1;
    console.log('❌ CURATED BAND-AID IN BUNDLE (should come from wiki/dedicated only)');
  }

  console.log('Top facts:');
  ranked.slice(0, 5).forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.scope}] ${r.interest} | ${r.fact.slice(0, 130)}${r.fact.length > 130 ? '…' : ''}`);
  });

  if (!pick) {
    failed += 1;
    console.log('❌ NO SEED PICKED');
  } else if (isThinReleaseCatalogSeed(pick.fact)) {
    failed += 1;
    console.log(`❌ PICK IS THIN: ${pick.fact.slice(0, 160)}`);
  } else {
    console.log(`✓ SEED: ${pick.fact.slice(0, 180)}${pick.fact.length > 180 ? '…' : ''}`);
    console.log(`  (${explainReferenceFactSelection(ctx.bundle, pick, artist, title)})`);
  }
  console.log('');
}

console.log('═'.repeat(72));
console.log(failed === 0 ? 'PASS — all tracks clean' : `FAIL — ${failed} issue(s)`);
process.exit(failed === 0 ? 0 : 1);
