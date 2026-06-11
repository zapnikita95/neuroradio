#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
for (const p of [resolve(root, '..', '.env'), resolve(root, '.env')]) {
  if (!existsSync(p)) continue;
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
await import('./setup-hidemy-proxy.mjs');

const { fetchGeniusFacts } = await import('../dist/services/fact-sources/genius-facts.js');
const { fetchSetlistfmFacts } = await import('../dist/services/fact-sources/setlistfm-facts.js');
const { fetchSongfactsFacts } = await import('../dist/services/fact-sources/songfacts-facts.js');

const tracks = [
  ['Queen', 'Bohemian Rhapsody'],
  ['Eminem', 'Lose Yourself'],
  ['Nirvana', 'Smells Like Teen Spirit'],
];

for (const [artist, title] of tracks) {
  console.log(`\n=== ${artist} — ${title} ===`);
  for (const [name, fn] of [
    ['genius', fetchGeniusFacts],
    ['setlistfm', fetchSetlistfmFacts],
    ['songfacts', fetchSongfactsFacts],
  ]) {
    const t0 = Date.now();
    const facts = await fn({ artist, title });
    console.log(`  ${name}: ${facts.length} in ${Date.now() - t0}ms`);
    if (facts[0]) console.log(`    ${facts[0].fact.slice(0, 100)}…`);
  }
}
