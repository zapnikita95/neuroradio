/**
 * Smoke test: generic topic keys + cross-source dedup (no track names in keys).
 */
import { classifyFactTopic, factsShareTopicOrOverlap, poolHasTopicDuplicate } from '../dist/services/fact-topic.js';
import { factFitsStoryLanguage, isEnglishOnlyRussianMetaFact } from '../dist/services/fact-language-fit.js';

const cases = [
  {
    fact: 'Nirvana did not attend the 1992 MTV Video Music Awards ceremony.',
    topic: 'award_ceremony',
  },
  {
    fact: 'The song topped the Billboard Hot 100 for two weeks in 1991.',
    topic: 'chart_success',
  },
  {
    fact: 'The music video was directed by Samuel Bayer and premiered on MTV.',
    topic: 'music_video',
  },
  {
    fact: 'The band recorded the track in three weeks at Sound City Studios.',
    topic: 'studio_recording',
  },
  {
    fact: 'Some random sentence with no strong signals.',
    topic: 'misc',
  },
];

let failed = 0;
for (const { fact, topic } of cases) {
  const got = classifyFactTopic(fact);
  if (got !== topic) {
    console.error(`FAIL classify: expected ${topic}, got ${got} for "${fact.slice(0, 60)}..."`);
    failed += 1;
  }
}

const a = 'Kurt Cobain grew tired of playing Smells Like Teen Spirit at live shows.';
const b = 'The band grew tired of performing their biggest hit on tour every night.';
if (!factsShareTopicOrOverlap(a, b)) {
  console.error('FAIL overlap: performer_fatigue paraphrases should match');
  failed += 1;
}

const genius = 'The track was the lead single from their second album Nevermind.';
const lastfm = 'It was released as the opening track on the debut major-label album.';
if (!poolHasTopicDuplicate(genius, [lastfm])) {
  console.error('FAIL pool dedup: album_context paraphrases should match');
  failed += 1;
}

if (classifyFactTopic(genius) === 'nevermind_recording') {
  console.error('FAIL: topic key must not contain track/album names');
  failed += 1;
}

const kinoMeta =
  'Кино (Kino, Russian for "cinema" or "movie") was a Soviet rock band formed by Виктор Цой';
if (!isEnglishOnlyRussianMetaFact(kinoMeta)) {
  console.error('FAIL lang: Kino Russian-for should be EN-only meta');
  failed += 1;
}
if (factFitsStoryLanguage(kinoMeta, 'ru')) {
  console.error('FAIL lang: Kino meta must not fit RU stories');
  failed += 1;
}
if (!factFitsStoryLanguage(kinoMeta, 'en')) {
  console.error('FAIL lang: Kino meta should fit EN stories');
  failed += 1;
}
const coiFact = '«Группу крови» Виктор Цой написал практически без участия остальных музыкантов из «Кино».';
if (!factFitsStoryLanguage(coiFact, 'ru')) {
  console.error('FAIL lang: native RU genius fact should fit RU');
  failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('OK fact-topic: classify + dedup + lang-fit');
