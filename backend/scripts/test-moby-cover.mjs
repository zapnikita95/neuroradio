import { assessCoverSituation } from '../dist/services/cover-policy.js';
import { factMentionsArtist, factMentionsTitle, factNamesForeignEntity } from '../dist/services/fact-relevance.js';

const artist = 'Moby';
const title = 'Lift Me Up (2006 Digital Remaster)';
const fact =
  "To appear that Instinct had more artists, Moby's early singles were put out under several names such as Voodoo Child, Barracuda, and Brainstorm.";
const seed = {
  fact,
  scope: 'track',
  scopeLabelRu: 'трек',
  interestScore: 17,
  interestRating: 7,
};
const bundle = {
  trackFacts: [fact],
  artistFacts: [
    'In 2016, he said of his sobriety: Since I stopped and reoriented myself towards things that matter.',
  ],
};

console.log('mentionsArtist', factMentionsArtist(fact, artist));
console.log('mentionsTitle', factMentionsTitle(fact, title));
console.log('foreign', factNamesForeignEntity(fact, artist, title));
console.log('result', assessCoverSituation(artist, title, seed, bundle));
