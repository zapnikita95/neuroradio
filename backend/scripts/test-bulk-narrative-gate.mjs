#!/usr/bin/env node
/** Simulate bulk shouldRejectFact on narrative samples. */
import { interestScore, isBoringFact } from '../dist/services/reference-fact-quality.js';
import { isArtistBackstoryNarrative } from '../dist/services/web-snippet-accept.js';
import { isRejectedPickSeed } from '../dist/services/fact-seed-pick.js';
import { rejectSeedForTrackStory } from '../dist/services/fact-track-anchor.js';

function isSongMeaningNarrative(trimmed) {
  return (
    isArtistBackstoryNarrative(trimmed) ||
    (/\b(?:95\s*%|supertax|tax rate|one for you|income tax)\b/i.test(trimmed) &&
      /\b(?:wrote|written|harrison|beatles|taxman|song|protest)\b/i.test(trimmed))
  );
}

function bulkWouldReject(fact, scope = 'artist') {
  const trimmed = fact.trim();
  if (trimmed.length < 35) return 'short';
  if (isBoringFact(trimmed) && !isSongMeaningNarrative(trimmed)) return 'boring';
  if (interestScore(trimmed) < 3) return 'score<3';
  return null;
}

const SAMPLES = [
  ['Call Me Karizma', 'Fire Escape', 'Riz started writing his deeply personal songs at age 12, and later paid his way through college through touring.'],
  ['Alvaro Soler', 'Déjala Que Baile', 'Born in Barcelona to a German father and a Spanish mother, he became multilingual at a young age.'],
  ['Helmut', 'Hunters', 'HELMUT are a blues / rock / metal band from Geneva, Switzerland.'],
  ['Blink-182', 'All The Small Things', 'DeLonge wrote this song about his then-girlfriend and eventual wife, Jenna Jenkins.'],
  ['The Beatles', 'Taxman', 'George Harrison wrote Taxman after learning the UK top rate of income tax could take 95% of the Beatles earnings — one for you, nineteen for me.'],
  ['Whiney', 'Flashlight', 'Whiney\'s underground drum & bass flare has flourished since signing exclusively to Med School.'],
  ['Del Tha Funkee Homosapien', 'Catch a Bad One', 'This is the 2nd song on Del Tha Funkee Homosapien\'s sophomore LP.'],
];

console.log('=== BULK + PICK simulation ===\n');
for (const [artist, title, fact] of SAMPLES) {
  const bulk = bulkWouldReject(fact);
  const pick = isRejectedPickSeed(fact, title, 'ru', [], artist, 'artist');
  const anchor = rejectSeedForTrackStory(fact, artist, title, { trackPoolFacts: [] });
  const narrative = isArtistBackstoryNarrative(fact);
  console.log(`${artist} — ${title}`);
  console.log(`  fact: ${fact.slice(0, 100)}…`);
  console.log(`  narrative=${narrative} score=${interestScore(fact)} bulk=${bulk ?? 'PASS'} pickReject=${pick} anchorReject=${anchor}`);
  console.log('');
}
