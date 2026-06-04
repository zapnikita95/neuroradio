#!/usr/bin/env node
/**
 * Сколько HTTP vs LLM на этапе фактов; что даёт каждый источник.
 * npm run build && node scripts/benchmark-fact-sources.mjs
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

const ARTIST = process.argv[2] || 'Redbone';
const TITLE = process.argv[3] || 'Come and Get Your Love';

const { fetchDuckDuckGoUnfiltered, buildDdgInstantQueries } =
  await import('../dist/services/fact-aggregator.js');
const { fetchWebSearchFactSnippets, buildWebOnlyQueries } =
  await import('../dist/services/web-search-facts.js');
const { fetchWikidataUnfiltered, fetchAggregatedFactContext } =
  await import('../dist/services/fact-aggregator.js');
const { fetchReferenceFactBundle } = await import('../dist/services/wikipedia-facts.js');
const { pickReferenceFact } = await import('../dist/services/fact-picker.js');
const { interestScore } = await import('../dist/services/reference-fact-quality.js');
const { highImpactBonus } = await import('../dist/services/story-fact-hunt.js');
const { shouldRunLlmFactHunt } = await import('../dist/services/story-llm-fact-hunt.js');

async function timed(label, httpCount, fn) {
  const t0 = Date.now();
  const snippets = await fn();
  return { label, ms: Date.now() - t0, httpCount, count: snippets.length, snippets };
}

function printSnippets(rows, max = 5) {
  for (const row of rows.slice(0, max)) {
    console.log(`  [${row.label}] ${row.ms}ms | HTTP≈${row.httpCount} | snippets=${row.count}`);
    for (const [i, s] of row.snippets.slice(0, 3).entries()) {
      const score = interestScore(s);
      const impact = highImpactBonus(s);
      console.log(`    ${i}. score=${score} impact=${impact} | ${s.slice(0, 160)}${s.length > 160 ? '…' : ''}`);
    }
    if (row.snippets.length > 3) console.log(`    … +${row.snippets.length - 3} more`);
  }
}

function rankFacts(facts, label) {
  return facts
    .map((f) => ({ fact: f, score: interestScore(f), impact: highImpactBonus(f), source: label }))
    .sort((a, b) => b.score - a.score || b.impact - a.impact);
}

console.log(`\n=== FACT SOURCES BENCHMARK: ${ARTIST} — ${TITLE} ===\n`);

console.log('── LLM на этапе сбора фактов: 0 запросов ──');
console.log('   (только HTTP к Wikipedia / DDG / Wikidata / MusicBrainz)');
console.log('   LLM fact-hunt — отдельно, 0–1 раз, если rule-picker слабый\n');

console.log('── HTTP по источникам (по отдельности) ──\n');

const wikiOnly = await timed('wikipedia', '~4–12', () => fetchReferenceFactBundle(ARTIST, TITLE, 'US').then((b) => [...b.trackFacts, ...b.artistFacts]));
const ddgHttp = buildDdgInstantQueries(ARTIST, TITLE).length;
const ddgOnly = await timed('ddg-instant-api', String(ddgHttp), () => fetchDuckDuckGoUnfiltered(ARTIST, TITLE));
const webHttp = buildWebOnlyQueries(ARTIST, TITLE).length;
const webOnly = await timed('ddg-html-web', String(webHttp), () => fetchWebSearchFactSnippets(ARTIST, TITLE));

printSnippets([wikiOnly, ddgOnly, webOnly]);

console.log('\n── Один параллельный прогон (как в production) ──\n');

const tAll = Date.now();
const ctx = await fetchAggregatedFactContext(ARTIST, TITLE, 'US');
const parallelMs = Date.now() - tAll;

const estHttp =
  8 + ddgHttp + webHttp + 2 + (process.env.MB_TEST_MBID ? 2 : 0);

console.log(`  wall-clock: ${parallelMs}ms (все источники Promise.all)`);
console.log(`  оценка HTTP: ~${estHttp} (wiki~8 + ddg ${ddgHttp} + web ${webHttp} + wikidata 2)`);
console.log(`  rawSnippets: ${ctx.rawSnippets.length} (cap 12 для LLM fact-hunt)`);
console.log(`  trackFacts: ${ctx.bundle.trackFacts.length} | artistFacts: ${ctx.bundle.artistFacts.length}`);

console.log('\n── RAW по источнику (первые строки) ──');
const bySource = { wiki: [], ddg: [], web: [], wikidata: [], mb: [] };
for (let i = 0; i < ctx.rawSnippets.length; i++) {
  const src = ctx.snippetSources[i] ?? 'wiki';
  bySource[src]?.push(ctx.rawSnippets[i]);
}
for (const [src, lines] of Object.entries(bySource)) {
  if (lines.length === 0) continue;
  console.log(`\n  [${src}] ${lines.length} в raw:`);
  lines.slice(0, 2).forEach((l, i) => console.log(`    ${i}. ${l.slice(0, 180)}…`));
}

console.log('\n── TOP факты в bundle (после merge+rank) ──');
const ranked = [
  ...rankFacts(ctx.bundle.trackFacts, 'track'),
  ...rankFacts(ctx.bundle.artistFacts, 'artist'),
]
  .sort((a, b) => b.score - a.score)
  .slice(0, 8);

for (const r of ranked) {
  console.log(`  [${r.source}] score=${r.score} impact=${r.impact}`);
  console.log(`    ${r.fact.slice(0, 200)}${r.fact.length > 200 ? '…' : ''}`);
}

const picked = pickReferenceFact(ctx.bundle, [], 0, ARTIST, TITLE);
console.log('\n── PICK (без LLM) ──');
console.log(picked?.fact ?? '(none)');

const needLlm = shouldRunLlmFactHunt(
  picked,
  ctx.rawSnippets.length,
  ctx.bundle.trackFacts.length + ctx.bundle.artistFacts.length,
);
console.log(`\n── Нужен ли LLM fact-hunt после pick? ${needLlm ? 'ДА (+1 LLM)' : 'НЕТ (0 LLM)'}`);

console.log('\n── Где что лучше (Redbone) ──');
console.log('  Wikipedia: Hail promo, single cut shorter, Wounded Knee ban, redbone term');
console.log('  Web HTML:  Vasquez/Vegas, appeal white audience (если DDG вернул)');
console.log('  DDG API:   часто пусто или abstract — дублирует wiki');
console.log('');
