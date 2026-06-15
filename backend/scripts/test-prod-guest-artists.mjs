#!/usr/bin/env node
/**
 * Prod smoke: seed must be about track artist; guests OK in script.
 *
 *   node scripts/test-prod-guest-artists.mjs
 *   BFF_URL=https://music-story-production.up.railway.app node scripts/test-prod-guest-artists.mjs
 */
import { fetchProdToken, BFF_URL } from './lib/prod-auth.mjs';
import { factMentionsArtistLoose } from '../dist/services/fact-relevance.js';

const TRACKS = [
  {
    artist: 'Michael Jackson',
    title: 'Beat It',
    guestHints: [/van halen|eddie|квincy|jones|гитар/i],
    rejectSeed: [/teachers union|забастовк.*учител|chicago public schools/i],
  },
  {
    artist: 'Nine Inch Nails',
    title: 'Closer',
    guestHints: [/reznor|trent|industrial|downward spiral/i],
    rejectSeed: [],
  },
  {
    artist: 'Nine Inch Nails',
    title: 'The Hand That Feeds',
    guestHints: [/reznor|nin|with teeth/i],
    rejectSeed: [],
  },
  {
    artist: 'Queen',
    title: 'Bohemian Rhapsody',
    guestHints: [/mercury|may|taylor|deacon|studio/i],
    rejectSeed: [],
  },
];

function seedOk(seed, artist, rejectPatterns) {
  if (!seed?.trim()) return { ok: false, reason: 'empty seed' };
  if (!factMentionsArtistLoose(seed, artist)) {
    return { ok: false, reason: `seed does not mention "${artist}"` };
  }
  for (const p of rejectPatterns) {
    if (p.test(seed)) return { ok: false, reason: `seed matches reject ${p}` };
  }
  return { ok: true };
}

const token = await fetchProdToken();
let failed = 0;

console.log('BFF:', BFF_URL);
console.log('Tracks:', TRACKS.length);

for (const track of TRACKS) {
  console.log('\n' + '═'.repeat(72));
  console.log(`${track.artist} — ${track.title}`);

  const t0 = Date.now();
  const storyRes = await fetch(`${BFF_URL}/v1/story/full`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      artist: track.artist,
      title: track.title,
      voice_id: 'zahar',
      story_length: '30s',
      language: 'ru',
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const bodyText = await storyRes.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    console.error(`HTTP ${storyRes.status} (${elapsed}s) — not JSON`);
    console.error(bodyText.slice(0, 600));
    failed++;
    continue;
  }

  if (!storyRes.ok) {
    console.error(`HTTP ${storyRes.status} (${elapsed}s)`, body.error ?? body);
    failed++;
    continue;
  }

  const seed = (body.seed_fact ?? body.seedFact ?? '').trim();
  const script = (body.script ?? '').trim();
  const scope = body.seed_scope ?? body.seedScope ?? '?';
  const origin = body.seed_origin ?? body.seedOrigin ?? body.fact_origin ?? '';

  console.log(`HTTP ${storyRes.status} (${elapsed}s) scope=${scope} origin=${origin || '?'}`);
  console.log('seed:', seed.slice(0, 220) + (seed.length > 220 ? '…' : ''));

  const check = seedOk(seed, track.artist, track.rejectSeed);
  if (!check.ok) {
    console.error('FAIL seed:', check.reason);
    failed++;
  } else {
    console.log('OK seed mentions track artist');
  }

  const guestHit = track.guestHints.some((p) => p.test(seed) || p.test(script));
  if (guestHit) {
    console.log('OK guest/collab context in seed or script');
  } else {
    console.log('(info) no guest hint matched — still OK if seed is on-topic');
  }

  console.log('\nSCRIPT:\n' + script.slice(0, 500) + (script.length > 500 ? '…' : ''));
}

console.log('\n' + '═'.repeat(72));
console.log(failed === 0 ? 'PASS — all guest-artist smokes OK' : `FAIL — ${failed} track(s)`);
process.exit(failed === 0 ? 0 : 1);
