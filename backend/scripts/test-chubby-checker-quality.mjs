#!/usr/bin/env node
import { validateGeneratedStory, qualityOptionsForProductionAttempt, finalizeAfterQualityLoop } from '../dist/services/story-generate-loop.js';
import { storyMentionsPerformingArtist } from '../dist/services/fact-relevance.js';

const seed =
  'Родился как Эрнест Эванс, но стал известен под псевдонимом Чубби Чекер, который привёл к скандалу из-за расовых предрассудков, когда его танцевальная песня «Slow Twistin» получила широкое признание в белых клубах, тогда как оригинальная версия была отвергнута.';
const script =
  'Эта песня взорвала белые клубы, хотя оригинальная версия была отвергнута. В те годы её танцевальный ритм стал хитом. Именно из-за этого он и остался в памяти, а не только в чартах.';

let failed = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('OK:', msg);
  }
}

ok(storyMentionsPerformingArtist(script, 'Chubby Checker', 'Slow Twistin'), 'он counts as Chubby Checker mention');
ok(
  storyMentionsPerformingArtist(
    'Версия Чубби Чекера пошла в рост в белых клубах.',
    'Chubby Checker',
    'Slow Twistin',
  ),
  'Чубби Чекер counts as mention',
);

const opts = qualityOptionsForProductionAttempt([seed], 'ru');
opts.speakTrackNamesInVoiceover = true;
const q = validateGeneratedStory(script, '30s', 'Chubby Checker', 'Slow Twistin', opts);
ok(q.ok, `validate with speak_track_names ON (${q.ok ? 'ok' : q.reason})`);

const fin = finalizeAfterQualityLoop(
  { script },
  { artist: 'Chubby Checker', title: 'Slow Twistin', speakTrackNamesInVoiceover: true },
  (x) => x,
  [seed],
);
ok(fin != null, 'finalize accepts contemporary script with он');

process.exit(failed === 0 ? 0 : 1);
