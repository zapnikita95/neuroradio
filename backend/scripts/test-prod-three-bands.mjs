#!/usr/bin/env node
/** Prod smoke: Enter Shikari, Bad Omens, Eskimo Callboy */
const BASE = (process.env.BFF_URL ?? 'https://www.efir-ai.ru').replace(/\/$/, '');
const DEBUG_CERT =
  'a0105c5f4b340597d107f440356ffc9fcfa8c3fbdf002646a67d0a4ed733a8fc';

const TRACKS = [
  { artist: 'Enter Shikari', title: 'Sorry You\'re Not a Winner' },
  { artist: 'Bad Omens', title: 'The Death of Peace of Mind' },
  { artist: 'Eskimo Callboy', title: 'Hypa Hypa' },
];

const authRes = await fetch(`${BASE}/v1/auth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    package_name: 'com.efirai.myapp',
    cert_sha256: DEBUG_CERT,
    install_id: '00000000-0000-4000-8000-0000000000ab',
  }),
});
if (!authRes.ok) {
  console.error('auth failed', authRes.status, await authRes.text());
  process.exit(1);
}
const { access_token: token } = await authRes.json();

for (const { artist, title } of TRACKS) {
  console.log('\n' + '═'.repeat(72));
  console.log(`${artist} — ${title}`);
  const t0 = Date.now();
  const storyRes = await fetch(`${BASE}/v1/story/full`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      artist,
      title,
      voice_id: 'zahar',
      story_length: '30s',
      language: 'ru',
      story_narrator: 'night_dj',
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const bodyText = await storyRes.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    console.log(`HTTP ${storyRes.status} (${elapsed}s) — not JSON:`);
    console.log(bodyText.slice(0, 800));
    continue;
  }
  if (!storyRes.ok) {
    console.log(`HTTP ${storyRes.status} (${elapsed}s)`);
    console.log(JSON.stringify(body, null, 2));
    continue;
  }
  console.log(`HTTP ${storyRes.status} (${elapsed}s)`);
  console.log('seed:', body.seed_fact ?? '(none)');
  console.log('scope:', body.seed_scope, 'interest:', body.seed_interest_rating ?? '?');
  console.log('words:', body.word_count, 'tts:', body.ttsProvider ?? body.tts_provider);
  console.log('\nSCRIPT:\n' + (body.script ?? '').trim());
  if (body.tts_transcript) {
    console.log('\nTTS transcript:\n' + body.tts_transcript.trim());
  }
}
