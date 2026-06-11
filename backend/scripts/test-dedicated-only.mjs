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

const { fetchDedicatedSourceFacts, dedicatedFactsBySource } = await import(
  '../dist/services/fact-sources/dedicated-fetch.js'
);

const tracks = [
  ['Queen', 'Bohemian Rhapsody'],
  ['Eminem', 'Lose Yourself'],
  ['Redbone', 'Come and Get Your Love'],
  ['Nirvana', 'Smells Like Teen Spirit'],
  ['Кино', 'Группа крови'],
];

for (const [artist, title] of tracks) {
  const t0 = Date.now();
  const facts = await fetchDedicatedSourceFacts({ artist, title });
  console.log(
    `${artist} — ${title}: ${facts.length} facts in ${Date.now() - t0}ms`,
    JSON.stringify(dedicatedFactsBySource(facts)),
  );
  for (const f of facts.slice(0, 2)) {
    console.log(`  [${f.source}/${f.scope}] ${f.fact.slice(0, 110)}…`);
  }
}
