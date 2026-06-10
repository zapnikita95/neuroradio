/**
 * German phonetics for Silero/Edge-RU and de-DE SSML detection tests.
 * Run: npm run build && node scripts/test-de-phonetic-ru.mjs
 */
import assert from 'node:assert/strict';
import {
  germanPhraseToRussianPhonetic,
  germanWordToRussianPhonetic,
} from '../dist/services/de-phonetic-ru.js';
import { applyForeignPronunciation } from '../dist/services/tts-foreign-pronounce.js';
import { prepareSileroTtsText } from '../dist/services/tts-markup.js';
import { buildYandexSsml } from '../dist/services/tts-yandex-ssml.js';
import { detectForeignLang, detectLatinLangCode, isKnownGermanPhrase } from '../dist/services/tts-foreign-lang.js';

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}:`, err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

console.log('[test-de-phonetic-ru]');

test('Rammstein — German stress, not English', () => {
  const ru = germanPhraseToRussianPhonetic('Rammstein');
  assert.match(ru, /р\+?ам/i, `got ${ru}`);
  assert.match(ru, /шт/i, `got ${ru}`);
  assert.doesNotMatch(ru, /[A-Za-z]/);
});

test('Du hast — German phrase override', () => {
  const ru = germanPhraseToRussianPhonetic('Du hast');
  assert.match(ru, /д\+?у/i, `got ${ru}`);
  assert.match(ru, /х\+?аст/i, `got ${ru}`);
  assert.doesNotMatch(ru, /[A-Za-z]/);
});

test('Engel — not English angel', () => {
  const ru = germanWordToRussianPhonetic('Engel');
  assert.match(ru, /\+?энг/i, `got ${ru}`);
  assert.doesNotMatch(ru, /[A-Za-z]/);
});

test('Deutschland — German not English', () => {
  const ru = germanPhraseToRussianPhonetic('Deutschland');
  assert.match(ru, /д\+?ойч/i, `got ${ru}`);
});

test('detectForeignLang: Rammstein → de', () => {
  assert.equal(detectForeignLang('Rammstein'), 'de');
  assert.equal(detectForeignLang('Du hast'), 'de');
  assert.equal(detectLatinLangCode('Rammstein'), 'de-DE');
});

test('detectForeignLang: Red Hot Chili Peppers → en', () => {
  assert.equal(detectForeignLang('Red Hot Chili Peppers'), 'en');
  assert.equal(detectLatinLangCode('Michael Jackson'), 'en-US');
});

test('isKnownGermanPhrase covers Rammstein discography sample', () => {
  for (const t of ['Sonne', 'Ich will', 'Mein Herz brennt', 'Keine Lust', 'Feuer frei']) {
    assert.equal(isKnownGermanPhrase(t), true, t);
  }
});

test('Yandex SSML uses de-DE for Rammstein (merged title by artist)', () => {
  const ssml = buildYandexSsml('Трек Du hast от Rammstein — хит.');
  assert.match(ssml, /xml:lang="de-DE">Du hast by Rammstein<\/lang>/i);
  assert.doesNotMatch(ssml, /xml:lang="en-US">Rammstein/i);
});

test('applyForeignPronunciation clears Latin for Rammstein story', () => {
  const out = applyForeignPronunciation(
    'Du hast от Rammstein — Neue Deutsche Härte.',
    'Rammstein',
    'Du hast',
  );
  assert.doesNotMatch(out, /[A-Za-z]{2,}/);
  assert.match(out, /д\+?у/i);
  assert.match(out, /р\+?ам/i);
});

test('prepareSileroTtsText pure Cyrillic for German track', () => {
  const out = prepareSileroTtsText('Engel от Rammstein звучит мощно.', {
    artist: 'Rammstein',
    title: 'Engel',
  });
  assert.doesNotMatch(out, /[A-Za-z]{2,}/);
  assert.match(out, /\+?энг/i);
});

console.log(`\n[test-de-phonetic-ru] ${passed} passed`);
