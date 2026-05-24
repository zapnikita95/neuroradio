/**
 * Run: npm run build && node scripts/test-top-facts.mtk.mjs
 */
import { fetchReferenceFactBundle } from '../dist/services/wikipedia-facts.js';
import { pickReferenceFact } from '../dist/services/fact-picker.js';
import { isBoringFact, interestScore } from '../dist/services/reference-fact-quality.js';

const artist = 'twenty one pilots';
const title = 'Stressed Out';

const bundle = await fetchReferenceFactBundle(artist, title, 'US');
console.log('=== Raw track facts ===');
bundle.trackFacts.forEach((f, i) => console.log(`${i + 1}. [${interestScore(f)}] ${f.slice(0, 140)}`));
console.log('\n=== Raw artist facts ===');
bundle.artistFacts.forEach((f, i) => console.log(`${i + 1}. [${interestScore(f)}] ${f.slice(0, 140)}`));

const picked = pickReferenceFact(bundle, [], 0);
console.log('\n=== Picked ===');
console.log(picked?.fact);
console.log('boring:', picked ? isBoringFact(picked.fact) : 'n/a');
console.log('score:', picked ? interestScore(picked.fact) : 'n/a');

const lineup =
  'Twenty One Pilots is an American musical duo from Columbus, Ohio, consisting of Tyler Joseph and Josh Dun.';
console.log('\nLineup sentence boring:', isBoringFact(lineup));
