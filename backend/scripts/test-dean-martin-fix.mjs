import {
  rejectSeedForTrackStory,
  explainTrackAnchorRejection,
  isArtistLateLifeHealthFactWithoutTrack,
} from '../dist/services/fact-track-anchor.js';
import { isRejectedStorySeed } from '../dist/services/fact-picker.js';
import { findArtistSeedTrackMisattribution, validateStoryScript } from '../dist/services/story-quality.js';

const surgerySeed =
  'He was told that he would require surgery to prolong his life, but he rejected it.';
const falseStory =
  'Mambo Italiano by Dean Martin — трек, который мог бы никогда не появиться. Врачи настаивали на операции, но артист отказался. Вместо больничной койки — студия, микрофон и этот безумный мамбо. История не про болезнь, а про выбор в пользу музыки. После такого решения трек звучит как манифест.';

let failed = 0;

const rej = rejectSeedForTrackStory(surgerySeed, 'Dean Martin', 'Mambo Italiano');
const why = explainTrackAnchorRejection(surgerySeed, 'Dean Martin', 'Mambo Italiano');
const gate = isRejectedStorySeed(surgerySeed, 'Dean Martin', 'Mambo Italiano');
const health = isArtistLateLifeHealthFactWithoutTrack(surgerySeed, 'Mambo Italiano');
console.log(`seed reject=${rej} why=${why} gate=${gate} health=${health}`);
if (!rej || !gate || !health) failed++;

const mis = findArtistSeedTrackMisattribution(falseStory, 'Mambo Italiano', [surgerySeed]);
console.log('misattribution=', mis);
if (!mis) failed++;

const q = validateStoryScript(falseStory, undefined, 'Dean Martin', 'Mambo Italiano', {
  referenceFacts: [surgerySeed],
  skipPersonaCliches: true,
  speakTrackNamesInVoiceover: true,
});
console.log('validate false story=', q);
if (q.ok || !/misattributed|health/i.test(q.reason)) failed++;

process.exit(failed > 0 ? 1 : 0);
