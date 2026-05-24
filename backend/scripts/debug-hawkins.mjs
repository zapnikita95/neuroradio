import { fetchReferenceFactBundle } from '../dist/services/wikipedia-facts.js';
import { pickReferenceFact } from '../dist/services/fact-picker.js';
import { filterAndRankFacts } from '../dist/services/reference-fact-quality.js';

const b = await fetchReferenceFactBundle("Screamin' Jay Hawkins", 'I Put a Spell on You', 'US');
console.log('track', b.trackFacts);
console.log('artist', b.artistFacts);
console.log('ranked', filterAndRankFacts([...b.trackFacts, ...b.artistFacts]));
console.log('pick', pickReferenceFact(b, [], 0));
