#!/usr/bin/env node
/**
 * Инди/малоизвестные группы — тот же пайплайн фактов + interest.
 * node scripts/test-indie-facts.mjs
 */
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

/** Не топ-чарт: post-punk, shoegaze, regional indie */
const INDIE_TRACKS = [
  { artist: 'Molchat Doma', title: 'Sudno', country: 'BY', year: 2018 },
  { artist: 'The Subways', title: 'Rock & Roll Queen', country: 'GB', year: 2005 },
  { artist: 'Godspeed You! Black Emperor', title: 'Storm', country: 'CA', year: 2000 },
  { artist: 'Shortparis', title: 'Страшно', country: 'RU', year: 2017 },
  { artist: 'Palm', title: 'Parietal Dispassion', country: 'US', year: 2019 },
];

const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
const { pickReferenceFact, explainReferenceFactSelection } = await import('../dist/services/fact-picker.js');
const { splitBundleByScope, rankScopedFacts } = await import('../dist/services/fact-ranking.js');
const { huntReferenceFactWithLlm, shouldRunLlmFactHunt } = await import('../dist/services/story-llm-fact-hunt.js');
const { resolveOpenRouterFactModelsForTier } = await import('../dist/services/tier-policy.js');
const { hasLlmKeyForProvider } = await import('../dist/services/llm-provider.js');
const { ingestFacts, listBankFacts } = await import('../dist/services/fact-bank.js');
const { formatFactPickLog } = await import('../dist/services/fact-interest-log.js');

const hasOr = hasLlmKeyForProvider('openrouter');
console.log(`Free fact models: ${resolveOpenRouterFactModelsForTier('free').join(' → ')}`);
console.log(`OpenRouter: ${hasOr ? 'да' : 'нет'}\n`);

const summary = [];

for (const { artist, title, country, year } of INDIE_TRACKS) {
  console.log('\n' + '═'.repeat(72));
  console.log(`🎵 ${artist} — ${title} (${year})`);
  const t0 = Date.now();

  const ctx = await fetchAggregatedFactContext(artist, title, country);
  const tFetch = Date.now() - t0;

  const pools = splitBundleByScope(ctx.bundle, artist, title);
  const ranked = rankScopedFacts(pools).filter((r) => !r.junk);

  console.log(
    `\n⏱ ${(tFetch / 1000).toFixed(1)}s | track=${pools.track.length} album=${pools.album.length} artist=${pools.artist.length} raw=${ctx.rawSnippets.length}`,
  );

  console.log('\n📊 TOP ranked (interest):');
  ranked.slice(0, 6).forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.scope}] interest=${r.interest}/10 impact=${r.impact}`);
    console.log(`     ${r.fact.slice(0, 200)}${r.fact.length > 200 ? '…' : ''}`);
  });
  if (ranked.length === 0) console.log('  (пусто)');

  ingestFacts(
    artist,
    title,
    ranked.slice(0, 10).map((r) => ({ fact: r.fact, scope: r.scope, source: 'wiki' })),
  );
  const bank = listBankFacts(artist, title);
  console.log(`\n🏦 bank: track=${bank.track.length} artist=${bank.artist.length}`);

  let pick = pickReferenceFact(ctx.bundle, [], 0, artist, title);
  console.log('\n🔧 RULES seed:');
  if (pick) {
    console.log(formatFactPickLog(pick, 'rules'));
    console.log(`  why: ${explainReferenceFactSelection(ctx.bundle, pick, artist, title)}`);
  } else {
    console.log('  (нет)');
  }

  if (shouldRunLlmFactHunt(pick, ctx.rawSnippets.length, pools.track.length + pools.artist.length) && hasOr) {
    const models = resolveOpenRouterFactModelsForTier('free');
    console.log(`\n🤖 LLM hunt (${models[0]})…`);
    const hunted = await huntReferenceFactWithLlm({
      artist,
      title,
      year,
      genre: '',
      rawSnippets: ctx.rawSnippets,
      preferredProvider: 'openrouter',
      openRouterModel: models[0],
      openRouterModels: models,
    });
    if (hunted) {
      pick = hunted;
      console.log(formatFactPickLog(hunted, 'llm'));
    } else {
      console.log('  LLM: ничего пригодного');
    }
  }

  const totalMs = Date.now() - t0;
  summary.push({
    artist,
    title,
    ms: totalMs,
    ranked: ranked.length,
    seed: pick?.fact?.slice(0, 120) ?? null,
    interest: pick?.interestRating ?? 0,
    scope: pick?.scope ?? null,
  });
  console.log(`\n✅ итого ${(totalMs / 1000).toFixed(1)}s | seed interest=${pick?.interestRating ?? 0}/10`);
}

console.log('\n\n' + '═'.repeat(72));
console.log('SUMMARY indie tracks');
console.table(summary);
