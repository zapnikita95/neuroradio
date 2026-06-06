import { isMisattributedBandTrackFact } from '../dist/services/fact-relevance.js';
import { pickReferenceFact } from '../dist/services/fact-picker.js';

const bad =
  'For the first time, the band recorded a song not written by Thomas.';
const title = 'Lonely No More';

console.log('misattributed:', isMisattributedBandTrackFact(bad, title));

const picked = pickReferenceFact(
  {
    trackFacts: [bad, 'After flirting with the idea of allowing other band members to provide songs, they chose to record Lonely No More.'],
    artistFacts: [],
  },
  [],
  0,
  'Rob Thomas',
  title,
);
console.log('picked:', picked?.fact?.slice(0, 100) ?? 'none');
