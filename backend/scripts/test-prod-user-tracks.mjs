#!/usr/bin/env node
/** Prod verification: last ~10 tracks user complained about. */
const BASE = (process.env.BFF_URL ?? 'https://www.efir-ai.ru').replace(/\/$/, '');
const DEBUG_CERT =
  'a0105c5f4b340597d107f440356ffc9fcfa8c3fbdf002646a67d0a4ed733a8fc';

const TRACKS = [
  // Сессия 2026-06-27 — disconnect / 31s / COVER_AMBIGUOUS
  { artist: 'Savage Garden', title: 'Break Me Shake Me' },
  { artist: 'The Cranberries', title: 'Zombie' },
  { artist: 'Sum 41', title: 'Still Waiting' },
  { artist: 'My Chemical Romance', title: 'Teenagers' },
  { artist: 'Fatboy Slim', title: 'The Rockafeller Skank' },
  // Типичные регрессии
  { artist: 'Rob Thomas', title: 'Lonely No More', badSeed: /the band recorded|not written by Thomas/i },
  { artist: 'Red Hot Chili Peppers', title: "Can't Stop", badSeed: /\bDani\b.*(?:laments|death)/i, badScript: /\bDani\b/i },
  { artist: 'Green Day', title: 'Holiday', badSeed: /Makuhari|via YouTube/i },
  { artist: 'Imagine Dragons', title: 'Lonely', badSeed: /MTV.*Reynolds said|directors.*scripts/i },
  { artist: 'Maroon 5', title: 'One More Night', badSeed: /Discogs датирован|Overexposed.*2016/i, badScript: /прорыв/i },
  { artist: 'Sabrina Carpenter', title: 'Espresso', badScript: /мурашк|лёгкий поп-звук с неожиданно глубокой/i },
  { artist: 'Pompeya', title: "Nobody's Truth", badSeed: /Gala Records|выходил на лейбле/i },
  { artist: 'mgk', title: 'cliché', badScript: /визитной карточкой|два мира столкнулись/i },
  { artist: 'SAYAN', title: 'Мальборо', badSeed: /Last\.fm указан в альбоме|Erol Sayan/i },
  { artist: 'Malcolm Todd', title: 'Earrings', badSeed: /Last\.fm указан в альбоме/i },
  // Major rock — fast-path / bank
  { artist: 'Nirvana', title: 'Smells Like Teen Spirit' },
  { artist: 'Linkin Park', title: 'In the End' },
  { artist: 'The Beatles', title: 'Yesterday' },
  { artist: 'Queen', title: 'Bohemian Rhapsody' },
  { artist: 'Metallica', title: 'Nothing Else Matters' },
  { artist: 'AC/DC', title: 'Back In Black' },
  { artist: 'Radiohead', title: 'Creep' },
  { artist: 'Oasis', title: 'Wonderwall' },
  { artist: 'Blink-182', title: 'All the Small Things' },
  { artist: 'Foo Fighters', title: 'Everlong' },
];

const BAD_SCRIPT_PATTERNS = [
  /истори\w*\s+групп/i,
  /стала\s+хитом/i,
  /визитной\s+карточкой/i,
  /мурашк/i,
  /лёгкий\s+поп-?звук\s+с\s+неожиданно\s+глубокой/i,
  /электронн\w*\s+бит\w*\s+и\s+гитар/i,
];

const health = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(15_000) });
const healthJson = await health.json();
console.log('=== HEALTH ===');
console.log(JSON.stringify(healthJson, null, 2));

const authRes = await fetch(`${BASE}/v1/auth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    package_name: 'com.efirai.myapp',
    cert_sha256: DEBUG_CERT,
    install_id: '00000000-0000-4000-8000-0000000000ab',
  }),
  signal: AbortSignal.timeout(15_000),
});
if (!authRes.ok) {
  console.error('auth failed', authRes.status, await authRes.text());
  process.exit(1);
}
const { access_token: token } = await authRes.json();
console.log('auth OK\n');

let failed = 0;
const rows = [];

for (const track of TRACKS) {
  const label = `${track.artist} — ${track.title}`;
  console.log('═'.repeat(72));
  console.log(label);
  const t0 = Date.now();
  let status = 'OK';
  let seed = '';
  let script = '';
  let scope = '';
  let interest = '';
  let words = '';
  let err = '';

  try {
    const storyRes = await fetch(`${BASE}/v1/story/full`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        artist: track.artist,
        title: track.title,
        voice_id: 'filipp',
        story_length: '30s',
        language: 'ru',
        llm_provider: 'openrouter',
      }),
      signal: AbortSignal.timeout(180_000),
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const bodyText = await storyRes.text();
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      err = `not JSON (${storyRes.status}, ${elapsed}s)`;
      status = 'FAIL';
      failed += 1;
      console.log(err);
      rows.push({ label, status, err });
      continue;
    }
    if (!storyRes.ok) {
      err = [body.code, body.message ?? body.error ?? `HTTP ${storyRes.status}`].filter(Boolean).join(' — ');
      status = 'FAIL';
      failed += 1;
      console.log(`HTTP ${storyRes.status} (${elapsed}s): ${err}`);
      rows.push({ label, status, err });
      continue;
    }

    seed = (body.seed_fact ?? body.seedFact ?? '').trim();
    script = (body.script ?? '').trim();
    scope = body.seed_scope ?? body.seedScope ?? '?';
    interest = String(body.seed_interest_rating ?? body.seedInterestRating ?? '?');
    words = String(body.word_count ?? body.wordCount ?? '?');

    console.log(`HTTP 200 (${elapsed}s) scope=${scope} interest=${interest}/10 words=${words}`);
    console.log('SEED:', seed.slice(0, 220) + (seed.length > 220 ? '…' : ''));
    console.log('SCRIPT:', script.slice(0, 280) + (script.length > 280 ? '…' : ''));

    const issues = [];
    if (track.badSeed && track.badSeed.test(seed)) issues.push(`bad seed: ${track.badSeed}`);
    if (track.badScript && track.badScript.test(script)) issues.push(`bad script: ${track.badScript}`);
    for (const p of BAD_SCRIPT_PATTERNS) {
      if (p.test(script) && !(track.badScript && track.badScript.source === p.source)) {
        if (!seed || !p.test(seed)) issues.push(`script cliché/ungrounded: ${p.source}`);
      }
    }
    if (!seed || seed.length < 20) issues.push('empty/short seed');

    if (issues.length) {
      status = 'FAIL';
      failed += 1;
      err = issues.join('; ');
      console.log('ISSUES:', err);
    } else {
      console.log('CHECK: pass');
    }
  } catch (e) {
    status = 'FAIL';
    failed += 1;
    err = e.message ?? String(e);
    console.log('ERROR:', err);
  }

  rows.push({ label, status, seed: seed.slice(0, 120), scope, interest, words, err });
}

console.log('\n' + '═'.repeat(72));
console.log('SUMMARY');
for (const r of rows) {
  console.log(`${r.status.padEnd(5)} ${r.label}`);
  if (r.seed) console.log(`       seed: ${r.seed}${r.seed.length >= 120 ? '…' : ''}`);
  if (r.err) console.log(`       → ${r.err}`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed}/${rows.length} tracks failed`);
process.exit(failed === 0 ? 0 : 1);
