#!/usr/bin/env node
/**
 * Systemic regression: ~10 similar tracks per bug class (Maroon / mgk / Pompeya).
 * Local seed pick only — no prod quota hammering.
 *
 *   npm run test:similar-tracks
 *   npm run test:similar-tracks -- --limit 5
 */
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

// Live BFF must never inherit bulk harvest throttling from .env
delete process.env.HARVEST_RATE_LIMIT;
delete process.env.BULK_HARVEST;

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const fileArg = process.argv.find((a) => a.startsWith('--file='));
const batchFile = fileArg
  ? fileArg.split('=')[1]
  : resolve(dirname(fileURLToPath(import.meta.url)), 'similar-tracks-regression.txt');

const { isHarvestRateLimitEnabled } = await import('../dist/services/harvest-rate-limiter.js');
if (isHarvestRateLimitEnabled()) {
  console.error('FAIL: harvest rate limiter enabled — live story path must not throttle');
  process.exit(2);
}

const lines = readFileSync(batchFile, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

const entries = [];
for (const line of lines) {
  const parts = line.split('|').map((s) => s.trim());
  if (parts.length < 2) continue;
  const [artist, title, badRaw] = parts;
  const badPatterns = badRaw
    ? badRaw.split(';').filter(Boolean).map((p) => new RegExp(p, 'i'))
    : [/originated in|formed in/i];
  entries.push({ artist, title, badPatterns });
}

const slice = Number.isFinite(limit) ? entries.slice(0, limit) : entries;

const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
const { pickReferenceFact, isRejectedStorySeed } = await import('../dist/services/fact-picker.js');
const { pickSalvageSnippetSeed, isWeakSelectedFact } = await import(
  '../dist/services/search-snippet-salvage.js'
);

let failed = 0;
const failures = [];

for (let i = 0; i < slice.length; i++) {
  const { artist, title, badPatterns } = slice[i];
  console.log(`\n[${i + 1}/${slice.length}] ${artist} — ${title}`);
  try {
    const ctx = await fetchAggregatedFactContext(artist, title, 'US');
    const pick = pickReferenceFact(ctx.bundle, [], 0, artist, title);
    const salvage = pickSalvageSnippetSeed(ctx.rawSnippets, artist, title, 'ru');
    const chosen =
      pick && !isRejectedStorySeed(pick.fact, artist, title, ctx.bundle.trackFacts)
        ? pick
        : salvage;

    if (!chosen?.fact) {
      failed += 1;
      failures.push({ artist, title, reason: 'no seed (pick + salvage null)' });
      console.error('  FAIL: no seed');
      continue;
    }

    console.log(`  seed: ${chosen.fact.slice(0, 140)}${chosen.fact.length > 140 ? '…' : ''}`);

    if (isRejectedStorySeed(chosen.fact, artist, title, ctx.bundle.trackFacts)) {
      failed += 1;
      failures.push({ artist, title, reason: 'isRejectedStorySeed', seed: chosen.fact.slice(0, 120) });
      console.error('  FAIL: isRejectedStorySeed');
      continue;
    }
    if (isWeakSelectedFact(chosen, artist, title)) {
      failed += 1;
      failures.push({ artist, title, reason: 'weak seed', seed: chosen.fact.slice(0, 120) });
      console.error('  FAIL: weak seed');
      continue;
    }

    for (const p of badPatterns) {
      if (p.test(chosen.fact)) {
        failed += 1;
        failures.push({ artist, title, reason: `bad pattern ${p}`, seed: chosen.fact.slice(0, 120) });
        console.error(`  FAIL: bad seed matches ${p}`);
        break;
      }
    }
    if (failures.some((f) => f.artist === artist && f.title === title)) continue;
    console.log('  ok');
  } catch (e) {
    failed += 1;
    failures.push({ artist, title, reason: e.message });
    console.error(`  FAIL: ${e.message}`);
  }
}

console.log('\n--- summary ---');
if (failures.length) {
  for (const f of failures) {
    console.error(`FAIL ${f.artist} — ${f.title}: ${f.reason}`);
    if (f.seed) console.error(`     ${f.seed}`);
  }
}
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed}/${slice.length} failed\n`);
process.exit(failed === 0 ? 0 : 1);
