/**
 * German music phonetics for TTS (Rammstein, de-DE SSML, Cyrillic fallback).
 * Run: npm run build && node scripts/test-de-phonetic.mjs
 */
import assert from 'node:assert/strict';
import { germanPhraseToRussianPhonetic } from '../dist/services/de-phonetic-ru.js';
import { detectForeignLang, detectLatinLangCode } from '../dist/services/tts-foreign-lang.js';
import { applyForeignPronunciation } from '../dist/services/tts-foreign-pronounce.js';
import { buildYandexSsml } from '../dist/services/tts-yandex-ssml.js';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';
import { splitMixedLanguageForSilero } from '../dist/services/tts-silero-segments.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok: ${name}`);
}

console.log('[test-de-phonetic]');

test('Rammstein → Cyrillic phonetic', () => {
  const ru = germanPhraseToRussianPhonetic('Rammstein');
  assert.match(ru, /Р.*амшт/i);
  assert.doesNotMatch(ru, /[A-Za-z]/);
});

test('Du hast → German phonetic not English', () => {
  const ru = germanPhraseToRussianPhonetic('Du hast');
  assert.match(ru, /д\+?у.*х\+?аст/u);
  assert.doesNotMatch(ru, /du hast/i);
});

test('detectForeignLang marks Rammstein as de', () => {
  assert.equal(detectForeignLang('Rammstein'), 'de');
  assert.equal(detectForeignLang('Du hast'), 'de');
  assert.equal(detectForeignLang('Baby One More Time'), 'en');
});

test('Yandex SSML uses de-DE for Rammstein track', () => {
  const marked = prepareYandexTtsText('Хит Du hast группы Rammstein.', {
    artist: 'Rammstein',
    title: 'Du hast',
  });
  const ssml = buildYandexSsml(marked);
  assert.match(ssml, /xml:lang="de-DE">Du hast/i);
  assert.match(ssml, /xml:lang="de-DE">Rammstein/i);
});

test('applyForeignPronunciation transliterates German to pure Cyrillic', () => {
  const out = applyForeignPronunciation(
    'Трек Du hast от Rammstein — классика.',
    'Rammstein',
    'Du hast',
  );
  assert.doesNotMatch(out, /rammstein|du hast/i);
  assert.match(out, /[а-яё]/i);
});

test('Silero segments split German Latin as de', () => {
  const segs = splitMixedLanguageForSilero('Трек Du hast от Rammstein.');
  const de = segs.filter((s) => s.lang === 'de');
  assert.ok(de.length >= 2, `expected de segments, got ${JSON.stringify(segs)}`);
});

test('Deutschland uses de-DE lang code', () => {
  assert.equal(detectLatinLangCode('Deutschland'), 'de-DE');
});

console.log(`\n[test-de-phonetic] ${passed} passed`);
