#!/usr/bin/env node
/** One model, one story — smoke test. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
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

const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim();
const MODEL = process.argv[2]?.trim() || 'liquid/lfm-2.5-1.2b-instruct:free';

if (!apiKey) {
  console.error('OPEN_ROUTER_API_KEY missing');
  process.exit(1);
}

const artist = 'Michael Jackson';
const title = "They Don't Care About Us";

async function chat(system, user, maxTokens = 500) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://music-story.app',
      'X-Title': 'Music Story one-model test',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.45,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(90000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 350)}`);
  const data = JSON.parse(body);
  return data.choices?.[0]?.message?.content ?? '';
}

const storySystem =
  'JSON only: {"script":"2-4 Russian sentences about the track","word_count":50,"voiceId":"zahar"}';
const storyUser = `Artist: ${artist}\nTrack: ${title}\nSeed: Protest song from HIStory, 1995.`;

console.log(`Testing model: ${MODEL}`);
const t0 = Date.now();
try {
  const raw = await chat(storySystem, storyUser);
  const ms = Date.now() - t0;
  const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  const ok = typeof j.script === 'string' && j.script.length > 20;
  console.log(`TIME: ${ms}ms`);
  console.log(`RESULT: ${ok ? 'OK' : 'FAIL'}`);
  console.log(`SCRIPT:\n${j.script ?? raw}`);
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error(`FAIL (${Date.now() - t0}ms):`, e.message);
  process.exit(1);
}
