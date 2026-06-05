#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const key = process.env.GROQ_API_KEY?.trim();
if (!key) {
  console.error('NO GROQ_API_KEY');
  process.exit(1);
}

console.log(`key: gsk_…${key.slice(-6)} (len=${key.length})`);

async function probe(label, url, opts) {
  const t0 = Date.now();
  const r = await fetch(url, opts);
  const body = await r.text();
  console.log(`\n[${label}] HTTP ${r.status} (${Date.now() - t0}ms)`);
  console.log(body.slice(0, 400));
  return r.status;
}

await probe('GET /models', 'https://api.groq.com/openai/v1/models', {
  headers: { Authorization: `Bearer ${key}` },
});

await probe('POST chat', 'https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'llama-3.1-8b-instant',
    max_tokens: 20,
    messages: [{ role: 'user', content: 'Say OK' }],
  }),
});
