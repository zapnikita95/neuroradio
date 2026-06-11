#!/usr/bin/env node
/**
 * Audit bulk seed: zero-fact tracks, hot quality, sample live re-harvest.
 * npm run build && node scripts/audit-bulk-coverage.mjs [--probe=5]
 */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const probeN = parseInt(process.argv.find((a) => a.startsWith('--probe='))?.split('=')[1] ?? '3', 10);

const bank = JSON.parse(readFileSync(join(__dir, '../data/facts-bank.json'), 'utf8'));
const prog = JSON.parse(readFileSync(join(__dir, '../data/bulk-seed-progress.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(__dir, '../src/data/popular-tracks-catalog.json'), 'utf8'));

function trackKey(artist, title) {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

const done = new Set(prog.doneKeys ?? []);
const zeroListed = new Set(prog.zeroFactKeys ?? []);
const tracksWithFacts = new Set(Object.keys(bank.byTrack ?? {}));
const artistWithFacts = new Set(Object.keys(bank.byArtist ?? {}));

const doneNoFacts = [...done].filter((k) => !tracksWithFacts.has(k));
const doneNoTrackButMaybeArtist = [...done].filter((k) => {
  const artist = k.split('|')[0]?.trim();
  return !tracksWithFacts.has(k) && artistWithFacts.has(artist);
});

const hot = [];
for (const pool of [...Object.values(bank.byTrack ?? {}), ...Object.values(bank.byArtist ?? {})]) {
  for (const f of pool) if (f.isHot) hot.push(f);
}

console.log('=== Bulk coverage audit ===\n');
console.log(`Done tracks: ${done.size}`);
console.log(`Zero-fact keys (logged): ${zeroListed.size}`);
console.log(`Done with NO track pool: ${doneNoFacts.length} (${((doneNoFacts.length / done.size) * 100).toFixed(1)}%)`);
console.log(`...but artist pool exists: ${doneNoTrackButMaybeArtist.length}`);
console.log(`Bank: ${Object.keys(bank.byTrack).length} track keys, ${Object.keys(bank.byArtist).length} artist keys`);
console.log(`Hot facts: ${hot.length}\n`);

console.log('Hot by source:');
const bySrc = {};
for (const f of hot) bySrc[f.harvestSource ?? '?'] = (bySrc[f.harvestSource ?? '?'] ?? 0) + 1;
console.log(bySrc);

console.log('\nSuspicious hot (karaoke/style):');
hot
  .filter((f) => /\b(?:in the style of|karaoke)\b/i.test(f.fact))
  .slice(0, 5)
  .forEach((f) => console.log(`  [${f.interestRating}] ${f.fact.slice(0, 100)}`));

console.log('\nGood hot sample:');
hot
  .filter((f) => !/\b(?:in the style of|karaoke|слушател)\b/i.test(f.fact))
  .sort((a, b) => b.interestRating - a.interestRating)
  .slice(0, 5)
  .forEach((f) => console.log(`  [${f.interestRating}/${f.topicKey}] ${f.fact.slice(0, 110)}`));

const catalogMap = new Map((catalog.tracks ?? []).map((t) => [trackKey(t.artist, t.title), t]));
const probeKeys = doneNoFacts.slice(0, probeN);

if (probeKeys.length > 0) {
  const { harvestAllFacts } = await import('../dist/services/fact-sources/index.js');
  console.log(`\n=== Live re-probe (${probeKeys.length} zero-fact tracks) ===`);
  for (const key of probeKeys) {
    const t = catalogMap.get(key);
    if (!t) {
      console.log(`\n${key}: not in catalog`);
      continue;
    }
    const cc = /[\u0400-\u04FF]/.test(t.artist + t.title) ? 'RU' : undefined;
    const facts = await harvestAllFacts({ artist: t.artist, title: t.title, countryCode: cc });
    console.log(`\n${t.artist} — ${t.title}`);
    console.log(`  harvested now: ${facts.length}`);
    facts.slice(0, 3).forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.scope}/${f.source}] ${f.fact.slice(0, 100)}`);
    });
  }
}

console.log('\nRun retry: npm run build && node scripts/bulk-seed-fact-bank.mjs --resume --retry-zero --concurrency=2');
