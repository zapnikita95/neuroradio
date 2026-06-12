#!/usr/bin/env node
/**
 * Regression: track-specific facts must win over artist formation bio.
 *
 *   npm run test:fact-pick          — unit only (no network, ~1s)
 *   npm run test:fact-pick -- --live — + Last.fm fetch for Hypa Hypa (needs .env keys)
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = process.argv.includes('--live');

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
loadEnv(resolve(root, '.env'));

const { pickReferenceFact } = await import('../dist/services/fact-picker.js');
const { splitBundleByScope } = await import('../dist/services/fact-ranking.js');
const { factAppliesToRequest, factMentionsTitle } = await import('../dist/services/fact-relevance.js');
const { dedicatedHarvestToBundle } = await import('../dist/services/fact-sources/dedicated-fetch.js');
const { poolHasTopicDuplicate } = await import('../dist/services/fact-topic.js');
const { isArtistFormationBioSeed, isTrackDurationCatalogSeed } = await import(
  '../dist/services/reference-fact-quality.js'
);

const HYPA_ARTIST = 'Eskimo Callboy';
const HYPA_TITLE = 'Hypa Hypa';

const HYPA_NARRATIVE =
  '"Hypa Hypa" is the first new song from that upcoming untiled EP and its also the first new music with Nico since former singer Sebastian "Sushi" Biesler left the band on February 12, 2020 to begin working on his new musical project, Ghostkid.';

const FORMATION_BIO =
  'Electric Callboy is a German electronicore band formed in Castrop-Rauxel in 2010.';

const DURATION_CATALOG = 'На издании альбома «MMXX» трек «Hypa Hypa» идёт 3:33.';

const WEAK_EP_STUB = 'Furthermore, Eskimo Callboy announced a new EP at the same time.';

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failed += 1;
  } else {
    console.log(`ok: ${msg}`);
  }
}

// --- 1. Relevance: title fact must enter track pool ---
assert(
  factAppliesToRequest(HYPA_NARRATIVE, HYPA_ARTIST, HYPA_TITLE, 'track', 'strict'),
  'Hypa narrative passes track relevance (strict)',
);
assert(
  !factAppliesToRequest(DURATION_CATALOG, HYPA_ARTIST, HYPA_TITLE, 'track', 'strict'),
  'duration-only catalog rejected from track pool (catalog metadata)',
);

const pools = splitBundleByScope(
  {
    trackFacts: [HYPA_NARRATIVE, DURATION_CATALOG, WEAK_EP_STUB],
    artistFacts: [FORMATION_BIO],
  },
  HYPA_ARTIST,
  HYPA_TITLE,
);
assert(
  pools.track.some((f) => factMentionsTitle(f, HYPA_TITLE) && f.includes('first new song')),
  'splitBundle puts Hypa narrative into track pool',
);
assert(
  !pools.track.some((f) => isTrackDurationCatalogSeed(f)),
  'duration catalog not in track pool',
);

// --- 2. Pick: narrative beats formation bio ---
const pick = pickReferenceFact(
  {
    trackFacts: [HYPA_NARRATIVE, WEAK_EP_STUB, DURATION_CATALOG],
    artistFacts: [FORMATION_BIO],
  },
  [],
  0,
  HYPA_ARTIST,
  HYPA_TITLE,
);
assert(pick?.scope === 'track', `picked scope is track (got ${pick?.scope})`);
assert(
  pick?.fact.includes('first new song') && pick?.fact.includes('2020'),
  'picked seed is 2020 Hypa Hypa narrative, not formation bio',
);
assert(!isArtistFormationBioSeed(pick?.fact ?? ''), 'picked seed is not artist formation bio');

const badPick = pickReferenceFact(
  { trackFacts: [], artistFacts: [FORMATION_BIO] },
  [],
  0,
  HYPA_ARTIST,
  HYPA_TITLE,
);
assert(
  badPick?.fact.includes('formed'),
  'without track facts, formation bio is acceptable fallback',
);

// --- 3. Dedup: narrative + duration are not the same topic duplicate ---
assert(
  !poolHasTopicDuplicate(HYPA_NARRATIVE, [DURATION_CATALOG]),
  'narrative and duration catalog are not topic duplicates',
);

// --- 4. dedicatedHarvestToBundle: narrative before duration ---
const mockHarvest = [
  { fact: FORMATION_BIO, scope: 'artist', source: 'lastfm' },
  { fact: DURATION_CATALOG, scope: 'track', source: 'discogs' },
  { fact: HYPA_NARRATIVE, scope: 'track', source: 'lastfm' },
  { fact: WEAK_EP_STUB, scope: 'track', source: 'lastfm' },
];
const dedicated = dedicatedHarvestToBundle(mockHarvest, HYPA_ARTIST, HYPA_TITLE);
assert(
  dedicated.trackFacts[0]?.includes('first new song'),
  'dedicatedHarvestToBundle prefers narrative track fact over duration',
);
assert(dedicated.trackFacts.length >= 2, 'dedicated bundle keeps multiple track facts');

// --- 5. Optional live: real Last.fm + aggregator ---
if (LIVE) {
  if (!process.env.LASTFM_API_KEY?.trim()) {
    console.warn('SKIP live: LASTFM_API_KEY not set');
  } else {
    const { fetchAggregatedFactContext } = await import('../dist/services/fact-aggregator.js');
    console.log('\n--- live fetch (may take ~30s) ---');
    const ctx = await fetchAggregatedFactContext(HYPA_ARTIST, HYPA_TITLE, 'DE');
    const livePick = pickReferenceFact(ctx.bundle, [], 0, HYPA_ARTIST, HYPA_TITLE);
    assert(
      livePick?.fact.includes('Hypa Hypa') || livePick?.fact.includes('2020') || livePick?.fact.includes('Nico'),
      `live pick mentions track/2020/Nico: ${livePick?.fact?.slice(0, 100)}`,
    );
    assert(
      !FORMATION_BIO.includes(livePick?.fact?.slice(0, 40) ?? '') ||
        !livePick?.fact.includes('formed in Castrop-Rauxel in 2010'),
      'live pick is not formation-in-2010 bio',
    );
    console.log('live seed:', livePick?.fact?.slice(0, 120));
  }
} else {
  console.log('\n(tip: npm run test:fact-pick -- --live for Last.fm integration)');
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
