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

const artist = 'Palm';
const title = 'Parietal Dispassion';

const { fetchWebSearchFactSnippets } = await import('../dist/services/web-search-facts.js');
const { factAppliesToRequest, factNamesForeignEntity } = await import('../dist/services/fact-relevance.js');
const { filterAndRankFacts } = await import('../dist/services/reference-fact-quality.js');

const web = await fetchWebSearchFactSnippets(artist, title);
console.log('Web snippets:', web.length);
for (const f of web.slice(0, 8)) {
  console.log('\n---');
  console.log(f.slice(0, 220));
  console.log('strict track', factAppliesToRequest(f, artist, title, 'track', 'strict'));
  console.log('indie track', factAppliesToRequest(f, artist, title, 'track', 'indie'));
  console.log('indie artist', factAppliesToRequest(f, artist, title, 'artist', 'indie'));
  console.log('foreign indie', factNamesForeignEntity(f, artist, title, '', 'indie'));
}

const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
const ctx = await fetchAggregatedFactContext(artist, title, 'US');
console.log('\nBundle track', ctx.bundle.trackFacts.length, 'artist', ctx.bundle.artistFacts.length);
console.log('Raw snippets', ctx.rawSnippets.length);
