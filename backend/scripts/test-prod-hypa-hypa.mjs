#!/usr/bin/env node
const BASE = (process.env.BFF_URL ?? 'https://www.efir-ai.ru').replace(/\/$/, '');
const DEBUG_CERT =
  'a0105c5f4b340597d107f440356ffc9fcfa8c3fbdf002646a67d0a4ed733a8fc';

const authRes = await fetch(`${BASE}/v1/auth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    package_name: 'com.efirai.myapp',
    cert_sha256: DEBUG_CERT,
    install_id: '00000000-0000-4000-8000-0000000000cc',
  }),
});
const { access_token: token } = await authRes.json();

const storyRes = await fetch(`${BASE}/v1/story/full`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    artist: 'Eskimo Callboy',
    title: 'Hypa Hypa',
    voice_id: 'zahar',
    story_length: '30s',
    language: 'ru',
  }),
  signal: AbortSignal.timeout(180_000),
});

const body = await storyRes.json();
console.log('HTTP', storyRes.status);
console.log('SEED:', body.seed_fact);
console.log('SCRIPT:\n', body.script?.trim());
