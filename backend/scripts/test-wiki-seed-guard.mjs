/**
 * Wiki salvage guards — wrong artist pages must not become seeds.
 * node scripts/test-wiki-seed-guard.mjs (after npm run build)
 */
import assert from 'node:assert/strict';
import { isWikiBiographyLead } from '../dist/services/reference-fact-quality.js';
import { factMentionsArtistLoose } from '../dist/services/fact-relevance.js';
import { hasActionableSnippets } from '../dist/services/web-snippet-accept.js';

const colinWrong =
  'Colin Vearncombe, known by his stage name Black, was an English singer-songwriter. He emerged from the punk rock music scene and achieved mainstream pop success in the late 1980s, most notably with the 1986 single Wonderful Life, which was an international hit the next year.';

const artist = 'The Hit Co.';

assert.ok(isWikiBiographyLead(colinWrong), 'Colin bio detected as biography lead');
assert.ok(!factMentionsArtistLoose(colinWrong, artist), 'Colin bio must not mention The Hit Co.');

const orchard = 'Provided to YouTube by The Orchard EnterprisesMy';
assert.ok(
  !hasActionableSnippets([orchard], artist, 'My Favorite Game'),
  'YouTube Orchard junk is not actionable',
);

console.log('[test-wiki-seed-guard] ok');
