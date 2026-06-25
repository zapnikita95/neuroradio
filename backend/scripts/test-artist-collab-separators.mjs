#!/usr/bin/env node
/** Collab artist tag parsing — separator research regression. */
import {
  collaboratorNames,
  isLikelyMultiArtistTag,
  normalizeCollabArtistTag,
  primaryArtistName,
} from '../dist/services/artist-primary.js';

const CASES = [
  { artist: 'Axwell /\\ Ingrosso', expectCollabs: ['Axwell', 'Ingrosso'], multi: true },
  { artist: 'Axwell Λ Ingrosso', expectCollabs: ['Axwell', 'Ingrosso'], multi: true },
  { artist: 'Yolanda Be Cool vs Dcup', expectCollabs: ['Yolanda Be Cool', 'Dcup'], multi: true },
  { artist: 'Swedish House Mafia vs. Tinie Tempah', expectCollabs: 2, multi: true },
  { artist: 'Chloe x Halle', expectCollabs: ['Chloe', 'Halle'], multi: true },
  { artist: 'NIIKO X SWAE', expectCollabs: ['NIIKO', 'SWAE'], multi: true },
  { artist: 'Simon & Garfunkel', expectCollabs: ['Simon', 'Garfunkel'], multi: true },
  { artist: 'GUMS feat. Sir Samuel', expectCollabs: ['GUMS', 'Sir Samuel'], multi: true },
  { artist: 'Miksu / Macloud', expectCollabs: ['Miksu', 'Macloud'], multi: true },
  { artist: 'Dan + Shay', expectCollabs: ['Dan', 'Shay'], multi: true },
  { artist: 'Hamilton Leithauser + Rostam', expectCollabs: 2, multi: true },
  { artist: 'Tom Petty and the Heartbreakers', expectCollabs: 1, multi: false },
  { artist: 'Earth, Wind & Fire', expectCollabs: 1, multi: false },
  { artist: 'Florence + The Machine', expectCollabs: 1, multi: false },
  { artist: '10 Ft. Ganja Plant', expectCollabs: 1, multi: false },
  { artist: 'C+C Music Factory', expectCollabs: 1, multi: false },
  { artist: 'Blond:ish', expectCollabs: 1, multi: false },
  { artist: 'M|O|O|N', expectCollabs: 1, multi: false },
  { artist: 'Yusuf / Cat Stevens', expectCollabs: 2, multi: true },
];

let failed = 0;

console.log('Artist collab separator tests\n');

for (const { artist, expectCollabs, multi } of CASES) {
  const collabs = collaboratorNames(artist);
  const norm = normalizeCollabArtistTag(artist);
  const primary = primaryArtistName(artist);
  const isMulti = isLikelyMultiArtistTag(artist);

  let ok = true;
  if (typeof expectCollabs === 'number') {
    if (collabs.length !== expectCollabs) ok = false;
  } else if (JSON.stringify(collabs) !== JSON.stringify(expectCollabs)) {
    ok = false;
  }
  if (isMulti !== multi) ok = false;

  const mark = ok ? '✓' : '❌';
  if (!ok) failed += 1;
  console.log(
    `${mark} ${JSON.stringify(artist)} → [${collabs.join(' | ')}] norm="${norm}" primary="${primary}" multi=${isMulti}`,
  );
}

if (failed > 0) {
  console.error(`\nFAIL ${failed} case(s)`);
  process.exit(1);
}
console.log('\nPASS — all collab separator cases');
