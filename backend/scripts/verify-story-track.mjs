#!/usr/bin/env node
/**
 * Canonical verify for one track: local seed gates + prod POST /v1/story/full.
 *
 *   cd backend
 *   npm run verify:track -- "Rob Thomas" "Lonely No More"
 *   npm run verify:track -- "Maroon 5" "One More Night" --bad-seed "originated in Los Angeles"
 *   npm run verify:track -- "Rob Thomas" "Lonely No More" --local-only
 *   npm run verify:track -- "Rob Thomas" "Lonely No More" --prod-only
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BFF_URL,
  fetchProdHealth,
  fetchProdToken,
  postProdStoryFull,
} from './lib/prod-auth.mjs';

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

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const localOnly = flags.has('--local-only');
const prodOnly = flags.has('--prod-only');

function flagValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const artist =
  flagValue('--artist') ?? process.env.VERIFY_ARTIST ?? positional[0];
const title = flagValue('--title') ?? process.env.VERIFY_TITLE ?? positional[1];
const badSeedPattern = flagValue('--bad-seed');
const badScriptPattern = flagValue('--bad-script');

if (!artist || !title) {
  console.error(`Usage:
  node scripts/verify-story-track.mjs --artist "Rob Thomas" --title "Lonely No More"
  node scripts/verify-story-track.mjs "Rob Thomas" "Lonely No More"
  VERIFY_ARTIST="..." VERIFY_TITLE="..." node scripts/verify-story-track.mjs

Flags: --local-only | --prod-only | --bad-seed REGEX | --bad-script REGEX`);
  process.exit(2);
}

const DEFAULT_BAD_SEED = [
  /the band recorded a song not written/i,
  /Gala Records|выходил на лейбле/i,
  /Makuhari|via YouTube/i,
  /Last\.fm указан в альбоме/i,
  /Discogs датирован \d{4}/i,
];
const DEFAULT_BAD_SCRIPT = [
  /истори\w*\s+групп/i,
  /стала\s+хитом/i,
  /мурашк/i,
  /лёгкий\s+поп-?звук\s+с\s+неожиданно\s+глубокой/i,
  /визитной\s+карточкой/i,
  /два\s+мира\s+столкнулись/i,
  /\bDani\b.*(?:смерт|laments|южн)/i,
];

const badSeedRes = badSeedPattern ? [new RegExp(badSeedPattern, 'i')] : DEFAULT_BAD_SEED;
const badScriptRes = badScriptPattern ? [new RegExp(badScriptPattern, 'i')] : DEFAULT_BAD_SCRIPT;

let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}
function ok(msg) {
  console.log(`ok: ${msg}`);
}

console.log(`\n=== VERIFY: ${artist} — ${title} ===\n`);

// --- 1. Local seed ---
if (!prodOnly) {
  console.log('--- LOCAL SEED ---');
  const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
  const { pickReferenceFact, isRejectedStorySeed } = await import('../dist/services/fact-picker.js');
  const { isWeakSelectedFact, pickSalvageSnippetSeed } = await import(
    '../dist/services/search-snippet-salvage.js'
  );
  const { validateStoryScript } = await import('../dist/services/story-quality.js');

  const ctx = await fetchAggregatedFactContext(artist, title, 'US');
  const pick = pickReferenceFact(ctx.bundle, [], 0, artist, title);
  const salvage = pickSalvageSnippetSeed(ctx.rawSnippets, artist, title, 'ru');
  const chosen = pick ?? salvage;

  console.log('rules pick:', pick?.fact?.slice(0, 180) ?? '(none)');
  console.log('salvage:', salvage?.fact?.slice(0, 180) ?? '(none)');

  if (!chosen) {
    fail('no local seed (rules + salvage both null)');
  } else {
    ok(`local seed chosen (scope=${chosen.scope ?? '?'})`);
    if (isRejectedStorySeed(chosen.fact, artist, title, ctx.bundle.trackFacts)) {
      fail('chosen seed fails isRejectedStorySeed');
    } else {
      ok('passes isRejectedStorySeed');
    }
    if (isWeakSelectedFact(chosen, artist, title)) {
      fail('chosen seed isWeakSelectedFact');
    } else {
      ok('not weak seed');
    }
    for (const p of badSeedRes) {
      if (p.test(chosen.fact)) fail(`bad seed pattern: ${p}`);
    }
    const dryScript =
      chosen.fact.length > 40
        ? `${title} — ${artist}. ${chosen.fact.slice(0, 120)}.`
        : '';
    if (dryScript) {
      const q = validateStoryScript(dryScript, '30s', artist, title, {
        referenceFacts: [chosen.fact],
        strictLength: false,
      });
      if (!q.ok) ok(`dry quality hint: ${q.reason}`);
    }
  }
  console.log('');
}

// --- 2. Prod full pipeline ---
if (!localOnly) {
  console.log('--- PROD FULL (POST /v1/story/full) ---');
  console.log('url:', BFF_URL);
  try {
    const health = await fetchProdHealth();
    console.log('build:', health.build, 'llm:', health.llmProvider);
  } catch (e) {
    fail(`health: ${e.message}`);
  }

  try {
    const token = await fetchProdToken();
    const openRouterApiKey =
      process.env.OPENROUTER_API_KEY?.trim() ||
      process.env.OPEN_ROUTER_API_KEY?.trim() ||
      process.env.OPENROUTER_KEY?.trim();
    const result = await postProdStoryFull(token, {
      artist,
      title,
      openRouterApiKey,
    });
    const sec = (result.elapsedMs / 1000).toFixed(1);

    if (!result.ok) {
      fail(`prod ${result.status} (${sec}s): ${result.error}`);
    } else {
      console.log(`HTTP ${result.status} (${sec}s) scope=${result.scope} interest=${result.interest}/10 words=${result.words}`);
      console.log('SEED:', result.seed.slice(0, 240) + (result.seed.length > 240 ? '…' : ''));
      console.log('SCRIPT:', result.script.slice(0, 320) + (result.script.length > 320 ? '…' : ''));

      if (!result.seed || result.seed.length < 20) fail('prod empty/short seed');
      else ok('prod seed present');

      if (!result.script || result.script.length < 40) fail('prod empty/short script');
      else ok('prod script present');

      for (const p of badSeedRes) {
        if (p.test(result.seed)) fail(`prod bad seed: ${p}`);
      }
      for (const p of badScriptRes) {
        if (p.test(result.script) && !p.test(result.seed)) fail(`prod bad script (ungrounded): ${p}`);
      }

      const { validateStoryScript } = await import('../dist/services/story-quality.js');
      const q = validateStoryScript(result.script, '30s', artist, title, {
        referenceFacts: result.seed ? [result.seed] : [],
        strictLength: false,
      });
      if (!q.ok) {
        fail(`prod quality gate: ${q.reason}`);
      } else {
        ok('prod validateStoryScript pass');
      }
    }
  } catch (e) {
    fail(`prod request: ${e.message}`);
  }
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} issue(s)\n`);
process.exit(failed === 0 ? 0 : 1);
