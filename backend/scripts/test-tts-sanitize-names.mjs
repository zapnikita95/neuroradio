/**
 * Run: npm run build && node scripts/test-tts-sanitize-names.mjs
 */
import { sanitizeScriptForTts } from '../dist/services/story-quality.js';
import { shouldStripLatinTrackNames } from '../dist/services/tts-generic-script.js';

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

ok(shouldStripLatinTrackNames('Eddie Vedder') === true, 'latin artist strip eligible');
ok(shouldStripLatinTrackNames('Король и Шут') === false, 'cyrillic artist never strip');
ok(shouldStripLatinTrackNames('Лагерная Пыль') === false, 'cyrillic title never strip');
ok(shouldStripLatinTrackNames('DJ Гром') === false, 'mixed cyrillic artist never strip');

const vedder =
  'Jonah Weiner из Blender назвал песней, где завораживающий вокал у костра. ' +
  'Eddie Vedder здесь не просто поёт — он проводит ритуал. В No Ceiling — только бесконечность.';
const vedderOut = sanitizeScriptForTts(vedder, 'Eddie Vedder', 'No Ceiling', [], {
  speakTrackNamesInVoiceover: false,
});
console.log('vedderOut:', vedderOut);
ok(!/Jonah Weiner/i.test(vedderOut), 'Jonah Weiner transliterated');
ok(/Джон\s+Вайнер/i.test(vedderOut), 'Джон Вайнер present');
ok(/Блендер/i.test(vedderOut), 'Blender → Блендер');
ok(!/Eddie Vedder/i.test(vedderOut), 'latin artist removed when names off');
ok(!/No Ceiling/i.test(vedderOut), 'latin title removed when names off');
ok(!/здесь не просто поёт/i.test(vedderOut), 'no broken здесь поёт');
ok(!/\bВ\s+нет\s+потолка\b/i.test(vedderOut), 'no broken В нет потолка');
ok(/[а-яё]/i.test(vedderOut), 'output is Russian');

const ruArtist =
  'Лагерная Пыль от Король и Шут — редкий трек из девяностых. ' +
  'Лагерная Пыль тогда звучала на каждом концерте.';
const ruOut = sanitizeScriptForTts(ruArtist, 'Король и Шут', 'Лагерная Пыль', [], {
  speakTrackNamesInVoiceover: false,
});
console.log('ruOut:', ruOut);
ok(ruOut.includes('Лагерная Пыль'), 'cyrillic title kept');
ok(ruOut.includes('Король и Шут'), 'cyrillic artist kept');

if (process.exitCode) process.exit(process.exitCode);
console.log('\nAll TTS sanitize name checks passed.');
