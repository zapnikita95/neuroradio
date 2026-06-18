#!/usr/bin/env node
/**
 * Simulate N consecutive fact picks per track (production pickFactForUser path).
 *   node scripts/verify-multi-pick.mjs
 *   node scripts/verify-multi-pick.mjs --rounds 5 --artist Sting --title "Shape Of My Heart"
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

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

const args = process.argv.slice(2);
const rounds = parseInt(args.find((a, i) => args[i - 1] === '--rounds') ?? '5', 10);
const singleArtist = args.find((a, i) => args[i - 1] === '--artist');
const singleTitle = args.find((a, i) => args[i - 1] === '--title');

const TRACKS = singleArtist && singleTitle
  ? [[singleArtist, singleTitle]]
  : [
      ['Sting', 'Shape Of My Heart'],
      ['Teddy Swims', 'Lose Control'],
      ['Green Day', 'Holiday'],
      ['Rob Thomas', 'Lonely No More'],
      ['Nirvana', 'Come As You Are'],
    ];

const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
const { lookupCuratedFact } = await import('../dist/services/curated-facts.js');
const { factFingerprint } = await import('../dist/services/fact-bank.js');
const { interestScore } = await import('../dist/services/reference-fact-quality.js');
const { interestRating10 } = await import('../dist/services/fact-interest-log.js');
const { resolveArtistTier } = await import('../dist/services/artist-notability.js');
const {
  buildFactPickContext,
  pickFactForUser,
  pickBankFactForUser,
  ensureAccount,
  recordUserStory,
  ingestBundleToBank,
  prefetchArtistFactsToBank,
} = await import('../dist/services/fact-user-service.js');
const { isRejectedPickSeed } = await import('../dist/services/fact-seed-pick.js');
const { isWeakSelectedFact } = await import('../dist/services/search-snippet-salvage.js');
const { listBankFacts } = await import('../dist/services/fact-bank.js');

let failed = 0;
function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  failed += 1;
}

console.log(`\n=== MULTI-PICK SIM (${rounds} rounds per track) ===\n`);

for (const [artist, title] of TRACKS) {
  const installId = crypto.randomUUID();
  ensureAccount(installId);
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${artist} — ${title}  install=${installId.slice(0, 8)}`);
  console.log('─'.repeat(70));

  const curated = lookupCuratedFact(artist, title);
  if (curated) console.log(`curated: yes (${curated.fact.slice(0, 80)}…)`);

  console.log('fetching facts…');
  const ctx = await fetchAggregatedFactContext(artist, title, 'US');
  const tier = resolveArtistTier(artist, title, { artist, title, year: -1 }, ctx.bundle);
  ingestBundleToBank(artist, title, ctx.bundle);
  prefetchArtistFactsToBank(installId, artist, title, ctx.bundle, tier);

  const { track, artist: artistPool } = listBankFacts(artist, title);
  console.log(
    `bank after ingest: track=${track.length} artist=${artistPool.length} ` +
      `(bundle track=${ctx.bundle.trackFacts.length} artist=${ctx.bundle.artistFacts.length}) tier=${tier}`,
  );

  const scopesSeen = [];
  const fpsSeen = new Set();

  for (let round = 0; round < rounds; round += 1) {
    const pickCtx = await buildFactPickContext(installId, artist, title, { storyLanguage: 'ru' });
    let picked = null;

    const curated = lookupCuratedFact(artist, title);
    if (curated) {
      const curatedFp = factFingerprint(curated.fact);
      if (!pickCtx.usedFingerprints.has(curatedFp)) {
        picked = {
          fact: curated.fact,
          scope: curated.scope,
          scopeLabelRu: curated.scope === 'track' ? 'трек' : 'группа/артист',
          interestScore: Math.max(interestScore(curated.fact), 12),
          interestRating: interestRating10(curated.fact),
        };
      }
    }

    picked ??=
      (await pickBankFactForUser(installId, artist, title, undefined, pickCtx, round)) ??
      (await pickFactForUser(installId, ctx.bundle, artist, title, round, 'night_dj', pickCtx));

    if (!picked) {
      fail(`round ${round + 1}: no seed (scopes so far: ${scopesSeen.join(' → ') || 'none'})`);
      console.log(`  recentScopes: ${pickCtx.recentScopes.join(', ') || '(empty)'}`);
      break;
    }

    if (isRejectedPickSeed(picked.fact, title, 'ru', ctx.bundle.trackFacts, artist, picked.scope)) {
      fail(`round ${round + 1}: rejected seed (${picked.scope})`);
    }
    const fromCurated = curated && picked.fact === curated.fact;
    if (!fromCurated && picked.scope === 'track' && isWeakSelectedFact(picked, artist, title)) {
      fail(`round ${round + 1}: weak seed`);
    }

    const fp = picked.fact.slice(0, 48);
    if (fpsSeen.has(fp)) {
      fail(`round ${round + 1}: duplicate fact "${fp}…"`);
    }
    fpsSeen.add(fp);

    scopesSeen.push(picked.scope);
    console.log(
      `  [${round + 1}/${rounds}] scope=${picked.scope} score=${picked.interestScore} ` +
        `rating=${picked.interestRating}/10 | ${picked.fact.slice(0, 120)}${picked.fact.length > 120 ? '…' : ''}`,
    );

    await recordUserStory(installId, {
      artist,
      title,
      script: `Mock script round ${round + 1} about ${picked.fact.slice(0, 40)}`,
      seed: picked,
      storyNarrator: 'night_dj',
    });
  }

  const uniqueScopes = [...new Set(scopesSeen)];
  if (scopesSeen.length >= 3 && !uniqueScopes.includes('artist') && artistPool.length > 0) {
    fail(`3+ picks but never artist scope (had ${artistPool.length} artist facts in bank)`);
  }
  if (scopesSeen.length >= 2 && uniqueScopes.length === 1 && uniqueScopes[0] === 'track') {
    fail(`all ${scopesSeen.length} picks were track-only — no rotation`);
  }
}

console.log(`\n${'═'.repeat(70)}`);
console.log(failed === 0 ? `PASS — ${TRACKS.length} tracks × up to ${rounds} picks` : `FAIL — ${failed} issue(s)`);
process.exit(failed === 0 ? 0 : 1);
