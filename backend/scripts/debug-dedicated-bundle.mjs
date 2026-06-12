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

const { fetchLastfmFacts } = await import('../dist/services/fact-sources/lastfm-facts.js');
const { fetchDiscogsLiveFacts } = await import('../dist/services/fact-sources/discogs-facts.js');
const { dedicatedHarvestToBundle } = await import('../dist/services/fact-sources/dedicated-fetch.js');
const { interestScore } = await import('../dist/services/reference-fact-quality.js');
const { factMentionsTitle } = await import('../dist/services/fact-relevance.js');
const { poolHasTopicDuplicate } = await import('../dist/services/fact-topic.js');

const harvest = [
  ...(await fetchLastfmFacts({ artist, title })),
  ...(await fetchDiscogsLiveFacts({ artist, title })),
];
console.log('harvest', harvest.length);
const sorted = [...harvest].sort((a, b) => interestScore(b.fact) - interestScore(a.fact));
const accepted = [];
for (const f of sorted) {
  const dup = poolHasTopicDuplicate(f.fact, accepted);
  console.log(
    interestScore(f.fact),
    f.scope,
    factMentionsTitle(f.fact, title) ? 'title' : '-',
    dup ? 'DUP' : 'ok',
    f.fact.slice(0, 95),
  );
  if (!dup) accepted.push(f.fact);
}

const bundle = dedicatedHarvestToBundle(harvest, artist, title);
console.log('\nBUNDLE track', bundle.trackFacts.length, 'artist', bundle.artistFacts.length);
for (const f of bundle.trackFacts) console.log('T', f);
for (const f of bundle.artistFacts) console.log('A', f);
