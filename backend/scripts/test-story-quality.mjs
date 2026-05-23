/**
 * Run: npm run build && node scripts/test-story-quality.mjs
 */
import { validateStoryScript } from '../dist/services/story-quality.js';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}
function ok(msg) {
  console.log(`OK: ${msg}`);
}

const BAD_LOU_BEGA =
  'Я сидел в студии, где мы собирались по вечерам. Вдруг раздался характерный гитарный рифф «Mambo No. 5» Lou Bega, и я просто забыл обо всем. Музыка может соединить всех нас.';

const BAD_HAWKINS =
  "Сквозь миганье лампочек студии я слышу шепот гитариста. Он подсказывает Screamin' Jay Hawkins, как создать шарм. Эта песня чрезвычайно влияющая на развитие рока.";

const GOOD_SAMPLE =
  'Продюсер взял старый сэмпл Perez Prado — «Mambo No. 5» — и Lou Bega дописал куплеты в студии в Мюнхене. На радио сначала крутили только клубную версию, без списка имён. Потом лейбл вытащил сингл в эфир, и каждый куплет перечислял девушку с другого континента — от Sandra до Marilyn. Именно этот приём сделали главной фишкой трека, а не гитарный рифф, как многие думают сегодня в клубах.';

for (const [label, text] of [
  ['Lou Bega water', BAD_LOU_BEGA],
  ['Hawkins water', BAD_HAWKINS],
]) {
  const val = validateStoryScript(text, '30s', 'Lou Bega', 'Mambo No. 5');
  if (val.ok) {
    fail(`${label} should be rejected`);
  } else {
    ok(`${label} rejected (${val.reason})`);
  }
}

const goodVal = validateStoryScript(GOOD_SAMPLE, '30s', 'Lou Bega', 'Mambo No. 5');
if (!goodVal.ok) {
  fail(`good sample rejected: ${goodVal.reason}`);
} else {
  ok('concrete fact sample accepted');
}

const marked = prepareYandexTtsText('Трек Lou Bega «Mambo No. 5» в студии.', {
  artist: 'Lou Bega',
  title: 'Mambo No. 5',
  sentencePauses: false,
});
if (marked.includes('[[')) fail(`TTS should not wrap Latin in phonemes: ${marked}`);
else if (!marked.includes('Lou Bega')) fail(`Latin artist name lost: ${marked}`);
else if (!marked.includes('ст+удии')) fail(`Cyrillic stress missing: ${marked}`);
else ok(`TTS markup (Cyrillic stress only): ${marked}`);

process.exit(failed > 0 ? 1 : 0);
