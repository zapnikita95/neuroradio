#!/usr/bin/env node
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

const artist = process.argv[2] ?? 'The Subways';
const title = process.argv[3] ?? 'Rock & Roll Queen';

const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
const { splitBundleByScope, rankScopedFacts } = await import('../dist/services/fact-ranking.js');
const { pickReferenceFact } = await import('../dist/services/fact-picker.js');
const { factAppliesToRequest } = await import('../dist/services/fact-relevance.js');

const ctx = await fetchAggregatedFactContext(artist, title, 'GB');
console.log('Bundle track:', ctx.bundle.trackFacts.length, 'artist:', ctx.bundle.artistFacts.length);
for (const f of [...ctx.bundle.trackFacts, ...ctx.bundle.artistFacts]) {
  console.log('\n---');
  console.log(f.slice(0, 200));
  console.log('track', factAppliesToRequest(f, artist, title, 'track', 'indie'));
  console.log('artist', factAppliesToRequest(f, artist, title, 'artist', 'indie'));
}

const pools = splitBundleByScope(ctx.bundle, artist, title);
const ranked = rankScopedFacts(pools);
console.log('\nRanked non-junk:', ranked.filter((r) => !r.junk).length);
ranked.slice(0, 6).forEach((r) => console.log(`[${r.scope}] junk=${r.junk} interest=${r.interest} ${r.fact.slice(0, 100)}`));

const pick = pickReferenceFact(ctx.bundle, [], 0, artist, title);
console.log('\nPick:', pick?.fact?.slice(0, 120), pick?.interestRating);
