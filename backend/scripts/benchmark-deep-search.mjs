#!/usr/bin/env node
/**
 * Compare deep-search modes on sample tracks (cheap first).
 * Run: npm run benchmark:deep-search
 */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
import { huntDeepFact } from '../dist/services/deep-search-orchestrator.js';
import { runDeepSearch } from '../dist/services/deep-search-provider.js';

const SAMPLES = [
  ['Кино', 'Группа крови', 'ru-hit'],
  ['Баста', 'Моя игра', 'ru-hit'],
  ['Michael Jackson', 'Billie Jean', 'en-legend'],
  ['Queen', 'Bohemian Rhapsody', 'en-legend'],
  ['Bad Religion', 'Sorrow', 'en-zero'],
];

const modes = ['baseline_ddg', 'ddg_jina'];
if (process.argv.includes('--with-tavily') && process.env.TAVILY_API_KEY?.trim()) {
  modes.push('tavily');
}

async function benchmarkMode(mode, artist, title) {
  const t0 = Date.now();
  const search = await runDeepSearch({
    artist,
    title,
    mode,
    tavilyApiKey: process.env.TAVILY_API_KEY?.trim(),
  });
  const hunt = await huntDeepFact({
    artist,
    title,
    mode,
    openRouterApiKey: process.argv.includes('--llm')
      ? process.env.OPEN_ROUTER_API_KEY?.trim()
      : undefined,
  });
  return {
    mode,
    latencyMs: Date.now() - t0,
    hits: search.hits.length,
    pages: search.pages.length,
    snippets: search.rawSnippets.length,
    searchCost: search.costUsd,
    fact: hunt?.fact?.slice(0, 120) ?? null,
    huntCost: hunt?.costUsd ?? 0,
    scope: hunt?.scope ?? null,
  };
}

async function main() {
  console.log('=== Deep search benchmark ===');
  console.log('Modes:', modes.join(', '));
  console.log('LLM verify:', process.argv.includes('--llm') ? 'on' : 'off (heuristic only)\n');

  for (const [artist, title, tag] of SAMPLES) {
    console.log(`\n--- ${artist} — ${title} [${tag}] ---`);
    for (const mode of modes) {
      try {
        const r = await benchmarkMode(mode, artist, title);
        console.log(
          `${r.mode.padEnd(14)} hits=${r.hits} pages=${r.pages} snip=${r.snippets} ` +
            `$${(r.searchCost + r.huntCost).toFixed(4)} ${r.latencyMs}ms`,
        );
        console.log(`  fact: ${r.fact ?? '(none)'}`);
      } catch (e) {
        console.log(`${mode}: ERROR ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
