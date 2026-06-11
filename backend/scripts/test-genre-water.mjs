/**
 * npm run build && node scripts/test-genre-water.mjs
 */
import { findGenreWater, findWateryContent } from '../dist/services/story-quality.js';

let failed = 0;
function fail(msg) {
  console.error('FAIL:', msg);
  failed++;
}
function ok(msg) {
  console.log('OK:', msg);
}

const fosterWater =
  'Эта группа — история о том, как инди-поп может быть одновременно запоминающимся и глубоким. ' +
  'Их песня — это пример жанра инди-поп, где простая мелодия и текст могут нести глубокий смысл.';
if (!findGenreWater(fosterWater)) fail('Foster-style opener must be genre water');
else ok('Foster-style opener rejected as genre water');

const good =
  'Последний promotional single перед альбомом Supermodel вышел в июле. Марк Foster писал текст, пока пытался уговорить девушку остаться рядом.';
const facts = [
  '“Sit Next to Me” was released on July 17, 2017, as the last promotional single of Foster the People third album Supermodel.',
];
const water = findWateryContent(good, 'Foster The People', 'Sit Next to Me', facts);
if (water) fail(`grounded script rejected: ${water}`);
else ok('fact-grounded script passes water check');

process.exit(failed > 0 ? 1 : 0);
