import { rejectSeedForTrackStory, explainTrackAnchorRejection } from '../dist/services/fact-track-anchor.js';
import { isRejectedStorySeed } from '../dist/services/fact-picker.js';
import { findArtistSeedTrackMisattribution, validateStoryScript } from '../dist/services/story-quality.js';

const claypool =
  'Claypool explained the term "pork soda" was meant to refer to how Primus – a band that, in his eyes, wasn\'t suitable for radio play – was "an acquired taste, like a meat-flavored soda would be"';
const grammy =
  'They received their first Grammy nomination in the Best New Artist category at the 2022 Grammy Awards.';
const mamaStory =
  "Mama's Gun by Glass Animals принёс этому артисту первую номинацию на Grammy в категории Best New Artist. И это в 2022 году — спустя шесть лет после релиза трека.";

const cases = [
  ['pork-soda-primus', claypool, 'Glass Animals', 'Pork Soda', true],
  ['mama-grammy', grammy, 'Glass Animals', "Mama's Gun", true],
];

let failed = 0;
for (const [label, fact, artist, title, shouldReject] of cases) {
  const rej = rejectSeedForTrackStory(fact, artist, title);
  const why = explainTrackAnchorRejection(fact, artist, title);
  const gate = isRejectedStorySeed(fact, artist, title);
  const ok = rej === shouldReject && gate === shouldReject;
  console.log(`${ok ? 'OK' : 'FAIL'} ${label} reject=${rej} why=${why} gate=${gate}`);
  if (!ok) failed++;
}

const mis = findArtistSeedTrackMisattribution(mamaStory, "Mama's Gun", [grammy]);
console.log('misattribution=', mis);
if (!mis) failed++;

const q = validateStoryScript(mamaStory, undefined, 'Glass Animals', "Mama's Gun", {
  referenceFacts: [grammy],
  skipPersonaCliches: true,
  speakTrackNamesInVoiceover: true,
});
console.log('validate Mama story=', q);
if (q.ok || !q.reason.includes('misattributed')) failed++;

process.exit(failed > 0 ? 1 : 0);
