/**
 * ElevenLabs DE/FR in English narration (language_code per chunk).
 * Run: npm run build && node scripts/test-elevenlabs-foreign.mjs
 */
import assert from 'node:assert/strict';
import {
  splitEnglishNarrationForForeignNames,
  shouldUseElevenLabsForeignSegments,
  elevenLabsLanguageCode,
  resolveElevenLabsModelForMixed,
} from '../dist/services/elevenlabs-text.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok: ${name}`);
}

console.log('[test-elevenlabs-foreign]');

test('French Stromae in English script → fr segments, no Russian', () => {
  const segs = splitEnglishNarrationForForeignNames(
    'The hit Papaoutai by Stromae reshaped European pop overnight.',
    'Stromae',
    'Papaoutai',
    true,
  );
  assert.ok(!segs.some((s) => s.lang === 'ru'), JSON.stringify(segs));
  const fr = segs.filter((s) => s.lang === 'fr');
  assert.ok(fr.length >= 1, JSON.stringify(segs));
  assert.match(fr.map((s) => s.text).join(' '), /Papaoutai|Stromae/i);
  assert.ok(segs.some((s) => s.lang === 'en'), JSON.stringify(segs));
});

test('German Rammstein in English script → de segments', () => {
  const segs = splitEnglishNarrationForForeignNames(
    'Rammstein dropped Du hast and the industrial scene shook.',
    'Rammstein',
    'Du hast',
    true,
  );
  const de = segs.filter((s) => s.lang === 'de');
  assert.ok(de.length >= 1, JSON.stringify(segs));
  assert.equal(elevenLabsLanguageCode('de'), 'de');
  assert.doesNotMatch(segs.map((s) => s.text).join(' '), /[а-яё]/i);
});

test('shouldUseElevenLabsForeignSegments true for DE/FR artists in English mode', () => {
  assert.equal(
    shouldUseElevenLabsForeignSegments(
      'A wild story about the track.',
      'Stromae',
      'Papaoutai',
      true,
    ),
    true,
  );
  assert.equal(
    shouldUseElevenLabsForeignSegments(
      'Industrial metal history.',
      'Rammstein',
      'Du hast',
      true,
    ),
    true,
  );
  assert.equal(
    shouldUseElevenLabsForeignSegments('Story.', 'Stromae', 'Papaoutai', false),
    false,
  );
});

test('pure English artist stays single en segment', () => {
  const segs = splitEnglishNarrationForForeignNames(
    'Michael Jackson invented the moonwalk on stage.',
    'Michael Jackson',
    'Billie Jean',
    true,
  );
  assert.equal(segs.length, 1);
  assert.equal(segs[0].lang, 'en');
});

test('foreign model defaults to eleven_multilingual_v2', () => {
  const prev = process.env.ELEVENLABS_MULTILINGUAL_MODEL_ID;
  delete process.env.ELEVENLABS_MULTILINGUAL_MODEL_ID;
  assert.equal(resolveElevenLabsModelForMixed(true), 'eleven_multilingual_v2');
  if (prev) process.env.ELEVENLABS_MULTILINGUAL_MODEL_ID = prev;
});

test('single-shot model stays flash when not mixed', () => {
  const prev = process.env.ELEVENLABS_MODEL_ID;
  delete process.env.ELEVENLABS_MODEL_ID;
  assert.equal(resolveElevenLabsModelForMixed(false), 'eleven_flash_v2_5');
  if (prev) process.env.ELEVENLABS_MODEL_ID = prev;
});

console.log(`\n[test-elevenlabs-foreign] ${passed} passed`);
