/**
 * CMU + G2P phonetic EN→RU for Silero (no letter-by-letter garbage).
 * Run: npm run build && node scripts/test-en-phonetic-ru.mjs
 */
import assert from 'node:assert/strict';
import {
  englishPhraseToRussianPhonetic,
  englishWordToRussianPhonetic,
  englishPhoneticDebug,
} from '../dist/services/en-phonetic-ru.js';
import { applyForeignPronunciation } from '../dist/services/tts-foreign-pronounce.js';
import { prepareSileroTtsText } from '../dist/services/tts-markup.js';

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

console.log('[test-en-phonetic-ru]');

test('The Hit Co. is not Тхе Хит Цо', () => {
  const phrase = englishPhraseToRussianPhonetic('The Hit Co.');
  assert.match(phrase, /з/i);
  assert.match(phrase, /х\+?и/i);
  assert.doesNotMatch(phrase, /тхе|цо/i);
});

test('English stress: Peppers on first syllable (PEP-pers)', () => {
  const d = englishPhoneticDebug('Peppers');
  assert.match(d.ru, /\+/, `got ${d.ru}`);
  assert.match(d.ru, /^п\+э/i, `got ${d.ru}`);
  assert.match(d.ru, /эр/i, `got ${d.ru}`);
  assert.doesNotMatch(d.ru, /пеп\+/i);
  assert.doesNotMatch(d.ru, /[A-Za-z]/);
  assert.match(d.ruEdge, /^ПЭ/i, `edge got ${d.ruEdge}`);
  assert.doesNotMatch(d.ruEdge, /\+/);
});

test('Edge phonetic has no plus signs', () => {
  const phrase = englishPhraseToRussianPhonetic('Red Hot Chili Peppers', 'edge');
  assert.doesNotMatch(phrase, /\+/);
  assert.match(phrase, /Э/);
});

test('English stress: Queen', () => {
  const ru = englishWordToRussianPhonetic('Queen');
  assert.match(ru, /\+/, `got ${ru}`);
});

test('English stress: Chili', () => {
  const ru = englishWordToRussianPhonetic('Chili');
  assert.match(ru, /\+/, `got ${ru}`);
  assert.match(ru, /^ч\+и/i, `got ${ru}`);
});

test('Bandcamp phonetic from G2P compound', () => {
  const w = englishWordToRussianPhonetic('Bandcamp');
  assert.match(w, /б\+?э/i);
  assert.match(w, /к\+?э|камп/i);
  assert.doesNotMatch(w, /[A-Za-z]/);
});

test('Red Hot Chili Peppers phrase', () => {
  const phrase = englishPhraseToRussianPhonetic('Red Hot Chili Peppers');
  assert.match(phrase, /р\+?э/i);
  assert.match(phrase, /х\+?о/i);
  assert.match(phrase, /ч\+?и/i);
  assert.doesNotMatch(phrase, /[A-Za-z]/);
});

test('applyForeignPronunciation clears Latin in story snippet', () => {
  const out = applyForeignPronunciation(
    'Помню Snow от Red Hot Chili Peppers — с Bandcamp.',
    'Red Hot Chili Peppers',
    'Snow',
  );
  assert.doesNotMatch(out, /[A-Za-z]{2,}/);
});

test('prepareSileroTtsText pure Cyrillic', () => {
  const out = prepareSileroTtsText(
    'The Hit Co. — группа, трек My Favorite Game.',
    { artist: 'The Hit Co.', title: 'My Favorite Game' },
  );
  assert.doesNotMatch(out, /[A-Za-z]{2,}/);
  assert.match(out, /з|х\+?и/i);
});

console.log(`\n[test-en-phonetic-ru] ${passed} passed`);
