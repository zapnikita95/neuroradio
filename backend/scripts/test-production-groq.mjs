#!/usr/bin/env node
/** Groq via Railway BFF (bypasses RU geo-block on api.groq.com). */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(root, '..');

for (const p of [
  resolve(repoRoot, '.env.example'),
  resolve(repoRoot, '.env'),
  resolve(root, '.env'),
]) {
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (v && !process.env[k]) process.env[k] = v;
  }
}

const baseUrl = (
  process.env.RAILWAY_URL || 'https://music-story-production.up.railway.app'
).replace(/\/$/, '');
const certSha256 = 'a0105c5f4b340597d107f440356ffc9fcfa8c3fbdf002646a67d0a4ed733a8fc';

function jwtSecret() {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) throw new Error('GROQ_API_KEY missing');
  return crypto.createHmac('sha256', 'music-story-app-jwt-v1').update(groqKey).digest('hex');
}

async function main() {
  const health = await fetch(`${baseUrl}/health`).then((r) => r.json());
  console.log('health:', JSON.stringify(health));

  const tokenRes = await fetch(`${baseUrl}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      install_id: crypto.randomUUID(),
      package_name: 'com.musicstory.app',
      cert_sha256: certSha256,
      app_version: 'groq-test',
    }),
  });
  if (!tokenRes.ok) {
    console.error('auth fail', tokenRes.status, await tokenRes.text());
    process.exit(1);
  }
  const token = (await tokenRes.json()).access_token;

  const t0 = Date.now();
  const storyRes = await fetch(`${baseUrl}/v1/story/full`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      artist: 'ABBA',
      title: 'Dancing Queen',
      year: 1976,
      genre: 'pop',
      story_length: '30s',
      llm_provider: 'groq',
      groq_model: 'llama-3.3-70b-versatile',
    }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await storyRes.text();
  console.log(`\nstory/full groq: HTTP ${storyRes.status} (${Date.now() - t0}ms)`);
  if (!storyRes.ok) {
    console.log(text.slice(0, 600));
    process.exit(1);
  }
  const data = JSON.parse(text);
  console.log('llm:', data.llm_used ?? data.llmUsed ?? '?');
  console.log('words:', data.word_count ?? data.script?.split(/\s+/).length);
  console.log('script:', (data.script ?? '').slice(0, 200) + '…');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
