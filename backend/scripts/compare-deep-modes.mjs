#!/usr/bin/env node
/** Side-by-side: ddg_jina heuristic vs ddg_jina+DeepSeek vs Tavily+DeepSeek */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
import { huntDeepFact } from '../dist/services/deep-search-orchestrator.js';
import { runDeepSearch } from '../dist/services/deep-search-provider.js';

const TRACKS = process.argv.slice(2).length >= 2
  ? [[process.argv[2], process.argv[3]]]
  : [
      ['Michael Jackson', 'Billie Jean'],
      ['Bad Religion', 'Sorrow'],
      ['Кино', 'Группа крови'],
    ];

const orKey = process.env.OPEN_ROUTER_API_KEY?.trim();
const tavilyKey = process.env.TAVILY_API_KEY?.trim();

async function runLabel(label, mode, artist, title, withLlm) {
  const search = await runDeepSearch({
    artist,
    title,
    mode,
    tavilyApiKey: tavilyKey,
  });
  const hunt = await huntDeepFact({
    artist,
    title,
    mode,
    openRouterApiKey: withLlm ? orKey : undefined,
    openRouterModel: process.env.OPENROUTER_FACT_MODEL?.trim() || 'deepseek/deepseek-chat-v3-0324',
    tavilyApiKey: mode === 'tavily' ? tavilyKey : undefined,
  });
  return {
    label,
    mode,
    llm: withLlm,
    costUsd: (search.costUsd ?? 0) + (hunt?.costUsd ?? 0),
    error: search.error,
    sources: search.hits.slice(0, 8).map((h) => ({ url: h.url, title: h.title.slice(0, 80) })),
    pagesFetched: search.pages.map((p) => p.url),
    fact: hunt?.fact ?? null,
    scope: hunt?.scope ?? null,
    evidenceUrl: hunt?.evidenceUrl ?? null,
    evidenceQuote: hunt?.evidenceQuote?.slice(0, 200) ?? null,
    source: hunt?.source ?? null,
  };
}

async function compareTrack(artist, title) {
  console.log('\n' + '='.repeat(72));
  console.log(`${artist} — ${title}`);
  console.log('='.repeat(72));

  const runs = [];

  runs.push(await runLabel('A) ddg_jina heuristic ($0)', 'ddg_jina', artist, title, false));

  if (orKey) {
    runs.push(await runLabel('B) ddg_jina + DeepSeek (~$0.005)', 'ddg_jina', artist, title, true));
  } else {
    console.log('\n⚠ OPEN_ROUTER_API_KEY missing — skip DeepSeek runs');
  }

  if (tavilyKey && orKey) {
    runs.push(await runLabel('C) Tavily + DeepSeek (~$0.03)', 'tavily', artist, title, true));
  } else if (!tavilyKey) {
    console.log('\n⚠ TAVILY_API_KEY missing — skip Tavily run');
  }

  for (const r of runs) {
    console.log(`\n--- ${r.label} ---`);
    if (r.error) console.log(`search error: ${r.error}`);
    console.log(`cost: $${r.costUsd.toFixed(4)} | pages: ${r.pagesFetched.length}`);
    console.log('SOURCES:');
    for (const s of r.sources) console.log(`  • ${s.url}\n    ${s.title}`);
    if (r.pagesFetched.length) {
      console.log('FULL PAGES:');
      for (const u of r.pagesFetched.slice(0, 5)) console.log(`  ↳ ${u}`);
    }
    console.log(`FACT (${r.scope ?? '—'}, ${r.source ?? '—'}):`);
    console.log(`  ${r.fact ?? '(none)'}`);
    if (r.evidenceQuote) console.log(`QUOTE: "${r.evidenceQuote}…"`);
  }

  return runs;
}

async function main() {
  console.log('Keys: OpenRouter=' + (orKey ? 'yes' : 'NO') + ', Tavily=' + (tavilyKey ? 'yes' : 'NO'));
  const all = [];
  for (const [a, t] of TRACKS) all.push(await compareTrack(a, t));
  return all;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
