/**
 * Run: npm run build && node scripts/test-tts-sanitize-names.mjs
 */
import { sanitizeScriptForTts } from '../dist/services/story-quality.js';
import {
  restoreLatinNamesForVoiceover,
  shouldStripLatinTrackNames,
} from '../dist/services/tts-generic-script.js';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';
import { splitMixedLanguageForEdge } from '../dist/services/tts-mixed-segments.js';

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
ok(/Блэндер/i.test(vedderOut), 'Blender → Блэндер (э, не е)');
ok(!/Блендер/i.test(vedderOut), 'not wrong Блендер with е');
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

const placeholder =
  'Эта группа когда-то записала хит с гитарным риффом. Этот трек стал визитной карточкой альбома.';
const restored = restoreLatinNamesForVoiceover(placeholder, 'The Offspring', 'Self Esteem');
console.log('restored:', restored);
ok(/The Offspring/i.test(restored), 'placeholder artist → latin');
ok(/Self Esteem/i.test(restored), 'placeholder title → latin');

const sanitizedOn = sanitizeScriptForTts(placeholder, 'The Offspring', 'Self Esteem', [], {
  speakTrackNamesInVoiceover: true,
});
console.log('sanitizedOn:', sanitizedOn);
ok(/The Offspring/i.test(sanitizedOn), 'sanitize speak-on keeps latin artist');
ok(/Self Esteem/i.test(sanitizedOn), 'sanitize speak-on keeps latin title');
ok(!/эта группа/i.test(sanitizedOn), 'sanitize speak-on removes placeholder group');

const edgeMixed = prepareYandexTtsText(placeholder, {
  artist: 'The Offspring',
  title: 'Self Esteem',
  speakTrackNamesInVoiceover: true,
  sentencePauses: false,
});
console.log('edgeMixed:', edgeMixed);
ok(/The Offspring/i.test(edgeMixed), 'Edge mixed prep keeps latin artist');
const segs = splitMixedLanguageForEdge(edgeMixed, 'The Offspring', 'Self Esteem');
ok(segs.some((s) => s.lang === 'en' && /Offspring|Self Esteem/i.test(s.text)), 'Edge EN segment for names');

if (process.exitCode) process.exit(process.exitCode);
console.log('\nAll TTS sanitize name checks passed.');
