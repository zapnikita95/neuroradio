/**
 * ElevenLabs DE/FR mixed segments (language_code per chunk).
 * Run: npm run build && node scripts/test-elevenlabs-foreign.mjs
 */
import assert from 'node:assert/strict';
import {
  prepareElevenLabsMixedSegments,
  shouldUseElevenLabsMixedSegments,
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

test('French Stromae → mixed segments with fr language_code', () => {
  const segs = prepareElevenLabsMixedSegments(
    'Хит Papaoutai от Stromae — французская электроника.',
    'Stromae',
    'Papaoutai',
  );
  const fr = segs.filter((s) => s.lang === 'fr');
  assert.ok(fr.length >= 1, JSON.stringify(segs));
  assert.equal(elevenLabsLanguageCode('fr'), 'fr');
  assert.match(fr.map((s) => s.text).join(' '), /Papaoutai|Stromae/i);
});

test('German Rammstein → mixed segments with de language_code', () => {
  const segs = prepareElevenLabsMixedSegments(
    'Трек Du hast от Rammstein.',
    'Rammstein',
    'Du hast',
  );
  const de = segs.filter((s) => s.lang === 'de');
  assert.ok(de.length >= 1, JSON.stringify(segs));
  assert.equal(elevenLabsLanguageCode('de'), 'de');
});

test('shouldUseElevenLabsMixedSegments true for DE/FR artists', () => {
  assert.equal(
    shouldUseElevenLabsMixedSegments('Хит.', 'Stromae', 'Papaoutai', true),
    true,
  );
  assert.equal(
    shouldUseElevenLabsMixedSegments('Хит.', 'Rammstein', 'Du hast', true),
    true,
  );
  assert.equal(
    shouldUseElevenLabsMixedSegments('Хит.', 'Stromae', 'Papaoutai', false),
    false,
  );
});

test('mixed model defaults to eleven_multilingual_v2', () => {
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
