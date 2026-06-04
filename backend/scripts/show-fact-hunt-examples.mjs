#!/usr/bin/env node
/**
 * Production fact pipeline demo — real Wikipedia/DDG snippets only.
 * Run: npm run build && node scripts/show-fact-hunt-examples.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repoRoot = resolve(root, '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (v && !process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(resolve(repoRoot, '.env'));
loadEnvFile(resolve(root, '.env'));

const ARTIST = 'Redbone';
const TITLE = 'Come and Get Your Love';

const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
const { pickReferenceFact, explainReferenceFactSelection } = await import('../dist/services/fact-picker.js');
const { interestScore } = await import('../dist/services/reference-fact-quality.js');
const { highImpactBonus, WEAK_TRIVIA_PATTERNS } = await import('../dist/services/story-fact-hunt.js');
const { shouldRunLlmFactHunt, huntReferenceFactWithLlm } = await import('../dist/services/story-llm-fact-hunt.js');

console.log(`=== ${ARTIST} — ${TITLE} (живые источники) ===\n`);

const ctx = await fetchAggregatedFactContext(ARTIST, TITLE, 'US');
console.log('RAW SNIPPETS (wiki/ddg, без чарт-мусора в raw):');
ctx.rawSnippets.forEach((s, i) => console.log(`${i}. ${s.slice(0, 220)}${s.length > 220 ? '…' : ''}`));

console.log('\nTOP TRACK FACTS:');
ctx.bundle.trackFacts.slice(0, 5).forEach((f, i) => {
  console.log(`${i}. score=${interestScore(f)} impact=${highImpactBonus(f)} weak=${WEAK_TRIVIA_PATTERNS.some((p) => p.test(f))}`);
  console.log(`   ${f.slice(0, 200)}${f.length > 200 ? '…' : ''}`);
});

console.log('\nTOP ARTIST FACTS:');
ctx.bundle.artistFacts.slice(0, 5).forEach((f, i) => {
  console.log(`${i}. score=${interestScore(f)} impact=${highImpactBonus(f)}`);
  console.log(`   ${f.slice(0, 200)}${f.length > 200 ? '…' : ''}`);
});

let picked = pickReferenceFact(ctx.bundle, [], 0, ARTIST, TITLE);
console.log('\nPICKED (rule-based):');
console.log(picked?.fact ?? '(none)');
console.log(explainReferenceFactSelection(ctx.bundle, picked));

if (shouldRunLlmFactHunt(picked, ctx.rawSnippets.length, ctx.bundle.trackFacts.length + ctx.bundle.artistFacts.length)) {
  console.log('\nLLM fact-hunt (слабый pick → DeepSeek из сниппетов)...');
  const hunted = await huntReferenceFactWithLlm({
    artist: ARTIST,
    title: TITLE,
    year: 1974,
    rawSnippets: ctx.rawSnippets,
    preferredProvider: 'openrouter',
  });
  if (hunted) {
    picked = hunted;
    console.log('LLM SEED:', hunted.fact);
  }
}

console.log('\n=== FINAL SEED FOR STORY ===');
console.log(picked?.fact ?? 'NO SEED');
