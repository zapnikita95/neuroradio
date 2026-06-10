/**
 * Run: npm run build && node scripts/test-artist-pronunciation.mjs
 */
import { lookupArtistPronunciation, applyEnglishArtistPronunciation } from '../dist/services/artist-pronunciation.js';
import { latinPhraseToRussianTts } from '../dist/services/tts-foreign-pronounce.js';
import { cleanTrackTitleForSearch, stripSnippetBoilerplate } from '../dist/services/title-clean.js';

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

ok(lookupArtistPronunciation('XXXTentacion')?.ru.includes('икст'), 'XXXTentacion RU');
ok(lookupArtistPronunciation('s q w o z b a b')?.ru === 'сквозь баб', 'sqwozbab alias RU');
ok(
  applyEnglishArtistPronunciation('New track by XXXTentacion today.', 'XXXTentacion', '').includes('Ex Ex Ex'),
  'XXXTentacion EN in script',
);
ok(
  latinPhraseToRussianTts('sqwozbab') === 'сквозь баб',
  'sqwozbab in TTS dictionary',
);

ok(
  cleanTrackTitleForSearch('Cuppa Tea (Official Music Video)') === 'Cuppa Tea',
  'strip official video paren only',
);
ok(
  cleanTrackTitleForSearch('Song (feat. Drake)') === 'Song (feat. Drake)',
  'keep feat paren',
);

const snippet =
  'EV - Cuppa Tea (Official Music Video) - YouTube. Hailing from Bury St Edmunds.';
ok(
  stripSnippetBoilerplate(snippet).includes('Hailing from') &&
    !stripSnippetBoilerplate(snippet).includes('YouTube'),
  'strip youtube tail from snippet',
);

const artistCount = Object.keys(
  (await import('../dist/data/artist-pronunciation.json', { with: { type: 'json' } })).default.artists,
).length;
ok(artistCount >= 100, `artist dictionary has ${artistCount} entries`);

if (process.exitCode) process.exit(process.exitCode);
console.log('\nAll artist-pronunciation checks passed.');
