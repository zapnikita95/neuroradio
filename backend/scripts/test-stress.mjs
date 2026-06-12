/**
 * Validates Russian stress dictionary for Yandex TTS.
 * Run: npm run build && node scripts/test-stress.mjs
 */
import { applyRussianStress, applyRussianStressSafe, RUSSIAN_STRESS } from '../dist/services/russian-stress.js';
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

console.log('\n=== nu metal pronunciation ===');
const nuSamples = {
  'мостом между ну-металом и поп-музыкой': 'ню м+еталом',
  'стиль ню метала': 'ню м+етала',
  'от ну-металу к попу': 'ню м+еталу',
};
for (const [input, needle] of Object.entries(nuSamples)) {
  const got = applyRussianStressSafe(input);
  if (!got.includes(needle)) {
    fail(`nu metal "${input}": expected "${needle}" in "${got}"`);
  } else {
    ok(`${input} → …${needle}…`);
  }
}

console.log('\n=== Metal genre TTS (Yandex pipeline) ===');
const metalSamples = {
  'смешала электронику и дэт-метал так': 'дэт-м+етал',
  'стиль ню метала': 'ню м+етала',
  'мостом ню-металом и попом': 'ню м+еталом',
  'мостом между ну-металом и поп-музыкой': 'попмузыкой',
  'В те годы nu-метал был на пике': 'ню м+етал',
  'жанр метал рок': 'м+етал р+ок',
  'заядлые металлисты чесали': 'металлисты',
  'стены из металла': 'мет+алла',
};
for (const [input, needle] of Object.entries(metalSamples)) {
  const got = prepareYandexTtsText(input, {});
  if (!got.includes(needle)) {
    fail(`metal "${input}": expected "${needle}" in "${got}"`);
  } else {
    ok(`${input} → ${got}`);
  }
}

console.log('\n=== Dictionary size ===');
ok(`${Object.keys(RUSSIAN_STRESS).length} stress entries`);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll stress checks passed');
