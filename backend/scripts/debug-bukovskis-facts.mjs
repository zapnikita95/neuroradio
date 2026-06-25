#!/usr/bin/env node
/**
 * Live probe: Edgars Bukovskis — Alone — facts + emergency rescue + web sources.
 * Run: npm run build && node scripts/debug-bukovskis-facts.mjs
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

const artist = 'Edgars Bukovskis';
const title = 'Alone';
const LASTFM_JUNK =
  'Трек «Alone» исполнителя Edgars Bukovskis на Last.fm указан в альбоме «Alone - Single».';

function section(name) {
  console.log(`\n${'='.repeat(72)}\n${name}\n${'='.repeat(72)}`);
}

function printList(label, items, max = 12) {
  console.log(`\n${label} (${items.length}):`);
  for (const [i, item] of items.slice(0, max).entries()) {
    console.log(`  ${i + 1}. ${String(item).slice(0, 240)}`);
  }
  if (items.length > max) console.log(`  … +${items.length - max} more`);
}

section(`BUKOVSKIS FACT PROBE — ${artist} — ${title}`);

const { lookupCuratedFact } = await import('../dist/services/curated-facts.js');
const curated = lookupCuratedFact(artist, title);
console.log('curated:', curated ? curated.fact.slice(0, 200) : '(none)');

const {
  fetchWebSearchFactSnippets,
  fetchBackstoryWebSnippets,
  fetchTitleFirstWebSnippets,
  fetchDeepWebSearchSnippets,
  fetchArtistIdentityWebSnippets,
} = await import('../dist/services/web-search-facts.js');
const { fetchFastTrackWikiFacts } = await import('../dist/services/wikipedia-facts.js');
const { fetchDiscogsLiveFacts } = await import('../dist/services/fact-sources/discogs-facts.js');
const { factAppliesToRequest } = await import('../dist/services/fact-relevance.js');
const { hasActionableSnippets } = await import('../dist/services/web-snippet-accept.js');
const { referenceFactsAreAnchorable } = await import('../dist/services/story-quality.js');
const { pickRelaxedSnippetSeed, pickSalvageSnippetSeed } = await import(
  '../dist/services/search-snippet-salvage.js'
);
const { pickReferenceFact } = await import('../dist/services/fact-picker.js');
const { interestScore } = await import('../dist/services/reference-fact-quality.js');
const {
  fetchAggregatedFactContext,
  fetchEmergencyFactRescue,
} = await import('../dist/services/fact-aggregator.js');

const t0 = Date.now();
const [
  webGeneral,
  webBack,
  titleFirst,
  webDeep,
  artistIdentity,
  wikiFast,
  discogsFacts,
] = await Promise.all([
  fetchWebSearchFactSnippets(artist, title),
  fetchBackstoryWebSnippets(artist, title),
  fetchTitleFirstWebSnippets(title),
  fetchDeepWebSearchSnippets(artist, title),
  fetchArtistIdentityWebSnippets(artist),
  fetchFastTrackWikiFacts(artist, title),
  fetchDiscogsLiveFacts({ artist, title }),
]);
console.log(`parallel fetch: ${Date.now() - t0}ms`);

printList('web general', webGeneral);
printList('web backstory', webBack);
printList('title-first web', titleFirst);
printList('web deep', webDeep);
printList('artist identity', artistIdentity);
printList('wiki fast-track', wikiFast);
printList(
  'discogs',
  discogsFacts.map((f) => `[${f.source}] ${f.fact}`),
);

const allWeb = [...new Set([...webGeneral, ...webBack, ...titleFirst, ...webDeep, ...artistIdentity])];
console.log('\nactionable web snippets:', hasActionableSnippets(allWeb, artist, title));
console.log('actionable with junk only:', hasActionableSnippets([LASTFM_JUNK], artist, title));

section('WEB SNIPPET RELEVANCE (indie track)');
for (const snippet of allWeb.slice(0, 10)) {
  const trackOk = factAppliesToRequest(snippet, artist, title, 'track', 'indie');
  const artistOk = factAppliesToRequest(snippet, artist, title, 'artist', 'indie');
  if (trackOk || artistOk) {
    console.log(`\n[track=${trackOk} artist=${artistOk}] ${snippet.slice(0, 220)}`);
  }
}

section('FULL AGGREGATED CONTEXT');
const tAgg = Date.now();
const ctx = await fetchAggregatedFactContext(artist, title, 'LV');
console.log(`fetchAggregatedFactContext: ${Date.now() - tAgg}ms`);
printList('track facts', ctx.bundle.trackFacts);
printList('artist facts', ctx.bundle.artistFacts);
printList('raw snippets', ctx.rawSnippets);

const pick = pickReferenceFact(ctx.bundle, [], 0, artist, title);
const salvage = pickSalvageSnippetSeed(ctx.rawSnippets, artist, title, 'ru');
const relaxed = pickRelaxedSnippetSeed(ctx.rawSnippets, artist, title);
console.log('\npickReferenceFact:', pick?.fact?.slice(0, 200) ?? '(none)');
console.log('pickSalvage:', salvage?.fact?.slice(0, 200) ?? '(none)');
console.log('pickRelaxed:', relaxed ?? '(none)');
console.log(
  'referenceFactsAreAnchorable(bundle):',
  referenceFactsAreAnchorable(
    [...ctx.bundle.trackFacts, ...ctx.bundle.artistFacts],
    artist,
    title,
  ),
);

section('EMERGENCY RESCUE (junk-only snippets like prod)');
const tRescue = Date.now();
const emergencyJunk = await fetchEmergencyFactRescue(artist, title, [LASTFM_JUNK]);
console.log(`emergency (with lastfm junk): ${Date.now() - tRescue}ms`);
printList('rescue track', emergencyJunk.bundle.trackFacts);
printList('rescue artist', emergencyJunk.bundle.artistFacts);
printList('rescue raw', emergencyJunk.rawSnippets);

const tRescue2 = Date.now();
const emergencyEmpty = await fetchEmergencyFactRescue(artist, title, []);
console.log(`emergency (empty): ${Date.now() - tRescue2}ms`);
printList('rescue-empty track', emergencyEmpty.bundle.trackFacts);
printList('rescue-empty artist', emergencyEmpty.bundle.artistFacts);

if (emergencyJunk.bundle.trackFacts[0]) {
  console.log('\nrescue seed score:', interestScore(emergencyJunk.bundle.trackFacts[0]));
}
if (pick?.fact) {
  console.log('normal pick score:', interestScore(pick.fact));
}

section('SUMMARY');
const hasGrounded =
  ctx.bundle.trackFacts.length + ctx.bundle.artistFacts.length > 0 ||
  emergencyJunk.bundle.trackFacts.length + emergencyJunk.bundle.artistFacts.length > 0;
console.log('public grounded facts found:', hasGrounded ? 'YES (see above)' : 'NO — only catalog junk');
console.log('lastfm junk as relaxed seed:', relaxed ? 'LEAK (bad)' : 'blocked (good)');
