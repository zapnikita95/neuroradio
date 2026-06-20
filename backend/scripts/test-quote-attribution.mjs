import {
  isUnverifiedQuoteAttributionSeed,
  findQuoteSpeakerDrift,
  extractQuoteSpeakerFromFact,
} from '../dist/services/fact-quote-attribution.js';
import { validateStoryScript } from '../dist/services/story-quality.js';

let failed = 0;

const brmcCorpus = [
  'Black Rebel Motorcycle Club — American rock band based in San Francisco.',
  "The band's second album 'Take Them On, On Your Own' featured several songs.",
  'guitarist Peter Hayes and bassist Robert Levon Been formed the group.',
];

const barnesFact =
  'Barnes said of the biker war: "The first time I invaded their clubhouse I had to. They were invading our property".';

if (!isUnverifiedQuoteAttributionSeed(barnesFact, 'Black Rebel Motorcycle Club', brmcCorpus)) {
  console.error('FAIL: Barnes quote should be unverified for BRMC');
  failed++;
} else {
  console.log('OK: Barnes quote rejected for BRMC');
}

const hayesFact = 'Peter Hayes said the track was written in one night after a long tour.';
if (isUnverifiedQuoteAttributionSeed(hayesFact, 'Black Rebel Motorcycle Club', brmcCorpus)) {
  console.error('FAIL: Peter Hayes quote should be grounded');
  failed++;
} else {
  console.log('OK: Peter Hayes quote grounded');
}

const driftScript =
  'Ветеран байкерских войн Питер Хэйс признавался: первый раз они ворвались в чужой клуб. С ночной тишиной такая деталь звучит в точку.';
const drift = findQuoteSpeakerDrift(driftScript, barnesFact);
if (!drift) {
  console.error('FAIL: expected quote speaker drift Barnes→Peter Hayes');
  failed++;
} else {
  console.log('OK: quote speaker drift=', drift);
}

const staleClosing =
  'Трек записали быстро. С такой историей за спиной трек не нуждается в лишних словах.';
const staleQ = validateStoryScript(staleClosing, undefined, 'Artist', 'Song', {
  referenceFacts: ['Song was recorded quickly in 2003.'],
  speakTrackNamesInVoiceover: true,
});
if (staleQ.ok || !/stale radio closing/i.test(staleQ.reason)) {
  console.error('FAIL: stale closing should reject', staleQ);
  failed++;
} else {
  console.log('OK: stale closing rejected');
}

console.log('extractQuoteSpeaker=', extractQuoteSpeakerFromFact(barnesFact));
process.exit(failed > 0 ? 1 : 0);
