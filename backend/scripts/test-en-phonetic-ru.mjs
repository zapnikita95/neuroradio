/**
 * CMU + G2P phonetic EN→RU for Silero (no letter-by-letter garbage).
 * Run: npm run build && node scripts/test-en-phonetic-ru.mjs
 */
import assert from 'node:assert/strict';
import {
  englishWordToRussianPhonetic,
  englishPhraseToRussianPhonetic,
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
  assert.match(phrase, /зэ/i);
  assert.match(phrase, /хит/i);
  assert.doesNotMatch(phrase, /тхе|цо/i);
});

test('Bandcamp phonetic from G2P compound', () => {
  const w = englishWordToRussianPhonetic('Bandcamp');
  assert.match(w, /бэнд/i);
  assert.match(w, /кэмп|камп/i);
  assert.doesNotMatch(w, /[A-Za-z]/);
});

test('Red Hot Chili Peppers phrase', () => {
  const phrase = englishPhraseToRussianPhonetic('Red Hot Chili Peppers');
  assert.match(phrase, /рэд/i);
  assert.match(phrase, /хот|хат/i);
  assert.match(phrase, /чили/i);
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
  assert.match(out, /зэ|хит/i);
});

console.log(`\n[test-en-phonetic-ru] ${passed} passed`);
