import { pickReferenceFact, isStrongBundleFallbackFact } from '../dist/services/fact-picker.js';
import { factMentionsOtherTrackTitle } from '../dist/services/fact-relevance.js';
import { interestScore, isEncyclopediaDefinitionSeed } from '../dist/services/reference-fact-quality.js';
import { isTrackTitleAnchoredSeed } from '../dist/services/fact-track-anchor.js';
import { isRejectedPickSeed } from '../dist/services/fact-seed-pick.js';

const notOkBundle = {
  trackFacts: [
    'The song was released via Capitol Records on 12 April 2018, as the second single from their third studio album of the same name.',
    'On Last.fm NOT OK has 131103 listeners.',
  ],
  artistFacts: [],
};
const notOkPick = pickReferenceFact(
  notOkBundle,
  [],
  0,
  '5 Seconds of Summer',
  'NOT OK',
  new Set(),
  'fan',
  { storyLanguage: 'ru' },
);
console.log('NOT OK pick:', notOkPick?.fact?.slice(0, 90), 'score', notOkPick?.interestScore);

const psychoFact =
  '"Psycho Killer" is a song by Talking Heads from their 1977 album "Talking Heads: 77", written by David Byrne.';
console.log('PK score', interestScore(psychoFact));
console.log('PK encyclopedia', isEncyclopediaDefinitionSeed(psychoFact));
console.log('PK anchored', isTrackTitleAnchoredSeed(psychoFact, 'Psycho Killer'));
console.log(
  'PK rejected',
  isRejectedPickSeed(psychoFact, 'Psycho Killer', 'en', [psychoFact], 'Talking Heads', 'track'),
);

const psychoBundle = {
  trackFacts: [psychoFact],
  artistFacts: [
    'Record World said of the lead single "Uh-Oh, Love Comes to Town" that it is an r&b-based song with interesting steel drum work.',
  ],
};
const psychoPick = pickReferenceFact(
  psychoBundle,
  [],
  0,
  'Talking Heads',
  'Psycho Killer',
  new Set(),
  'radio_host',
  { storyLanguage: 'en' },
);
console.log('Psycho pick:', psychoPick?.fact?.slice(0, 90));

const uhOhOther = factMentionsOtherTrackTitle(psychoBundle.artistFacts[0], 'Psycho Killer');
console.log('Uh-Oh is other track:', uhOhOther);

const backstageBlocked = !isStrongBundleFallbackFact(
  'They headlined the Monterey Pop Festival (1967), Woodstock (1969).',
  'Jefferson Airplane',
  'Somebody to Love',
  'backstage',
);
console.log('Monterey backstage fallback blocked:', backstageBlocked);

const joyFact =
  'Following Ian Curtis\'s death in May 1980, it was re-released as a 12" single by Factory Records in September with "She\'s Lost Control" as the B-side to "Atmosphere".';
const joyOther = factMentionsOtherTrackTitle(joyFact, "She's Lost Control (2007 Remaster)");
console.log('Joy Division Atmosphere bleed:', joyOther);
console.log(
  'Joy seed rejected',
  isRejectedPickSeed(
    joyFact,
    "She's Lost Control (2007 Remaster)",
    'en',
    [joyFact],
    'Joy Division',
    'artist',
  ),
);
