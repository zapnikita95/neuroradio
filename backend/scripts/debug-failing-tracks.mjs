import 'dotenv/config';
import { fetchReferenceFactBundle } from '../dist/services/wikipedia-facts.js';
import { filterAndRankFacts, interestScore, isBoringFact } from '../dist/services/reference-fact-quality.js';

const failing = [
  ['The Subways', 'Rock & Roll Queen', 'GB'],
  ['Queen', 'Bohemian Rhapsody', 'GB'],
  ['Nirvana', 'Smells Like Teen Spirit', 'US'],
  ["Screamin' Jay Hawkins", 'I Put a Spell on You', 'US'],
];

for (const [artist, title, cc] of failing) {
  await new Promise((r) => setTimeout(r, 800));
  const b = await fetchReferenceFactBundle(artist, title, cc);
  console.log(`\n=== ${artist} — ${title} ===`);
  console.log('track raw:', b.trackFacts.length, 'artist raw:', b.artistFacts.length);
  const all = [...b.trackFacts, ...b.artistFacts];
  all.slice(0, 5).forEach((f, i) =>
    console.log(`  raw${i + 1} [${interestScore(f)} boring=${isBoringFact(f)}] ${f.slice(0, 100)}…`),
  );
  console.log('ranked:', filterAndRankFacts(all));
}
