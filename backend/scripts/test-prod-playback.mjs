#!/usr/bin/env node
/** Production E2E: auth → story/full → download audio OGG. */
const BASE = process.env.BFF_URL ?? 'https://music-story-production.up.railway.app';
const DEBUG_CERT =
  'a0105c5f4b340597d107f440356ffc9fcfa8c3fbdf002646a67d0a4ed733a8fc';

async function main() {
  const authRes = await fetch(`${BASE}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      package_name: 'com.efirai.myapp',
      cert_sha256: DEBUG_CERT,
      install_id: '00000000-0000-4000-8000-000000000001',
    }),
  });
  if (!authRes.ok) {
    console.error('auth failed', authRes.status, await authRes.text());
    process.exit(1);
  }
  const { access_token: token } = await authRes.json();
  console.log('auth OK');

  const storyRes = await fetch(`${BASE}/v1/story/full`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      artist: 'Michael Jackson',
      title: 'Billie Jean',
      album: 'Thriller',
      voice_id: 'zahar',
      story_length: '60s',
      language: 'ru',
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const bodyText = await storyRes.text();
  if (!storyRes.ok) {
    console.error('story/full failed', storyRes.status, bodyText.slice(0, 500));
    process.exit(1);
  }
  const story = JSON.parse(bodyText);
  console.log('story OK words=', story.word_count ?? '?');
  console.log('script preview:', (story.script ?? '').slice(0, 120), '…');
  const audioUrl = story.audioUrl ?? story.audio_url;
  if (!audioUrl) {
    console.error('no audioUrl in response');
    process.exit(1);
  }
  const fullUrl = audioUrl.startsWith('http')
    ? audioUrl
    : `${BASE.replace(/\/$/, '')}${audioUrl.startsWith('/') ? '' : '/'}${audioUrl}`;
  console.log('audioUrl:', fullUrl.slice(0, 80), '…');

  const audioRes = await fetch(fullUrl, { signal: AbortSignal.timeout(60_000) });
  if (!audioRes.ok) {
    console.error('audio download failed', audioRes.status);
    process.exit(1);
  }
  const buf = Buffer.from(await audioRes.arrayBuffer());
  const header = buf.subarray(0, 4).toString('ascii');
  console.log(`audio OK ${buf.length} bytes header=${header}`);
  if (buf.length < 5000) {
    console.error('audio suspiciously small');
    process.exit(1);
  }
  console.log('E2E PASS');
}

main().catch((e) => {
  console.error('E2E FAIL', e.message);
  process.exit(1);
});
