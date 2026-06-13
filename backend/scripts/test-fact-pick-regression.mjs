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
const { factAppliesToRequest, factMentionsTitle, isNonMusicTitleCollisionFact } = await import(
  '../dist/services/fact-relevance.js'
);
const { dedicatedHarvestToBundle } = await import('../dist/services/fact-sources/dedicated-fetch.js');
const { poolHasTopicDuplicate } = await import('../dist/services/fact-topic.js');
const { isArtistFormationBioSeed, isTrackDurationCatalogSeed } = await import(
  '../dist/services/reference-fact-quality.js'
);
const { rejectSeedForTrackStory } = await import('../dist/services/fact-track-anchor.js');
const { findUngroundedClaims } = await import('../dist/services/story-quality.js');

const HYPA_ARTIST = 'Eskimo Callboy';
const HYPA_TITLE = 'Hypa Hypa';

const HYPA_NARRATIVE =
  '"Hypa Hypa" is the first new song from that upcoming untiled EP and its also the first new music with Nico since former singer Sebastian "Sushi" Biesler left the band on February 12, 2020 to begin working on his new musical project, Ghostkid.';

const FORMATION_BIO =
  'Electric Callboy is a German electronicore band formed in Castrop-Rauxel in 2010.';

const DURATION_CATALOG = 'На издании альбома «MMXX» трек «Hypa Hypa» идёт 3:33.';

const WEAK_EP_STUB = 'Furthermore, Eskimo Callboy announced a new EP at the same time.';

const SUMMER_ARTIST = 'Calvin Harris';
const SUMMER_TITLE = 'Summer';
const SEASON_COLLISION =
  'In almost all countries, children are out of school during the summer break.';
const SPOTIFY_FACT = "Summer was Spotify's most-streamed track of 2014 worldwide.";

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
  !badPick,
  'without track facts, formation bio is rejected (no unanchored artist trivia for track story)',
);

// --- 2b. Summer: season encyclopedia must lose to Spotify track fact ---
assert(
  isNonMusicTitleCollisionFact(SEASON_COLLISION, SUMMER_TITLE, SUMMER_ARTIST),
  'summer break encyclopedia rejected as title collision',
);
const summerPick = pickReferenceFact(
  {
    trackFacts: [SPOTIFY_FACT],
    artistFacts: [SEASON_COLLISION],
    albumFacts: [],
  },
  [],
  0,
  SUMMER_ARTIST,
  SUMMER_TITLE,
  new Set(),
  'night_dj',
);
assert(
  summerPick?.fact.includes('Spotify') || summerPick?.fact.includes('streamed'),
  `Summer pick is Spotify fact, not season trivia (got: ${summerPick?.fact?.slice(0, 80)})`,
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

// --- 5. Track anchor: cross-song bleed, place collision, career bio ---
const PORCARO_FACT =
  'It was originally written by keyboardist Steve Porcaro, based on a conversation he had with his daughter.';
const CHICAGO_CITY =
  'The city of Chicago was first known reference to Checagou in a memoir by La Salle.';
const SQWOZ_DUO_EN =
  'Originally started as a duo with Igor Tsaregorodtsev in 2012 before transitioning to a solo career.';
const SQWOZ_DUO_RU = 'SQWOZ BAB начинал как дуэт с Игорем Царегорodtsev в 2012 году.';

assert(
  rejectSeedForTrackStory(PORCARO_FACT, 'Michael Jackson', 'Chicago'),
  'Porcaro/Human Nature origin rejected for Chicago',
);
assert(
  rejectSeedForTrackStory(CHICAGO_CITY, 'Michael Jackson', 'Chicago'),
  'Chicago city encyclopedia rejected for MJ Chicago track',
);
assert(
  rejectSeedForTrackStory(SQWOZ_DUO_EN, 'SQWOZ BAB', 'КУПЕР'),
  'English duo bio rejected without track title',
);
assert(
  rejectSeedForTrackStory(SQWOZ_DUO_RU, 'SQWOZ BAB', 'КУПЕР'),
  'Russian duo bio rejected without track title',
);

const mjPick = pickReferenceFact(
  { trackFacts: [], artistFacts: [PORCARO_FACT, CHICAGO_CITY] },
  [],
  0,
  'Michael Jackson',
  'Chicago',
);
assert(
  !mjPick || (!/Porcaro|Checagou|keyboardist/i.test(mjPick.fact)),
  `Chicago pick skips Porcaro/city bleed (got: ${mjPick?.fact?.slice(0, 80) ?? 'null'})`,
);

// --- 5b. Parenthetical title variants (Shakira-style catalog names) ---
const { harvestTitleVariants, primaryHarvestLookupTitle } = await import(
  '../dist/services/title-harvest-variants.js'
);
const { resolveTrackLookupKeys } = await import('../dist/services/fact-bank.js');

const SHAKIRA_LONG =
  'Waka Waka (This Time for Africa) (feat. Freshlyground) (Single)';
const shakiraVariants = harvestTitleVariants(SHAKIRA_LONG);
assert(
  shakiraVariants.some((v) => v === 'Waka Waka (This Time for Africa)'),
  `Shakira variants strip feat/Single (got: ${shakiraVariants.join(' | ')})`,
);
assert(
  primaryHarvestLookupTitle(SHAKIRA_LONG).length < SHAKIRA_LONG.length,
  'primaryHarvestLookupTitle shorter than catalog name',
);

const aliasKeys = resolveTrackLookupKeys('Shakira', SHAKIRA_LONG);
assert(
  aliasKeys.some((k) => k.includes('waka waka (this time for africa)')),
  `bank alias keys cover stripped title (${aliasKeys.join(', ')})`,
);

assert(
  findUngroundedClaims(
    'Summer Calvin Harris стал саундтреком лета 2014 — его гитарные рифы',
    ["Summer was Spotify's most-streamed track of 2014 worldwide."],
  ),
  'false soundtrack/guitar claim rejected when not in seed',
);

const DANI_FACT =
  'Throughout the song, lyricist Anthony Kiedis laments the early death of Dani, a poor, young Southern girl who eventually lived in California.';
assert(
  rejectSeedForTrackStory(DANI_FACT, 'Red Hot Chili Peppers', "Can't Stop"),
  'Dani California lyrical bleed rejected for Can\'t Stop',
);
assert(
  !rejectSeedForTrackStory(DANI_FACT, 'Red Hot Chili Peppers', 'Dani California'),
  'Dani fact allowed for Dani California',
);

// --- 6. Optional live: real Last.fm + aggregator ---
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
