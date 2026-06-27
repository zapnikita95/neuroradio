#!/usr/bin/env node
/**
 * Prod timing: bank-first vs live-fetch vs repeat story on same track.
 *   node scripts/benchmark-story-scenarios.mjs
 */
import crypto from 'node:crypto';
const BASE = (process.env.BFF_URL ?? 'https://www.efir-ai.ru').replace(/\/$/, '');
const CERT =
  'a0105c5f4b340597d107f440356ffc9fcfa8c3fbdf002646a67d0a4ed733a8fc';

const TRACK = { artist: 'Sum 41', title: 'Still Waiting' };

async function auth(installId) {
  const r = await fetch(`${BASE}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      package_name: 'com.efirai.myapp',
      cert_sha256: CERT,
      install_id: installId,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`auth ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.access_token;
}

async function story(token, installId, label) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/v1/story/full`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      artist: TRACK.artist,
      title: TRACK.title,
      voice_id: 'filipp',
      story_length: '30s',
      language: 'ru',
      llm_provider: 'openrouter',
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const ms = Date.now() - t0;
  const body = await r.json().catch(() => ({}));
  const seed = (body.seed_fact ?? '').slice(0, 100);
  console.log(
    `${label.padEnd(22)} ${r.status} ${(ms / 1000).toFixed(1)}s words=${body.word_count ?? '-'} seed=${seed}`,
  );
  return { status: r.status, ms, seed };
}

const health = await fetch(`${BASE}/health`).then((r) => r.json());
console.log('build', health.build);
console.log('track', `${TRACK.artist} — ${TRACK.title}\n`);

const installA = crypto.randomUUID();
const tokenA = await auth(installA);
const r1 = await story(tokenA, installA, '1st request (cold)');

const installB = installA;
const r2 = await story(tokenA, installB, '2nd same install');

const installC = crypto.randomUUID();
const tokenC = await auth(installC);
const r3 = await story(tokenC, installC, 'fresh install repeat');

console.log('\n--- summary ---');
console.log(`cold:   ${(r1.ms / 1000).toFixed(1)}s (${r1.status})`);
console.log(`repeat: ${(r2.ms / 1000).toFixed(1)}s (${r2.status}) — expect bank, much faster`);
console.log(`fresh:  ${(r3.ms / 1000).toFixed(1)}s (${r3.status})`);
