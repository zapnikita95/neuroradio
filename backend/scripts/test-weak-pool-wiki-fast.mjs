import assert from 'node:assert/strict';

const { isListeningStatsFact, isDiscogsPackagingSeed } = await import(
  '../dist/services/reference-fact-quality.js'
);
const { pickSalvageSnippetSeed, isWeakSelectedFact } = await import(
  '../dist/services/search-snippet-salvage.js'
);
const { buildSelectedReferenceFact } = await import('../dist/services/fact-picker.js');

const lastfm =
  'На Last.fm у «CONCRETE JUNGLE» (Bad Omens) 177,942 слушателей и 3,270,435 прослушиваний.';
assert.equal(isListeningStatsFact(lastfm), true);

const packaging = 'Gatefold, includes digital download card and hype sticker.';
assert.equal(isDiscogsPackagingSeed(packaging), true);

const salvage = pickSalvageSnippetSeed(
  [lastfm, packaging, 'Bad Omens are an American metalcore band from Richmond, Virginia.'],
  'Bad Omens',
  'CONCRETE JUNGLE',
);
assert.equal(salvage, null, 'salvage must not pick Last.fm stats');

const panicWiki =
  '"Panic Station" is a song by English rock band Muse, released as the fifth single from their sixth studio album The 2nd Law on 31 May 2013.';
const panicSeed = buildSelectedReferenceFact(panicWiki, 'Muse', 'Panic Station');
assert.equal(
  isWeakSelectedFact(panicSeed, 'Muse', 'Panic Station'),
  false,
  'concrete release wiki line is a valid seed',
);

console.log('test-weak-pool-wiki-fast: ok');
