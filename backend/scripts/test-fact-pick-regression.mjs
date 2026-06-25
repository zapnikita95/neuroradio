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

// --- 2c. Taxman: UK supertax IS the song story — never a title collision ---
const TAXMAN_TAX_FACT =
  'George Harrison wrote "Taxman" after learning the UK top rate of income tax could take 95% of the Beatles\' earnings — the "one for you, nineteen for me" line refers to that rate.';
assert(
  !isNonMusicTitleCollisionFact(TAXMAN_TAX_FACT, 'Taxman', 'The Beatles'),
  'Taxman 95% UK tax fact is track meaning, not encyclopedia collision',
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
  primaryHarvestLookupTitle(SHAKIRA_LONG).includes('Waka Waka (This Time for Africa)'),
  'primaryHarvestLookupTitle keeps stripped feat/Single title',
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

const { isWeakSnippetSeed } = await import('../dist/services/search-snippet-salvage.js');
assert(
  isWeakSnippetSeed('Альбом «Overexposed» (Maroon 5) на Discogs датирован 2016 годом.'),
  'Discogs date catalog rejected as weak seed',
);

assert(
  findUngroundedClaims(
    'One More Night стала настоящим прорывом для группы, заняв верхние строчки чартов',
    ['The song was released on June 19, 2012, as the second single from their fourth studio album.'],
  ),
  'false breakthrough claim rejected when not in seed',
);

const { findPersonaCliche } = await import('../dist/services/story-quality.js');
assert(
  findPersonaCliche('Вступление держит внимание лучше любого джингла.'),
  'jingle intro closing rejected as persona cliche',
);

const { applyStylizedArtistTokensRu } = await import('../dist/services/artist-pronunciation.js');
assert(
  applyStylizedArtistTokensRu('трек by mgk', 'mgk', '').includes('эм-джей-к'),
  'mgk spelled as em-jay-kay in RU TTS, not mdjk',
);
assert(
  applyStylizedArtistTokensRu('One More Night by Maroon 5', 'Maroon 5', 'One More Night').includes('мар'),
  'Maroon 5 respelled for RU TTS',
);

const {
  isCitationBibliographySeed,
  isGenericConcertVenueSeed,
  isSetlistLiveDebutSeed,
  isCatalogMetadataSeed,
  interestScore: scoreFact,
} = await import('../dist/services/reference-fact-quality.js');

const MAKUHARI =
  'Green Day: Live at Makauhari Messe ;Tokyo, Japan | March , ; . Retrieved June , &# ; via YouTube. ^ Tun-Dar Green Day - Holiday Live (Bullet In A Bible) . Retrieved June , &# ; via YouTube.';
const DYLAN = '"Holiday" was inspired by the music of Bob Dylan .';
const CHORUS =
  'The chorus\'s refrain—"This is our lives on holiday"—was intended to reflect the average American\'s life.';
const PROTEST = '"Holiday" is an anti-war protest song by American rock band Green Day.';

assert(isCitationBibliographySeed(MAKUHARI), 'YouTube citation junk rejected');
assert(isGenericConcertVenueSeed(MAKUHARI), 'generic venue listing rejected');
assert(scoreFact(DYLAN) >= 12, `Dylan inspiration scores high (got ${scoreFact(DYLAN)})`);
assert(scoreFact(CHORUS) >= 12, `chorus meaning scores high (got ${scoreFact(CHORUS)})`);
assert(scoreFact(PROTEST) >= 12, `protest song scores high (got ${scoreFact(PROTEST)})`);
assert(scoreFact(MAKUHARI) < 0, `Makuhari citation scores negative (got ${scoreFact(MAKUHARI)})`);

const holidayPick = pickReferenceFact(
  {
    trackFacts: [MAKUHARI, DYLAN, '"Holiday" released as the third single off of Green Day\'s seventh studio album.'],
    artistFacts: [CHORUS, PROTEST, 'On April 13, 2019, for Record Store Day, the band released their Woodstock 1994 performance.'],
  },
  [],
  0,
  'Green Day',
  'Holiday',
);
assert(
  holidayPick && !MAKUHARI.includes(holidayPick.fact.slice(0, 40)),
  `Holiday pick skips Makuhari junk (got: ${holidayPick?.fact?.slice(0, 90) ?? 'null'})`,
);
assert(
  holidayPick &&
    (holidayPick.fact.includes('Dylan') ||
      holidayPick.fact.includes('protest') ||
      holidayPick.fact.includes('intended to reflect')),
  `Holiday pick prefers meaning/inspiration (got: ${holidayPick?.fact?.slice(0, 90) ?? 'null'})`,
);

const { hasNarrativeSeedSignal } = await import('../dist/services/web-snippet-accept.js');

const POMPEYA_LABEL = 'Релиз «Foursome» (Pompeya) выходил на лейбле Gala Records (5).';
assert(isCatalogMetadataSeed(POMPEYA_LABEL), 'Discogs label fact is catalog metadata');
assert(scoreFact(POMPEYA_LABEL) < 0, `label seed scores negative (got ${scoreFact(POMPEYA_LABEL)})`);
assert(!hasNarrativeSeedSignal(POMPEYA_LABEL), 'label fact has no narrative signal');

const pompeyaPick = pickReferenceFact(
  {
    trackFacts: [POMPEYA_LABEL, "Трек «Nobody's Truth» исполнителя Pompeya на Last.fm указан в альбоме «Foursome»."],
    artistFacts: ['1) A Russian rock band from Moscow.', '2) An Argentinian funkpopjazz band based in Buenos Aires.'],
  },
  [],
  0,
  'Pompeya',
  "Nobody's Truth",
);
assert(
  !pompeyaPick || !POMPEYA_LABEL.includes(pompeyaPick.fact.slice(0, 30)),
  `Pompeya pick skips label junk (got: ${pompeyaPick?.fact?.slice(0, 90) ?? 'null'})`,
);

const { isGenericMusicVideoSeed } = await import('../dist/services/reference-fact-quality.js');
const LONELY_MTV =
  'Speaking of the video to MTV, Reynolds said "We read through a ton of scripts from really talented directors, and we came across one that stood out to us in particular, because it put into visuals the general theme of the song, which is kind of an empowering song about an awakening".';
assert(isGenericMusicVideoSeed(LONELY_MTV), 'MTV script interview is generic music video seed');
assert(scoreFact(LONELY_MTV) < 0, `MTV seed scores negative (got ${scoreFact(LONELY_MTV)})`);

const lonelyPick = pickReferenceFact(
  {
    trackFacts: [
      LONELY_MTV,
      '“Lonely” serves as the second track from Imagine Dragons\' fifth studio album "Mercury Acts 1".',
      'The song incorporates a lot of new musical elements for the band, such as vocal counterpoint harmonies.',
    ],
    artistFacts: ['They were the most streamed group of 2018 on Spotify, the first rock act to have four songs in the top 20.'],
  },
  [],
  0,
  'Imagine Dragons',
  'Lonely',
);
assert(
  !lonelyPick || !isGenericMusicVideoSeed(lonelyPick.fact),
  `Lonely pick skips MTV clip junk (got: ${lonelyPick?.fact?.slice(0, 90) ?? 'null'})`,
);
assert(
  lonelyPick?.fact.includes('musical elements') ||
    lonelyPick?.fact.includes('Mercury') ||
    lonelyPick?.fact.includes('Spotify') ||
    lonelyPick === null,
  `Lonely prefers track/artist narrative over clip (got: ${lonelyPick?.fact?.slice(0, 90) ?? 'null'})`,
);

const ROB_ARTIST = 'Rob Thomas';
const ROB_TITLE = 'Lonely No More';
const MATCHBOX_BAND_FACT =
  'For the first time, the band recorded a song not written by Thomas.';
const ROB_DEBUT_SINGLE =
  '"Lonely No More" is the first single from Matchbox Twenty frontman Rob Thomas\' debut studio album, ...Something to Be.';

const { isMisattributedBandTrackFact } = await import('../dist/services/fact-relevance.js');
const { isTrackTitleAnchoredSeed } = await import('../dist/services/fact-track-anchor.js');
const { isRejectedStorySeed } = await import('../dist/services/fact-picker.js');
const { isWeakSelectedFact } = await import('../dist/services/search-snippet-salvage.js');

assert(isMisattributedBandTrackFact(MATCHBOX_BAND_FACT, ROB_TITLE), 'Matchbox band fact misattributed to solo track');
assert(isTrackTitleAnchoredSeed(ROB_DEBUT_SINGLE, ROB_TITLE), 'debut single fact anchors to Lonely No More');
assert(
  isRejectedStorySeed(MATCHBOX_BAND_FACT, ROB_ARTIST, ROB_TITLE, [ROB_DEBUT_SINGLE]),
  'central gate rejects band-not-written-by for Lonely No More',
);
assert(
  !isRejectedStorySeed(ROB_DEBUT_SINGLE, ROB_ARTIST, ROB_TITLE, [ROB_DEBUT_SINGLE]),
  'central gate accepts title-anchored debut single',
);
assert(
  !isWeakSelectedFact(
    {
      fact: ROB_DEBUT_SINGLE,
      scope: 'track',
      scopeLabelRu: 'трек',
      interestScore: scoreFact(ROB_DEBUT_SINGLE),
      interestRating: 8,
    },
    ROB_ARTIST,
    ROB_TITLE,
  ),
  'salvage debut-single seed is not weak when title is anchored',
);

const robPick = pickReferenceFact(
  {
    trackFacts: [ROB_DEBUT_SINGLE],
    artistFacts: [MATCHBOX_BAND_FACT],
  },
  [],
  0,
  ROB_ARTIST,
  ROB_TITLE,
);
assert(
  robPick && robPick.fact.includes('Lonely No More'),
  `Rob Thomas pick prefers track-anchored fact (got: ${robPick?.fact?.slice(0, 90) ?? 'null'})`,
);
assert(
  !robPick?.fact.includes('the band recorded'),
  'Rob Thomas pick skips Matchbox Twenty band bleed',
);

const BAD_ROB_STORY =
  'Lonely No More — Rob Thomas. Впервые в истории группы этот трек написал не сам артист. Песня стала хитом, доказав, что команда может работать и без его единоличного контроля.';
const ungroundedHit = findUngroundedClaims('Песня стала хитом, доказав успех.', [ROB_DEBUT_SINGLE]);
assert(ungroundedHit, `hit claim flagged without hit in seed (got: ${ungroundedHit ?? 'null'})`);
const ungroundedGroup = findUngroundedClaims(
  'Впервые в истории группы этот трек написал не сам артист.',
  [ROB_DEBUT_SINGLE],
);
assert(ungroundedGroup, `group narrative flagged when seed lacks band context (got: ${ungroundedGroup ?? 'null'})`);
void BAD_ROB_STORY;

const MAROON_ORIGIN =
  'Maroon 5 is an American pop rock band that originated in Los Angeles, California, United States.';
const MAROON_SINGLE =
  'The song was released on June 19, 2012, as the second single from their fourth studio album.';
const MGK_NERVAL =
  'The French poet Gérard de Nerval once said, "The first who compared a woman to a rose was a poet, the second an imbecile." A cliché is often';
const POMPEYA_DISAMBIG = '1) A Russian rock band from Moscow. 2) An Argentinian funkpopjazz band based in Buenos Aires.';
const POMPEYA_MOSCOW = '1) POMPEYA is an up-and-coming indie rock band from Moscow, Russia.';

const {
  isEncyclopediaDefinitionSeed,
  isArtistDisambiguationListSeed,
} = await import('../dist/services/reference-fact-quality.js');
const { artistsMatchForHarvest, factMentionsArtistOrAlias } = await import(
  '../dist/services/artist-search-aliases.js'
);

assert(
  rejectSeedForTrackStory(
    'The debut single check was recorded in the beginning of 2007 and quickly became popular.',
    'Pompeya',
    "Nobody's Truth",
  ),
  'Pompeya wrong-track debut single rejected',
);
assert(isArtistFormationBioSeed(MAROON_ORIGIN), 'Maroon originated-in-LA is formation bio');
assert(
  isTrackTitleAnchoredSeed(MAROON_SINGLE, 'One More Night'),
  'Maroon second-single fact anchors via release context',
);
assert(
  isRejectedStorySeed(MAROON_ORIGIN, 'Maroon 5', 'One More Night', [MAROON_SINGLE]),
  'Maroon LA origin rejected when track single exists',
);
assert(isEncyclopediaDefinitionSeed(MGK_NERVAL), 'mgk Nerval cliché definition rejected');
assert(
  isRejectedStorySeed(MGK_NERVAL, 'mgk', 'cliché', []),
  'encyclopedia bleed rejected for mgk cliché',
);
assert(isArtistDisambiguationListSeed(POMPEYA_DISAMBIG), 'Pompeya disambig list is junk');
assert(
  rejectSeedForTrackStory(POMPEYA_MOSCOW, 'Pompeya', "Nobody's Truth"),
  'Pompeya Moscow band bio rejected without track title',
);
assert(artistsMatchForHarvest('mgk', 'Machine Gun Kelly'), 'mgk matches Machine Gun Kelly harvest');
assert(
  factMentionsArtistOrAlias('Colson Baker released cliché in 2024', 'mgk'),
  'mgk alias colson baker in facts',
);

const maroonPick = pickReferenceFact(
  {
    trackFacts: [MAROON_SINGLE, '"One More Night" is a song performed by American pop rock band Maroon 5.'],
    artistFacts: [MAROON_ORIGIN, 'The group was formed in 1994 as Kara\'s Flowers while its members were still in high school.'],
  },
  [],
  0,
  'Maroon 5',
  'One More Night',
);
assert(
  maroonPick && (maroonPick.fact.includes('2012') || maroonPick.fact.includes('One More Night')),
  `Maroon pick prefers track context (got: ${maroonPick?.fact?.slice(0, 90) ?? 'null'})`,
);
assert(
  maroonPick && !/\boriginated in Los Angeles\b/i.test(maroonPick.fact),
  `Maroon pick must not be LA origin bio (got: ${maroonPick?.fact?.slice(0, 90) ?? 'null'})`,
);

// --- 5c. Bank pick uses live interest rules (generic video ≠ hot) ---
const { isEligibleHotFact, isRejectedPickSeed } = await import('../dist/services/fact-seed-pick.js');

const GENERIC_VIDEO =
  'The official music video for Waka Waka was directed by Miguel Escotet and filmed in Barcelona.';
const STRONG_VIDEO =
  'Shakira invested over one million dollars of her own money into the controversial Waka Waka music video.';

assert(isGenericMusicVideoSeed(GENERIC_VIDEO), 'generic directed-by video detected');
assert(!isGenericMusicVideoSeed(STRONG_VIDEO), 'strong video (budget) not generic');
assert(!isEligibleHotFact(GENERIC_VIDEO, { artist: 'Shakira', title: 'Waka Waka' }), 'generic video not hot');
assert(isEligibleHotFact(STRONG_VIDEO, { artist: 'Shakira', title: 'Waka Waka' }), 'strong video stays hot');
assert(isRejectedPickSeed(GENERIC_VIDEO, 'Waka Waka', 'ru', [], 'Shakira'), 'generic video rejected at pick');

const LASTFM_LISTENERS =
  'На Last.fm у «Worst Enemy» (Marino) 52,752 слушателей и 395,224 прослушиваний.';
assert(isRejectedPickSeed(LASTFM_LISTENERS, 'Worst Enemy', 'ru', [], 'Marino'), 'Last.fm playcount rejected at pick');
assert(
  isRejectedStorySeed(LASTFM_LISTENERS, 'Marino', 'Worst Enemy (Original Mix)', [], 'ru'),
  'Last.fm playcount rejected as story seed',
);

// --- 5d. Artist bank pollution: seed must mention performing artist; guests OK ---
const { factMentionsArtistLoose } = await import('../dist/services/fact-relevance.js');
const { lookupCuratedFact } = await import('../dist/services/curated-facts.js');

const CHICAGO_TEACHERS_STRIKE =
  'In September 2012, the Chicago Teachers Union launched a strike that shut down Chicago Public Schools for seven days over teacher evaluations and job security.';
const BEAT_IT_CURATED = lookupCuratedFact('Michael Jackson', 'Beat it');

assert(
  !factMentionsArtistLoose(CHICAGO_TEACHERS_STRIKE, 'Michael Jackson'),
  'Chicago Teachers strike fact must not mention Michael Jackson',
);
assert(
  isRejectedPickSeed(CHICAGO_TEACHERS_STRIKE, 'Beat It', 'ru', [], 'Michael Jackson'),
  'Chicago Teachers strike rejected as MJ seed',
);
assert(
  BEAT_IT_CURATED && factMentionsArtistLoose(BEAT_IT_CURATED.fact, 'Michael Jackson'),
  'Beat It curated fact mentions Michael Jackson',
);
assert(
  BEAT_IT_CURATED && /Van Halen|van halen/i.test(BEAT_IT_CURATED.fact),
  'Beat It curated fact may mention guest Eddie Van Halen',
);
assert(
  !isRejectedPickSeed(BEAT_IT_CURATED?.fact ?? '', 'Beat it', 'ru', [], 'Michael Jackson'),
  'Beat It curated fact passes pick gates',
);

const NIN_CURATED = lookupCuratedFact('Nine Inch Nails', 'Closer');
assert(
  NIN_CURATED && factMentionsArtistLoose(NIN_CURATED.fact, 'Nine Inch Nails'),
  'NIN Closer curated mentions Nine Inch Nails / Reznor',
);
assert(
  !isRejectedPickSeed(NIN_CURATED?.fact ?? '', 'Closer', 'ru', [], 'Nine Inch Nails'),
  'NIN Closer curated passes pick gates',
);

const BOBBY_BIO =
  'Walden Robert Cassotto, known by the stage name Bobby Darin, was an American singer, songwriter, and actor who performed pop, swing, folk, rock and roll and country music.';
assert(
  rejectSeedForTrackStory(BOBBY_BIO, 'Bobby Darin', 'Dream Lover'),
  'Bobby Darin encyclopedia bio rejected for Dream Lover',
);
assert(
  isRejectedPickSeed(BOBBY_BIO, 'Dream Lover', 'ru', [], 'Bobby Darin'),
  'Bobby Darin bio rejected at pick',
);

const STING_WIKI_DEF =
  '"Shape of My Heart" is a song by British musician Sting, released in August 1993 by A&M Records as the fifth single from his fourth solo album, Ten Summoner\'s Tales.';
const STING_COWRITTEN =
  'It was co-written by Dominic Miller, Sting\'s guitarist, which makes it one of the few songs on Ten Summoner\'s Tales that Sting did not write alone.';
const STING_SETLIST =
  '«Shape of My Heart» впервые прозвучала на живом выступлении Sting 02-06-2026 (Howard Stern Radio Program, New York, United States).';
assert(isEncyclopediaDefinitionSeed(STING_WIKI_DEF), 'Sting wiki one-liner is encyclopedia definition');
assert(
  !isEncyclopediaDefinitionSeed(STING_COWRITTEN),
  'Sting co-written genius fact is not encyclopedia definition',
);
const stingPick = pickReferenceFact(
  { trackFacts: [STING_WIKI_DEF, STING_SETLIST, STING_COWRITTEN], artistFacts: [] },
  [],
  0,
  'Sting',
  'Shape Of My Heart',
);
assert(
  stingPick?.fact.includes('co-written') || stingPick?.fact.includes('Dominic Miller'),
  `Sting pick prefers co-written over wiki definition (got: ${stingPick?.fact?.slice(0, 90) ?? 'null'})`,
);
assert(isSetlistLiveDebutSeed(STING_SETLIST), 'setlist live debut detected');
assert(isGenericConcertVenueSeed(STING_SETLIST), 'setlist live debut is generic venue seed');

const RAWFEAR_SETLIST =
  '«RAWFEAR» впервые прозвучала на живом выступлении twenty one pilots 03-04-2026 (American Legion Mall, Indianapolis, United States).';
const RAWFEAR_TEASE =
  'The name "RAWFEAR" was first teased during the Clancy World Tour, before being confirmed as a track title.';
const rawfearPick = pickReferenceFact(
  { trackFacts: [RAWFEAR_SETLIST, RAWFEAR_TEASE], artistFacts: [] },
  [],
  0,
  'twenty one pilots',
  'RAWFEAR',
);
assert(
  rawfearPick?.fact.includes('teased') || rawfearPick?.fact.includes('Clancy'),
  `RAWFEAR pick prefers tease over setlist debut (got: ${rawfearPick?.fact?.slice(0, 90) ?? 'null'})`,
);
assert(
  isRejectedPickSeed(RAWFEAR_SETLIST, 'RAWFEAR', 'ru', [RAWFEAR_TEASE], 'twenty one pilots'),
  'setlist live debut rejected when tease fact in pool',
);
const STING_CURATED = lookupCuratedFact('Sting', 'Shape Of My Heart');
assert(STING_CURATED?.fact.includes('Миллер'), 'Sting Shape Of My Heart curated fact present');

const { resolveScopeOrder } = await import('../dist/services/fact-picker.js');
const { pickFromBank, ingestHarvestFacts } = await import('../dist/services/fact-bank.js');
const { factFingerprint } = await import('../dist/services/fact-bank.js');
assert(
  resolveScopeOrder(1, ['track', 'track']).join(',') === 'artist,album,track',
  'two track scopes rotate to artist first',
);
assert(
  resolveScopeOrder(0, []).join(',') === 'track,album,artist',
  'first story prefers track scope',
);

const TRACK_HIGH =
  "It was co-written by Dominic Miller, Sting's guitarist, which makes it one of the few songs on Ten Summoner's Tales that Sting did not write alone.";
const ARTIST_RESERVE =
  'После распада The Police Sting начал сольную карьеру; к 1993 году на альбоме Ten Summoner\'s Tales он записал «Shape of My Heart» вместе с Домиником Миллером.';
ingestHarvestFacts('Sting', 'Shape Of My Heart', [
  { fact: TRACK_HIGH, scope: 'track', minScore: 6 },
  { fact: ARTIST_RESERVE, scope: 'artist', minScore: 3 },
]);
const bankPickTrackFirst = pickFromBank(
  'Sting',
  'Shape Of My Heart',
  new Set(),
  ['track', 'album', 'artist'],
);
assert(bankPickTrackFirst?.scope === 'track', 'bank default order prefers track');
const trackUsed = new Set([factFingerprint(TRACK_HIGH)]);
const repeatPick = pickReferenceFact(
  {
    trackFacts: [TRACK_HIGH],
    artistFacts: [ARTIST_RESERVE],
  },
  [],
  1,
  'Sting',
  'Shape Of My Heart',
  trackUsed,
  'auto',
  { recentScopes: ['track', 'track'] },
);
assert(
  repeatPick?.scope === 'artist',
  `repeat track scopes prefer artist when track used (got ${repeatPick?.scope ?? 'null'})`,
);

const { isStudioEquipmentCatalogSeed } = await import('../dist/services/reference-fact-quality.js');
const PARALYZER_DISCOGS =
  'Трек «Paralyzer» вошёл в альбом «Them Vs. You Vs. Me»: Recorded and mixed at Groovemaster Studios, Chicago, IL Mastered at Sterling Sound, NYC Finger Eleven Uses: Yamaha Guitars, Gibson Guitars';
const PARALYZER_SCOTT =
  "Finger Eleven's frontman Scott Anderson has said that the single has a feel distinct from their earlier work";
const PARALYZER_AIRPLAY =
  'The song received high airplay in both the United States and Canada, and was performed at many festivals';

assert(isStudioEquipmentCatalogSeed(PARALYZER_DISCOGS), 'Discogs studio gear is catalog junk');
const paralyzerPick = pickReferenceFact(
  { trackFacts: [PARALYZER_DISCOGS, PARALYZER_SCOTT, PARALYZER_AIRPLAY], artistFacts: [] },
  [],
  0,
  'Finger Eleven',
  'Paralyzer',
);
assert(
  paralyzerPick?.fact.includes('Scott Anderson') || paralyzerPick?.fact.includes('airplay'),
  `Paralyzer prefers quote/airplay over Discogs gear (got: ${paralyzerPick?.fact?.slice(0, 90) ?? 'null'})`,
);
assert(
  !paralyzerPick?.fact.includes('Groovemaster'),
  'Paralyzer pick must not be studio gear catalog',
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
