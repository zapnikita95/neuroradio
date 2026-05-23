/**
 * Validates Russian stress dictionary for Yandex TTS.
 * Run: npm run build && node scripts/test-stress.mjs
 */
import { applyRussianStress, RUSSIAN_STRESS } from '../dist/services/russian-stress.js';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';

const MUST_MATCH = {
  инженер: 'инжен+ер',
  инженеры: 'инжен+еры',
  инженером: 'инжен+ером',
  звукорежиссёры: 'звукорежисс+ёры',
  версии: 'верс+ии',
  атлас: 'атл+ас',
  микрофон: 'микроф+он',
  мониторов: 'монит+оров',
};

let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

console.log('=== Critical stress fixes ===');
for (const [word, expected] of Object.entries(MUST_MATCH)) {
  const got = applyRussianStress(word);
  if (got !== expected) {
    fail(`${word}: expected "${expected}", got "${got}"`);
  } else {
    ok(`${word} → ${got}`);
  }
}

console.log('\n=== Groq wrong stress is overwritten ===');
const groqWrong = 'инж+енер потом говорил, звукореж+иссёры краснели';
const fixed = applyRussianStress(groqWrong);
if (fixed.includes('инж+енер')) fail('Groq wrong stress not removed');
if (!fixed.includes('инжен+ер')) fail('Correct stress not applied');
ok(`Fixed: ${fixed}`);

console.log('\n=== Story sample ===');
const sample =
  'Я стоял у мониторов, звукорежиссёры краснели от свиста в колонках, инженер потом говорил, что микрофон еле остыл.';
console.log(prepareYandexTtsText(sample, {}));

console.log('\n=== Dictionary size ===');
ok(`${Object.keys(RUSSIAN_STRESS).length} stress entries`);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll stress checks passed');
