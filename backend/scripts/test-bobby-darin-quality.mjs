#!/usr/bin/env node
import { validateGeneratedStory, qualityOptionsForProductionAttempt, finalizeAfterQualityLoop } from '../dist/services/story-generate-loop.js';
import { findUngroundedClaims } from '../dist/services/story-quality.js';
import { rejectSeedForTrackStory, isArtistCareerBioWithoutTrack } from '../dist/services/fact-track-anchor.js';
import { isRejectedPickSeed } from '../dist/services/fact-seed-pick.js';

const bioSeed =
  'Walden Robert Cassotto, known by the stage name Bobby Darin, was an American singer, songwriter, and actor who performed pop, swing, folk, rock and roll and country music.';
const goodSeed =
  "Бобби Дарин написал 'Dream Lover' в 1959 году; песня поднялась на второе место в Billboard.";
const script =
  'Dream Lover by Bobby Darin — это трек, который артист написал за одну ночь, когда не мог уснуть. Мы тогда и не подозревали, что эта лёгкая мелодия станет одним из главных хитов эпохи. Помню, как она звучала из каждого радиоприёмника — этот непринуждённый вокал, будто Bobby просто решил поделиться с миром своей бессонницей. А ведь он действительно записал демо на портативный магнитофон среди ночи, а утром принёс его в студию. В те годы такие истории казались чем-то невероятным — когда хит рождается не в результате долгих сессий, а почти случайно, из бессонного вдохновения. И хотя сам артист позже говорил, что не считал эту песню чем-то особенным, именно она стала его визитной карточкой. Теперь ясно, почему её до сих пор крутят на ретро-волнах.';

let failed = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('OK:', msg);
  }
}

ok(isArtistCareerBioWithoutTrack(bioSeed, 'Dream Lover'), 'encyclopedia bio detected without track');
ok(rejectSeedForTrackStory(bioSeed, 'Bobby Darin', 'Dream Lover'), 'bio seed rejected for track story');
ok(isRejectedPickSeed(bioSeed, 'Dream Lover', 'ru', [], 'Bobby Darin'), 'bio seed rejected at pick');
ok(!rejectSeedForTrackStory(goodSeed, 'Bobby Darin', 'Dream Lover'), 'track-narrative seed kept');

const ungrounded = findUngroundedClaims(script, [bioSeed]);
ok(ungrounded != null, `hallucinated script rejected (${ungrounded ?? 'none'})`);

const opts = qualityOptionsForProductionAttempt([bioSeed], 'ru');
opts.speakTrackNamesInVoiceover = true;
const q = validateGeneratedStory(script, '30s', 'Bobby Darin', 'Dream Lover', opts);
ok(!q.ok, `validate rejects insomnia legend (${q.reason ?? 'ok'})`);

const fin = finalizeAfterQualityLoop(
  { script },
  { artist: 'Bobby Darin', title: 'Dream Lover', speakTrackNamesInVoiceover: true },
  (x) => x,
  [bioSeed],
);
ok(fin == null, 'finalize rejects fabricated contemporary script');

process.exit(failed === 0 ? 0 : 1);
