#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
loadEnv(resolve(root, '.env'));

const artist = 'Eskimo Callboy';
const title = 'Hypa Hypa';

const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
const { fetchLastfmFacts } = await import('../dist/services/fact-sources/lastfm-facts.js');
const { fetchDiscogsLiveFacts } = await import('../dist/services/fact-sources/discogs-facts.js');
const { pickReferenceFact } = await import('../dist/services/fact-picker.js');

const ctx = await fetchAggregatedFactContext(artist, title, 'DE');
console.log('=== BUNDLE ===');
for (const f of ctx.bundle.trackFacts) console.log('[track]', f);
for (const f of ctx.bundle.artistFacts) console.log('[artist]', f);

const pick = pickReferenceFact(ctx.bundle, [], 0, artist, title);
console.log('\n=== PICKED SEED ===');
console.log(pick?.fact ?? '(none)');
console.log('scope:', pick?.scope, 'score:', pick?.interestScore);

console.log('\n=== LAST.FM RAW ===');
for (const f of await fetchLastfmFacts({ artist, title })) console.log(`[${f.scope}]`, f.fact);

console.log('\n=== DISCOGS RAW ===');
for (const f of await fetchDiscogsLiveFacts({ artist, title })) console.log(`[${f.scope}]`, f.fact);
