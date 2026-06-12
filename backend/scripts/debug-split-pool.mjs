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
const duration = 'На издании альбома «MMXX» трек «Hypa Hypa» идёт 3:33.';
const hypa =
  '"Hypa Hypa" is the first new song from that upcoming untiled EP and its also the first new music with Nico since former singer Sebastian "Sushi" Biesler left the band on February 12, 2020 to begin working on his new musical project, Ghostkid.';

const { factAppliesToRequest, factMentionsTitle, factMentionsArtist } = await import(
  '../dist/services/fact-relevance.js'
);
const { splitBundleByScope } = await import('../dist/services/fact-ranking.js');
const { pickReferenceFact } = await import('../dist/services/fact-picker.js');
const { adjustedInterestScore } = await import('../dist/services/reference-fact-quality.js');

for (const f of [duration, hypa]) {
  console.log('---', f.slice(0, 60));
  console.log('title', factMentionsTitle(f, title));
  console.log('artist', factMentionsArtist(f, artist));
  console.log('track strict', factAppliesToRequest(f, artist, title, 'track', 'strict'));
  console.log('track indie', factAppliesToRequest(f, artist, title, 'track', 'indie'));
  console.log('score', adjustedInterestScore(f));
}

const bundle = {
  trackFacts: [duration, hypa],
  artistFacts: [
    'Electric Callboy is a German electronicore band formed in Castrop-Rauxel in 2010.',
  ],
};
const pools = splitBundleByScope(bundle, artist, title);
console.log('pools', pools);
console.log('pick', pickReferenceFact(bundle, [], 0, artist, title)?.fact?.slice(0, 80));
