/**
 * CMU + G2P phonetic EN→RU for Silero (no letter-by-letter garbage).
 * Run: npm run build && node scripts/test-en-phonetic-ru.mjs
 */
import assert from 'node:assert/strict';
import {
  englishPhraseToRussianPhonetic,
  englishWordToRussianPhonetic,
  englishPhoneticDebug,
  sileroPhoneticToEdge,
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
  assert.match(d.ruEdge, /^пЭ/i, `edge got ${d.ruEdge}`);
  assert.doesNotMatch(d.ruEdge, /\+/);
});

test('Edge phonetic has no plus signs', () => {
  const phrase = englishPhraseToRussianPhonetic('Red Hot Chili Peppers', 'edge');
  assert.doesNotMatch(phrase, /\+/);
  assert.match(phrase, /^рэд хот чили пэпэрз$/i, `got ${phrase}`);
});

test('sileroPhoneticToEdge lowers word caps, keeps stress vowel', () => {
  const edge = sileroPhoneticToEdge('П+эпэрз');
  assert.equal(edge, 'пЭпэрз');
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
  assert.match(phrase, /р\+эд х\+от ч\+или п\+эпэрз/i, `got ${phrase}`);
  assert.doesNotMatch(phrase, /[A-Za-z]/);
});

test('Killing in The Name phrase — function words unstressed', () => {
  const phrase = englishPhraseToRussianPhonetic('Killing in The Name');
  assert.equal(phrase, 'к+илинг ин зэ н+эйм', `got ${phrase}`);
});

test('Rage Against The Machine phrase override', () => {
  const phrase = englishPhraseToRussianPhonetic('Rage Against The Machine');
  assert.equal(phrase, 'р+эйдж аг+энст зэ маш+ин', `got ${phrase}`);
});

test('Stadium Arcadium not G2P garbage', () => {
  const phrase = englishPhraseToRussianPhonetic('Stadium Arcadium');
  assert.equal(phrase, 'ст+эйдиам арк+эйдиам', `got ${phrase}`);
});

test('applyForeignPronunciation clears Latin in story snippet', () => {
  const out = applyForeignPronunciation(
    'Помню Snow от Red Hot Chili Peppers — с Bandcamp.',
    'Red Hot Chili Peppers',
    'Snow',
  );
  assert.doesNotMatch(out, /[A-Za-z]{2,}/);
});

test('Title ot Artist merges without Russian от in phonetic', () => {
  const out = applyForeignPronunciation(
    'Killing in The Name от Rage Against The Machine возглавил чарт.',
    'Rage Against The Machine',
    'Killing in The Name',
  );
  assert.match(out, /к\+илинг ин зэ н\+эйм р\+эйдж аг\+энст зэ маш\+ин/i);
  assert.doesNotMatch(out, /\sот\s+р\+эйдж/i);
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
