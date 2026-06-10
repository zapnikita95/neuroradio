/**
 * Run: npm run build && node scripts/test-boombox-seed-quality.mjs
 */
import {
  isLyricsPageSeed,
  isWrongEntityDisambiguation,
  isSpeakableReferenceFact,
} from '../dist/services/web-snippet-accept.js';
import { isWeakSelectedFact } from '../dist/services/search-snippet-salvage.js';
import { shouldRunLlmFactHunt } from '../dist/services/story-llm-fact-hunt.js';
import { findUngroundedClaims } from '../dist/services/story-quality.js';

const boomboxSeed =
  'Бумбокс - Хвилюватися немає причин Текст пісні, слова. 2006 - Family бизнес Міні трактори Кентавр🤯ДЕШЕВШЕ';
const wikidataJunk = 'boombox — portable, large stereo cassette recorder with optional radio';
const badScript =
  'Хвилюватися немає причин — трек, который мог бы остаться в тени. Но стал гимном для многих. ' +
  'Андрей Хлывнюк, он же Фагот, просто сыграл на гитаре. Он звучал на митингах.';

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else console.log('OK:', msg);
}

ok(isLyricsPageSeed(boomboxSeed), 'lyrics spam detected');
ok(isWrongEntityDisambiguation(wikidataJunk, 'Бумбокс'), 'wikidata boombox device filtered');
ok(!isSpeakableReferenceFact(boomboxSeed, 'Бумбокс', 'Хвилюватися немає причин'), 'lyrics not speakable seed');

const selected = {
  fact: boomboxSeed,
  scope: 'track',
  scopeLabelRu: 'трек',
  interestScore: 12,
  interestRating: 6,
};
ok(isWeakSelectedFact(selected, 'Бумбокс'), 'weak selected fact rejects lyrics');
ok(
  shouldRunLlmFactHunt(selected, 18, 4, 2, 'Хвилюватися немає причин', 'Бумбокс'),
  'fact hunt runs for lyrics seed',
);

const ungrounded = findUngroundedClaims(badScript, [boomboxSeed]);
ok(ungrounded != null, `ungrounded claims blocked: ${ungrounded ?? 'none'}`);

if (!process.exitCode) console.log('\nBoombox seed quality checks passed.');
