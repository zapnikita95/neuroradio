/**
 * French music phonetics for TTS (Stromae, Zaz, fr-FR SSML, Edge FR voices).
 * Run: npm run build && node scripts/test-fr-phonetic.mjs
 */
import assert from 'node:assert/strict';
import { frenchPhraseToRussianPhonetic } from '../dist/services/fr-phonetic-ru.js';
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

console.log('[test-fr-phonetic]');

test('Stromae → Cyrillic phonetic', () => {
  const ru = frenchPhraseToRussianPhonetic('Stromae');
  assert.match(ru, /стр.*ом/i);
  assert.doesNotMatch(ru, /[A-Za-z]/);
});

test('Papaoutai → French phonetic', () => {
  const ru = frenchPhraseToRussianPhonetic('Papaoutai');
  assert.match(ru, /пап.*ут/i);
});

test('Je veux (Zaz) → French not English', () => {
  const ru = frenchPhraseToRussianPhonetic('Je veux');
  assert.match(ru, /ж.*в/i);
  assert.doesNotMatch(ru, /je veux/i);
});

test('detectForeignLang marks Stromae and Zaz as fr', () => {
  assert.equal(detectForeignLang('Stromae'), 'fr');
  assert.equal(detectForeignLang('Zaz'), 'fr');
  assert.equal(detectForeignLang('Papaoutai'), 'fr');
  assert.equal(detectForeignLang('Baby One More Time'), 'en');
});

test('Yandex SSML uses fr-FR for Stromae track', () => {
  const marked = prepareYandexTtsText('Хит Papaoutai от Stromae.', {
    artist: 'Stromae',
    title: 'Papaoutai',
  });
  const ssml = buildYandexSsml(marked);
  assert.match(ssml, /xml:lang="fr-FR">Papaoutai by Stromae/i);
});

test('applyForeignPronunciation transliterates French to Cyrillic', () => {
  const out = applyForeignPronunciation(
    'Трек Je veux от Zaz — хит.',
    'Zaz',
    'Je veux',
  );
  assert.doesNotMatch(out, /stromae|je veux|zaz/i);
  assert.match(out, /[а-яё]/i);
});

test('Silero segments split French Latin as fr', () => {
  const segs = splitMixedLanguageForSilero('Трек Papaoutai от Stromae.');
  const fr = segs.filter((s) => s.lang === 'fr');
  assert.ok(fr.length >= 2, `expected fr segments, got ${JSON.stringify(segs)}`);
});

test('Dernière danse uses fr-FR lang code', () => {
  assert.equal(detectLatinLangCode('Dernière danse'), 'fr-FR');
});

console.log(`\n[test-fr-phonetic] ${passed} passed`);
