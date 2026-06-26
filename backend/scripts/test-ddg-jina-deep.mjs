#!/usr/bin/env node
/** Quick regression: ddg_jina sources + fact for Billie Jean (no Tavily). */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
import { huntDeepFact } from '../dist/services/deep-search-orchestrator.js';
import { runDeepSearch, isRelevantDeepSearchHit } from '../dist/services/deep-search-provider.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const withLlm = process.argv.includes('--llm');
const artist = args[0] ?? 'Michael Jackson';
const title = args[1] ?? 'Billie Jean';

console.log(`=== ddg_jina test: ${artist} — ${title} ===\n`);

const search = await runDeepSearch({ artist, title, mode: 'ddg_jina' });
console.log(`hits=${search.hits.length} pages=${search.pages.length} err=${search.error ?? 'none'}`);
console.log('\nSOURCES (relevant):');
for (const h of search.hits.filter((x) => isRelevantDeepSearchHit(x, artist, title)).slice(0, 8)) {
  console.log(`  • ${h.url}`);
}
console.log('\nPAGES:');
for (const p of search.pages) console.log(`  ↳ ${p.url}`);

const hunt = await huntDeepFact({
  artist,
  title,
  mode: 'ddg_jina',
  openRouterApiKey: withLlm ? process.env.OPEN_ROUTER_API_KEY?.trim() : undefined,
});
console.log(`\nFACT: ${hunt?.fact ?? '(none)'}`);
if (hunt?.evidenceUrl) console.log(`URL: ${hunt.evidenceUrl}`);
const junk = hunt?.fact && /melania|songs of the summer|drake/i.test(hunt.fact);
console.log(junk ? '\n❌ JUNK detected' : hunt?.fact ? '\n✅ looks ok' : '\n⚠ no fact');
