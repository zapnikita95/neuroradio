#!/usr/bin/env node
import {
  isMusicVideoContentSeed,
  isThinReleaseCatalogSeed,
  isRecordingBackstorySeed,
  interestScore,
} from '../dist/services/reference-fact-quality.js';
import { isRejectedPickSeed } from '../dist/services/fact-seed-pick.js';
import { shouldRunLlmFactHunt } from '../dist/services/story-llm-fact-hunt.js';

const THIN =
  'The song was released in Sweden as a digital download on 27 May 2017 as the second single from their debut studio album';
const MV =
  'The music video was shot on a VHS camcorder and features a fight emerging at a house party before the battery runs out';
const VOCALS =
  'Kristoffer Fogelmark provided uncredited vocals on the track, which Axwell and Ingrosso recorded during sessions for their debut duo album';

let failed = 0;
function assert(label, cond) {
  if (!cond) {
    console.error(`❌ ${label}`);
    failed += 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

assert('thin release catalog', isThinReleaseCatalogSeed(THIN));
assert('MV blocked', isMusicVideoContentSeed(MV));
assert('uncredited vocals = backstory', isRecordingBackstorySeed(VOCALS));
assert('vocals score > thin score', interestScore(VOCALS) > interestScore(THIN));
assert('album-scope thin rejected', isRejectedPickSeed(THIN, 'More Than You Know', 'ru', [], 'Axwell & Ingrosso', 'album'));
assert('MV rejected for pick', isRejectedPickSeed(MV, 'More Than You Know', 'ru', [], 'Axwell & Ingrosso', 'track'));

const thinSelected = {
  fact: THIN,
  scope: 'album',
  scopeLabelRu: 'альбом',
  interestScore: interestScore(THIN),
  interestRating: 6,
};
assert(
  'fact-hunt runs on thin seed',
  shouldRunLlmFactHunt(thinSelected, 5, 3, 1, 'More Than You Know', 'Axwell & Ingrosso'),
);

if (failed > 0) {
  console.error(`\nFAIL ${failed}`);
  process.exit(1);
}
console.log('\nPASS seed quality gates');
