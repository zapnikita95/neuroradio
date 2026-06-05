import {
  factAppliesToRequest,
  factNamesForeignEntity,
  factMentionsArtist,
} from '../dist/services/fact-relevance.js';

const cases = [
  {
    artist: 'Al Bowlly',
    title: 'The Very Thought Of You',
    fact: "The family's original surname was Pauli, which was misspelt as Bowlly; Alick was only able to speak Greek.",
  },
  {
    artist: 'Al Bowlly',
    title: 'The Very Thought Of You',
    fact: 'A blue plaque commemorating Bowlly was installed in November 2013 by English Heritage at Charing Cross Road.',
  },
  {
    artist: 'Zucchero',
    title: 'Guantanamera (Guajira)',
    fact: 'His stage name is the Italian word for sugar, as his primary school teacher used to call him.',
  },
];

for (const { artist, title, fact } of cases) {
  console.log('---', artist);
  console.log('mentions', factMentionsArtist(fact, artist));
  console.log('foreign', factNamesForeignEntity(fact, artist, title, artist, 'indie'));
  console.log('applies', factAppliesToRequest(fact, artist, title, 'artist', 'indie'));
}
