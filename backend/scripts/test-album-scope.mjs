import assert from 'node:assert/strict';

const { inferFactScope, buildSelectedReferenceFact } = await import('../dist/services/fact-picker.js');
const { isAlbumPrimaryContextFact } = await import('../dist/services/fact-relevance.js');

const oliverFact =
  '"Jerk" is a song by American singer Oliver Tree, originally released on July 17, 2020, as part of his debut studio album Ugly Is Beautiful.';

assert.equal(isAlbumPrimaryContextFact(oliverFact), true, 'debut album placement');
assert.equal(inferFactScope(oliverFact, 'Oliver Tree', 'Jerk'), 'album', 'Oliver Tree Jerk → album scope');

const built = buildSelectedReferenceFact(oliverFact, 'Oliver Tree', 'Jerk');
assert.equal(built.scope, 'album');
assert.equal(built.scopeLabelRu, 'альбом');

const trackFact =
  'Panic Station was released as the fifth single from their sixth studio album The 2nd Law.';
assert.equal(inferFactScope(trackFact, 'Muse', 'Panic Station'), 'album', 'single from album → album');

console.log('test-album-scope: ok');
