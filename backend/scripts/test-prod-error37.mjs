#!/usr/bin/env node
/** Prod: Error37 — Ruining Art as a Medium → story/full */
const BASE = (process.env.BFF_URL ?? 'https://www.efir-ai.ru').replace(/\/$/, '');
const DEBUG_CERT =
  'a0105c5f4b340597d107f440356ffc9fcfa8c3fbdf002646a67d0a4ed733a8fc';

const t0 = Date.now();

const health = await fetch(`${BASE}/health`);
const healthJson = await health.json();
console.log('=== /health ===');
console.log(JSON.stringify(healthJson, null, 2));

const authRes = await fetch(`${BASE}/v1/auth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    package_name: 'com.efirai.myapp',
    cert_sha256: DEBUG_CERT,
    install_id: '00000000-0000-4000-8000-000000000099',
  }),
});
if (!authRes.ok) {
  console.error('auth failed', authRes.status, await authRes.text());
  process.exit(1);
}
const { access_token: token } = await authRes.json();
console.log('\nauth OK');

console.log('\n=== POST /v1/story/full Error37 ===');
const storyRes = await fetch(`${BASE}/v1/story/full`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    artist: 'Error37',
    title: 'Ruining Art as a Medium',
    voice_id: 'zahar',
    story_length: '30s',
    language: 'ru',
    story_narrator: 'night_dj',
  }),
  signal: AbortSignal.timeout(180_000),
});

const bodyText = await storyRes.text();
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`HTTP ${storyRes.status} (${elapsed}s total)`);

let body;
try {
  body = JSON.parse(bodyText);
} catch {
  console.log(bodyText.slice(0, 2000));
  process.exit(1);
}

if (!storyRes.ok) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log('\n--- seed ---');
console.log('seed_fact:', body.seed_fact ?? body.seedFact ?? '(none)');
console.log('seed_scope:', body.seed_scope ?? body.seedScope ?? '(none)');
console.log('seed_interest:', body.seed_interest_rating ?? body.seedInterestRating ?? '?');

console.log('\n--- story ---');
console.log('word_count:', body.word_count ?? body.wordCount ?? '?');
console.log('audioUrl:', body.audioUrl ?? body.audio_url ?? '(none)');
console.log('ttsProvider:', body.ttsProvider ?? body.tts_provider ?? '?');
console.log('\nscript:\n', (body.script ?? '').trim());
