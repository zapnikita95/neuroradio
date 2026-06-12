#!/usr/bin/env node
/**
 * Полный прогон fact-пайплайна story.ts для Error37.
 * node scripts/test-error37-e2e.mjs
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

const artist = 'Error37';
const title = 'Ruining Art as a Medium';
const installId = 'test-error37-e2e';

const {
  fetchAggregatedFactContext,
  fetchDiscogsFactFallback,
  fetchIndieArtistFocusContext,
  fetchEmergencyFactRescue,
} = await import('../dist/services/fact-aggregator.js');
const { pickFactForUser, buildFactPickContext } = await import('../dist/services/fact-user-service.js');
const { resolveArtistTier } = await import('../dist/services/artist-notability.js');
const { buildMetadataFallbackFacts, countGroundedFacts } = await import('../dist/services/metadata-facts.js');
const { formatFactPickLog } = await import('../dist/services/fact-interest-log.js');
const { isWeakSelectedFact } = await import('../dist/services/search-snippet-salvage.js');
const { splitBundleByScope, rankScopedFacts } = await import('../dist/services/fact-ranking.js');
const { enrichTrackMetadata } = await import('../dist/services/musicbrainz.js');
const { NoReferenceFactsError } = await import('../dist/services/story-errors.js');

console.log('DISCOGS_TOKEN:', process.env.DISCOGS_TOKEN ? 'да' : 'НЕТ');
console.log('═'.repeat(72));
console.log(`E2E fact pipeline: ${artist} — ${title}\n`);

const tTotal = Date.now();
const tMeta = Date.now();
const metadata = await enrichTrackMetadata(artist, title);
console.log(`MB metadata: ${Date.now() - tMeta}ms`, {
  artist: metadata.artist,
  title: metadata.title,
  year: metadata.year,
  mbid: metadata.mbid,
});

let factCtx;
const tFetch = Date.now();
factCtx = await fetchAggregatedFactContext(
  metadata.artist,
  metadata.title,
  metadata.countryCode,
  metadata.mbid,
  metadata.artistMbid,
  { storyLanguage: 'ru' },
);
console.log(`\n[1] fetchAggregatedFactContext: ${Date.now() - tFetch}ms`);
console.log(`    track=${factCtx.bundle.trackFacts.length} artist=${factCtx.bundle.artistFacts.length} raw=${factCtx.rawSnippets.length}`);
for (const f of factCtx.bundle.trackFacts) console.log(`    track: ${f}`);
for (const f of factCtx.bundle.artistFacts) console.log(`    artist: ${f}`);

let factBundle = factCtx.bundle;
let trackFactCount = factBundle.trackFacts.length;
let artistFactCount = factBundle.artistFacts.length;

if (trackFactCount + artistFactCount === 0) {
  const tDisc = Date.now();
  const discogsCtx = await fetchDiscogsFactFallback(metadata.artist, metadata.title, metadata.countryCode);
  console.log(`\n[2] discogs fallback: ${Date.now() - tDisc}ms`, discogsCtx ? 'HIT' : 'miss');
  if (discogsCtx) {
    factCtx = { ...factCtx, ...discogsCtx };
    factBundle = discogsCtx.bundle;
    trackFactCount = factBundle.trackFacts.length;
    artistFactCount = factBundle.artistFacts.length;
  }
}

if (trackFactCount + artistFactCount === 0) {
  const metaFacts = buildMetadataFallbackFacts(metadata);
  factBundle = { ...factBundle, artistFacts: metaFacts };
  artistFactCount = metaFacts.length;
  console.log(`\n[3] metadata-only seeds: ${metaFacts.length}`);
  for (const f of metaFacts) console.log(`    ${f}`);
}

const artistTier = resolveArtistTier(metadata.artist, metadata.title, metadata, factBundle);
console.log(`\nartistTier=${artistTier} grounded=${countGroundedFacts(factBundle)}`);

const pools = splitBundleByScope(factBundle, metadata.artist, metadata.title);
const ranked = rankScopedFacts(pools).filter((r) => !r.junk);
console.log(`\nRanked pools: track=${pools.track.length} album=${pools.album.length} artist=${pools.artist.length}`);
ranked.slice(0, 6).forEach((r, i) => {
  console.log(`  ${i + 1}. [${r.scope}] interest=${r.interest} — ${r.fact.slice(0, 180)}`);
});

const factPickCtx = await buildFactPickContext(installId, metadata.artist, metadata.title, {
  storyNarrator: 'night_dj',
});
const tPick = Date.now();
let selectedFact = await pickFactForUser(
  installId,
  factBundle,
  metadata.artist,
  metadata.title,
  0,
  'night_dj',
  factPickCtx,
);
console.log(`\n[4] pickFactForUser: ${Date.now() - tPick}ms`);
console.log(formatFactPickLog(selectedFact, 'rules') ?? '  (null)');

if (selectedFact && isWeakSelectedFact(selectedFact, metadata.artist)) {
  console.log('\n[5] REJECTED weak seed');
  selectedFact = null;
}

if (!selectedFact && countGroundedFacts(factBundle) === 0 && artistTier !== 'major') {
  const tIndie = Date.now();
  const indieCtx = await fetchIndieArtistFocusContext(
    metadata.artist,
    metadata.title,
    metadata.countryCode,
    metadata.artistMbid,
  );
  console.log(`\n[6] indie artist focus: ${Date.now() - tIndie}ms track=${indieCtx.bundle.trackFacts.length} artist=${indieCtx.bundle.artistFacts.length}`);
  if (indieCtx.bundle.trackFacts.length + indieCtx.bundle.artistFacts.length > 0) {
    factBundle = indieCtx.bundle;
    selectedFact = await pickFactForUser(
      installId,
      factBundle,
      metadata.artist,
      metadata.title,
      0,
      'night_dj',
      factPickCtx,
    );
    console.log('    indie pick:', formatFactPickLog(selectedFact, 'rules') ?? '(null)');
  }
}

if (!selectedFact) {
  const tEmer = Date.now();
  const emergencyCtx = await fetchEmergencyFactRescue(metadata.artist, metadata.title, factCtx.rawSnippets);
  console.log(`\n[7] emergency rescue: ${Date.now() - tEmer}ms track=${emergencyCtx.bundle.trackFacts.length} artist=${emergencyCtx.bundle.artistFacts.length}`);
  if (emergencyCtx.bundle.trackFacts.length + emergencyCtx.bundle.artistFacts.length > 0) {
    selectedFact = await pickFactForUser(
      installId,
      emergencyCtx.bundle,
      metadata.artist,
      metadata.title,
      0,
      'night_dj',
      factPickCtx,
    );
    console.log('    emergency pick:', formatFactPickLog(selectedFact, 'rules') ?? '(null)');
  }
}

console.log('\n' + '═'.repeat(72));
console.log(`TOTAL: ${((Date.now() - tTotal) / 1000).toFixed(1)}s`);
if (selectedFact?.fact) {
  console.log('\n✅ ИТОГ — история ПОШЛА БЫ:');
  console.log(`   scope: ${selectedFact.scopeLabelRu}`);
  console.log(`   interest: ${selectedFact.interestRating}/10 (score=${selectedFact.interestScore})`);
  console.log(`   fact: ${selectedFact.fact}`);
} else {
  console.log('\n❌ ИТОГ — NO_REFERENCE_FACTS (как на скрине):');
  console.log(`   ${new NoReferenceFactsError(metadata.artist, metadata.title).message}`);
  process.exit(1);
}
