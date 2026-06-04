#!/usr/bin/env node
/**
 * 3 трека: время сбора фактов + что выбрано + откуда.
 * node scripts/test-three-tracks-facts.mjs
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

const TRACKS = [
  { artist: 'Redbone', title: 'Come and Get Your Love', note: 'индейский рок, US' },
  { artist: 'Queen', title: 'Bohemian Rhapsody', note: 'классика' },
  { artist: 'Кино', title: 'Группа крови', note: 'RU артист' },
];

const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
const { pickReferenceFact } = await import('../dist/services/fact-picker.js');
const { resolveOpenRouterModelForTier } = await import('../dist/services/tier-policy.js');
const { interestScore } = await import('../dist/services/reference-fact-quality.js');
const { highImpactBonus } = await import('../dist/services/story-fact-hunt.js');

console.log('Бесплатный тариф (free) — модели OpenRouter на сервере:');
console.log('  факты:', resolveOpenRouterModelForTier('free', undefined, 'fact'));
console.log('  история:', resolveOpenRouterModelForTier('free', undefined, 'story'));
console.log('(DeepSeek только на trial/premium)\n');

const BUDGET_MS = 30_000;
const results = [];

for (const { artist, title, note } of TRACKS) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${artist} — ${title} (${note})`);
  const t0 = Date.now();
  const ctx = await fetchAggregatedFactContext(artist, title, artist === 'Кино' ? 'RU' : 'US');
  const ms = Date.now() - t0;
  const picked = pickReferenceFact(ctx.bundle, [], 0, artist, title);

  const topArtist = ctx.bundle.artistFacts
    .map((f) => ({ f, score: interestScore(f), impact: highImpactBonus(f) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const topTrack = ctx.bundle.trackFacts
    .map((f) => ({ f, score: interestScore(f), impact: highImpactBonus(f) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const webInRaw = ctx.snippetSources.filter((s) => s === 'web').length;

  results.push({ artist, title, ms, picked, topArtist, topTrack, webInRaw, ok: ms <= BUDGET_MS });

  console.log(`Время сбора фактов: ${(ms / 1000).toFixed(1)} с ${ms <= BUDGET_MS ? '✓ уложились в 30с' : '✗ ДОЛГО'}`);
  console.log(`Web-сниппетов в топ-12: ${webInRaw}`);
  console.log('\nВЫБРАНО ДЛЯ ИСТОРИИ (семя):');
  console.log(picked?.fact ?? '(нет)');
  console.log('\nЛучшие про трек:');
  topTrack.forEach((x, i) => console.log(`  ${i + 1}. [${x.score}/${x.impact}] ${x.f.slice(0, 200)}`));
  console.log('Лучшие про артиста:');
  topArtist.forEach((x, i) => console.log(`  ${i + 1}. [${x.score}/${x.impact}] ${x.f.slice(0, 200)}`));
}

console.log(`\n${'='.repeat(60)}`);
console.log('ИТОГО:');
for (const r of results) {
  console.log(`  ${r.artist} — ${r.title}: ${(r.ms / 1000).toFixed(1)}с | seed OK: ${Boolean(r.picked)}`);
}
const max = Math.max(...results.map((r) => r.ms));
console.log(`Макс время: ${(max / 1000).toFixed(1)}с (лимит ${BUDGET_MS / 1000}с на факты без LLM)`);
