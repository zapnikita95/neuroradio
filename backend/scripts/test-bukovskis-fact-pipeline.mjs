/**
 * Regression: Edgars Bukovskis — Last.fm catalog junk must not become seed or ungrounded story.
 * Run: npm run build && node scripts/test-bukovskis-fact-pipeline.mjs
 */
import assert from 'node:assert/strict';
import {
  pickRelaxedSnippetSeed,
  isWeakSnippetSeed,
} from '../dist/services/search-snippet-salvage.js';
import {
  findInventedIndieFiller,
  referenceFactsAreAnchorable,
  findWateryContent,
} from '../dist/services/story-quality.js';
import { isAlbumListingSeed, isListeningStatsFact } from '../dist/services/reference-fact-quality.js';
import { buildYandexSsml } from '../dist/services/tts-yandex-ssml.js';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';

const LASTFM_JUNK =
  'Трек «Alone» исполнителя Edgars Bukovskis на Last.fm указан в альбоме «Alone - Single».';
const HALLUCINATED =
  'Alone — Edgars Bukovskis — трек, который вышел как сингл и сразу привлёк внимание. В нём сочетается минималистичный бит с глубокой эмоциональной подачей. Эта песня — словно разговор с самим собой, отсюда и название. Интересно, что релиз был сделан без громкой рекламной кампании, но слушатели быстро подхватили его.';

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ok ${name}`);
}

console.log('[test-bukovskis-fact-pipeline]');

assert(isAlbumListingSeed(LASTFM_JUNK), 'lastfm album listing detected');
assert(isListeningStatsFact(LASTFM_JUNK), 'lastfm junk is listening stats');
assert(isWeakSnippetSeed(LASTFM_JUNK), 'lastfm junk is weak snippet');
ok('lastfm junk classified');

assert.equal(
  pickRelaxedSnippetSeed([LASTFM_JUNK], 'Edgars Bukovskis', 'Alone'),
  null,
  'relaxed salvage must not pick lastfm catalog',
);
ok('pickRelaxedSnippetSeed rejects lastfm junk');

assert.equal(referenceFactsAreAnchorable([LASTFM_JUNK], 'Edgars Bukovskis', 'Alone'), false);
ok('lastfm junk not anchorable');

assert(findInventedIndieFiller(HALLUCINATED, [LASTFM_JUNK], 'Edgars Bukovskis', 'Alone'));
ok('hallucinated indie script detected');

assert(findWateryContent(HALLUCINATED, 'Edgars Bukovskis', 'Alone', [LASTFM_JUNK]));
ok('hallucinated script is watery');

const marked = prepareYandexTtsText(
  'Alone — Edgars Bukovskis — трек на эфире.',
  { artist: 'Edgars Bukovskis', title: 'Alone', speakTrackNamesInVoiceover: true },
);
const ssml = buildYandexSsml(marked, undefined, 'Edgars Bukovskis');
assert.match(ssml, /Edgars Bukov skees/i);
assert.doesNotMatch(ssml, /Bukovskis/i);
ok('Bukovskis TTS uses phonetic respelling');

const VIBERATE_BIO =
  'Edgars Bukovskis is an electronic music artist hailing from Rezekne, Latvia. Known for his contributions to the dance music scene, he merges catchy beats with engaging melodies.';
const { filterAndRankFacts, interestScore, isBoringFact } = await import(
  '../dist/services/reference-fact-quality.js'
);
const { isArtistIdentityBioSnippet } = await import('../dist/services/web-snippet-accept.js');
assert(isArtistIdentityBioSnippet(VIBERATE_BIO), 'viberate bio is identity snippet');
assert(interestScore(VIBERATE_BIO) >= 4, 'viberate bio scores above boring threshold');
assert(!isBoringFact(VIBERATE_BIO), 'viberate bio not boring');
assert(filterAndRankFacts([VIBERATE_BIO], 2).length === 1, 'viberate bio survives filter');
ok('viberate-style bio passes fact quality gates');

const { lookupCuratedFact } = await import('../dist/services/curated-facts.js');
const { fetchEmergencyFactRescue } = await import('../dist/services/fact-aggregator.js');
const curated = lookupCuratedFact('Edgars Bukovskis', 'Alone');
assert(curated?.fact?.includes('SAPPHIRE'), 'curated fact for Bukovskis Alone');
const rescue = await fetchEmergencyFactRescue('Edgars Bukovskis', 'Alone', [LASTFM_JUNK]);
assert(rescue.bundle.trackFacts.length >= 1, 'emergency rescue uses curated fact');
ok('emergency rescue curated hit for Bukovskis');

console.log(`[test-bukovskis-fact-pipeline] ${passed} passed`);
