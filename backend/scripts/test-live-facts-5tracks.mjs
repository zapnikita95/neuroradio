#!/usr/bin/env node
/**
 * Live fact search — как в story: сбор + rules seed (+ подсказка про LLM).
 * npm run build && node scripts/test-live-facts-5tracks.mjs
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

await import('./setup-hidemy-proxy.mjs');

const TRACKS = [
  { artist: 'Queen', title: 'Bohemian Rhapsody', cc: 'US' },
  { artist: 'Eminem', title: 'Lose Yourself', cc: 'US' },
  { artist: 'Кино', title: 'Группа крови', cc: 'RU' },
  { artist: 'Redbone', title: 'Come and Get Your Love', cc: 'US' },
  { artist: 'Nirvana', title: 'Smells Like Teen Spirit', cc: 'US' },
];

const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
const { pickReferenceFact, explainReferenceFactSelection } = await import('../dist/services/fact-picker.js');
const { splitBundleByScope, rankScopedFacts } = await import('../dist/services/fact-ranking.js');
const { shouldRunLlmFactHunt } = await import('../dist/services/story-llm-fact-hunt.js');

console.log('LIVE fact pipeline (как story, без банка)\n');

let ok = 0;
for (const { artist, title, cc } of TRACKS) {
  console.log('═'.repeat(68));
  console.log(`${artist} — ${title}`);
  const t0 = Date.now();
  const ctx = await fetchAggregatedFactContext(artist, title, cc);
  const ms = Date.now() - t0;

  const pools = splitBundleByScope(ctx.bundle, artist, title);
  const ranked = rankScopedFacts(pools).filter((r) => !r.junk);
  const seed = pickReferenceFact(ctx.bundle, [], 0, artist, title);
  const needLlm = shouldRunLlmFactHunt(
    seed,
    ctx.rawSnippets.length,
    pools.track.length + pools.album.length + pools.artist.length,
  );

  const srcCounts = {};
  for (const s of ctx.snippetSources) srcCounts[s] = (srcCounts[s] ?? 0) + 1;

  const hasFacts = ctx.bundle.trackFacts.length + ctx.bundle.artistFacts.length > 0;
  const hasSeed = Boolean(seed);
  if (hasFacts && hasSeed) ok += 1;

  console.log(
    `Время: ${(ms / 1000).toFixed(1)}с | bundle track=${ctx.bundle.trackFacts.length} artist=${ctx.bundle.artistFacts.length} | raw=${ctx.rawSnippets.length}`,
  );
  console.log(`Источники raw: ${JSON.stringify(srcCounts)}`);
  console.log('Топ фактов:');
  ranked.slice(0, 4).forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.scope}] score=${r.interest} | ${r.fact.slice(0, 140)}…`);
  });
  console.log(`СЕМЯ (rules): ${hasSeed ? seed.fact.slice(0, 200) : 'НЕТ'}`);
  if (seed) console.log(`  (${explainReferenceFactSelection(ctx.bundle, seed, artist, title)})`);
  console.log(`LLM fact-hunt в production: ${needLlm ? 'ДА (слабое семя)' : 'нет'}`);
  console.log('');
}

console.log('═'.repeat(68));
console.log(`ИТОГ: ${ok}/${TRACKS.length} — bundle не пустой И rules выбрали семя`);
process.exit(ok === TRACKS.length ? 0 : 1);
