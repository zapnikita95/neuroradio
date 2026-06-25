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

console.log(`[test-bukovskis-fact-pipeline] ${passed} passed`);
