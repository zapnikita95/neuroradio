#!/usr/bin/env node
/**
 * Полный прогон: источники + ранжирование + rules + LLM (free Nemotron).
 * node scripts/test-full-fact-pipeline.mjs
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

const BUDGET_MS = 30_000;
const FREE_FACT_MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free';

const TRACKS = [
  { artist: 'Redbone', title: 'Come and Get Your Love', country: 'US', year: 1974 },
  { artist: 'Queen', title: 'Bohemian Rhapsody', country: 'US', year: 1975 },
  { artist: 'Кино', title: 'Группа крови', country: 'RU', year: 1988 },
];

const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
const { pickReferenceFact, explainReferenceFactSelection } = await import('../dist/services/fact-picker.js');
const { splitBundleByScope, rankScopedFacts } = await import('../dist/services/fact-ranking.js');
const { huntReferenceFactWithLlm, shouldRunLlmFactHunt } = await import('../dist/services/story-llm-fact-hunt.js');
const { resolveOpenRouterModelForTier } = await import('../dist/services/tier-policy.js');
const { hasLlmKeyForProvider } = await import('../dist/services/llm-provider.js');

const hasOr = hasLlmKeyForProvider('openrouter');
console.log(`Free tier fact model: ${resolveOpenRouterModelForTier('free', undefined, 'fact')}`);
console.log(`OpenRouter key: ${hasOr ? 'да' : 'НЕТ — LLM пропустится'}\n`);

const results = [];

for (const { artist, title, country, year } of TRACKS) {
  console.log('\n' + '═'.repeat(70));
  console.log(`🎵 ${artist} — ${title}`);
  const t0 = Date.now();

  const ctx = await fetchAggregatedFactContext(artist, title, country);
  const tFetch = Date.now() - t0;

  const pools = splitBundleByScope(ctx.bundle, artist, title);
  const ranked = rankScopedFacts(pools).filter((r) => !r.junk);

  console.log(`\n⏱ Сбор источников: ${(tFetch / 1000).toFixed(1)} с | track=${pools.track.length} album=${pools.album.length} artist=${pools.artist.length} raw=${ctx.rawSnippets.length}`);

  console.log('\n📊 РАНЖИРОВАНИЕ (трек → альбом → артист, без мусора):');
  ranked.slice(0, 8).forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.scope}] score=${r.interest} impact=${r.impact}`);
    console.log(`     ${r.fact.slice(0, 220)}${r.fact.length > 220 ? '…' : ''}`);
  });
  if (ranked.length === 0) console.log('  (пусто — только мусор или нет данных)');

  const rulePick = pickReferenceFact(ctx.bundle, [], 0, artist, title);
  console.log('\n🔧 СЕМЯ (правила):');
  if (rulePick) {
    console.log(`  scope=${rulePick.scopeLabelRu}`);
    console.log(`  ${rulePick.fact}`);
    console.log(`  (${explainReferenceFactSelection(ctx.bundle, rulePick, artist, title)})`);
  } else {
    console.log('  (нет)');
  }

  let finalSeed = rulePick;
  let seedSource = 'rules';
  const needLlm = shouldRunLlmFactHunt(rulePick, ctx.rawSnippets.length, pools.track.length + pools.album.length + pools.artist.length);

  let tLlm = 0;
  if (hasOr && ctx.rawSnippets.length >= 2) {
    console.log(`\n🤖 LLM fact-hunt (${FREE_FACT_MODEL})${needLlm ? ' — слабый pick' : ' — принудительно для теста'}…`);
    const tLlm0 = Date.now();
    const llmPick = await huntReferenceFactWithLlm({
      artist,
      title,
      year,
      rawSnippets: ctx.rawSnippets,
      preferredProvider: 'openrouter',
      openRouterModel: FREE_FACT_MODEL,
    });
    tLlm = Date.now() - tLlm0;
      if (llmPick) {
        console.log(`  scope=${llmPick.scopeLabelRu} (${(tLlm / 1000).toFixed(1)} с)`);
        console.log(`  ${llmPick.fact}`);
        if (needLlm) {
          finalSeed = llmPick;
          seedSource = 'llm (production: слабый pick заменён)';
        } else {
          console.log('  (rules достаточно сильный — в production LLM не вызывался бы)');
        }
      } else {
      console.log(`  LLM не дал валидное семя (${(tLlm / 1000).toFixed(1)} с)`);
    }
  }

  const totalMs = Date.now() - t0;
  console.log('\n✅ ИТОГОВОЕ СЕМЯ ДЛЯ ИСТОРИИ:');
  console.log(`  источник: ${seedSource}`);
  console.log(`  scope: ${finalSeed?.scopeLabelRu ?? '—'}`);
  console.log(`  ${finalSeed?.fact ?? 'НЕТ СЕМЕНИ'}`);
  console.log(`\n⏱ Всего: ${(totalMs / 1000).toFixed(1)} с (fetch ${(tFetch / 1000).toFixed(1)} + llm ${(tLlm / 1000).toFixed(1)}) ${totalMs <= BUDGET_MS ? '✓ ≤30с' : '✗ >30с'}`);

  results.push({ artist, title, totalMs, finalSeed, seedSource, pools });
}

console.log('\n' + '═'.repeat(70));
console.log('СВОДКА СЕМЯ:');
for (const r of results) {
  console.log(`\n▸ ${r.artist} — ${r.title} (${(r.totalMs / 1000).toFixed(1)}с, ${r.seedSource})`);
  console.log(`  ${r.finalSeed?.fact?.slice(0, 280) ?? 'НЕТ'}…`);
}
