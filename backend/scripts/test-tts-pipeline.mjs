/**
 * Regression checks for enhanced TTS text pipeline (no network).
 * Run: npm run build && node scripts/test-tts-pipeline.mjs
 */
import assert from 'node:assert/strict';
import { prepareYandexTtsText, prepareSileroTtsText, prepareSileroTtsTextTrace } from '../dist/services/tts-markup.js';
import { resolveVoiceDelivery } from '../dist/services/tts-voice-profiles.js';
import {
  PremiumTtsAccessError,
  resolveEffectiveTtsProvider,
} from '../dist/services/tts-router.js';
import { resolveUserTier } from '../dist/services/entitlements.js';
import { enhanceMixedLanguageText } from '../dist/services/tts-en-normalize.js';
import { polishScriptForSpeechDelivery } from '../dist/services/tts-speech-polish.js';
import { buildAzureSsml, preparePlainSpeechText } from '../dist/services/tts-azure-ssml.js';
import { buildSaluteSsml } from '../dist/services/salute-ssml.js';

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

console.log('[test-tts-pipeline]');

test('mixed EN gets articulation pauses', () => {
  const out = enhanceMixedLanguageText(
    'Трек Bohemian Rhapsody взорвал чарты.',
    'Queen',
    'Bohemian Rhapsody',
  );
  assert.match(out, /<\[small\]>/);
  assert.match(out, /Bohemian/i);
});

test('polish splits long bureaucratic phrasing', () => {
  const raw =
    'В связи с тем, что данный трек был выпущен на лейбле, продюсер осуществил запись в студии.';
  const out = polishScriptForSpeechDelivery(raw);
  assert.ok(!/в связи с тем/i.test(out));
  assert.ok(out.length > 10);
});

test('prepareYandexTtsText adds sentence pauses', () => {
  const out = prepareYandexTtsText('Первая фраза. Вторая фраза про джаз.', {
    artist: 'Queen',
    title: 'Test',
    pauseProfile: 'natural',
  });
  assert.match(out, /<\[(?:small|medium)\]>/);
  assert.match(out, /дж(\+)?аз/i);
});

test('voice delivery maps radio_host narrator', () => {
  const d = resolveVoiceDelivery({
    ttsVoice: 'auto',
    ttsStyle: 'auto',
    storyNarrator: 'radio_host',
    year: 1985,
    genre: 'rock',
    clientVoiceLocked: false,
  });
  assert.equal(d.styleId, 'radio_host');
  assert.ok(d.speed >= 0.85 && d.speed <= 1.1);
});

test('premium tier without entitlement throws', () => {
  assert.throws(
    () =>
      resolveEffectiveTtsProvider({
        voiceTier: 'premium',
        ttsProvider: 'auto',
        installId: '00000000-0000-4000-8000-000000000099',
      }),
    PremiumTtsAccessError,
  );
});

test('free tier resolves to yandex', () => {
  const p = resolveEffectiveTtsProvider({
    voiceTier: 'default',
    ttsProvider: 'auto',
    installId: '00000000-0000-4000-8000-000000000099',
  });
  assert.equal(p, 'yandex');
});

test('unknown install is free tier', () => {
  assert.equal(
    resolveUserTier('00000000-0000-4000-8000-000000000099'),
    'free',
  );
});

test('azure ssml uses ru-RU neural and english lang tags', () => {
  const plain = preparePlainSpeechText(
    'Трек Queen взорвал чарты.',
    'Queen',
    'Test',
  );
  const ssml = buildAzureSsml(plain, {
    voice: 'ru-RU-DmitryNeural',
    rate: '-8%',
    pauseProfile: 'natural',
  });
  assert.match(ssml, /ru-RU-DmitryNeural/);
  assert.match(ssml, /xml:lang="en-US"/);
  assert.match(ssml, /Queen/);
});

test('salute ssml uses sber voice and breaks', () => {
  const plain = preparePlainSpeechText('Привет. Трек Queen.', 'Queen', 'Test');
  const ssml = buildSaluteSsml(plain, {
    voice: 'Pon_24000',
    rate: 'medium',
    pauseProfile: 'natural',
  });
  assert.match(ssml, /Pon_24000/);
  assert.match(ssml, /<break time="/);
  assert.match(ssml, /xml:lang="en-US"/);
});

test('prepareSileroTtsText transliterates Italian titles and keeps stress', () => {
  const script =
    'Damiano David победил на Евровидении с песней «Zitti e buoni». Звукорежиссёр поймал свист в колонках. ' +
    'В 2021 году коллектив победил снова.';
  const trace = prepareSileroTtsTextTrace(script, {
    artist: 'Damiano David',
    title: 'Next Summer',
  });
  const out = trace.prepared;
  assert.match(out, /Цитти э буони/i);
  assert.doesNotMatch(out, /Zitti/i);
  assert.doesNotMatch(out, /в\s+кavыч/i);
  assert.match(out, /двадцать первом году/i);
  assert.match(out, /св\+ист|свист/i);
  assert.match(out, /кол\+он/i);
  assert.doesNotMatch(out, /<\[/);
  assert.ok(trace.latinReplacements.length > 0);
});

console.log(`\n[test-tts-pipeline] ${passed} passed`);
