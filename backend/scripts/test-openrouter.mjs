#!/usr/bin/env node
/**
 * Smoke-test OpenRouter: fact-hunt JSON + short story JSON.
 * Key: OPEN_ROUTER_API_KEY env, or repo root .env.example / backend/.env
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repoRoot = resolve(root, '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (v && !process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(resolve(repoRoot, '.env.example'));
loadEnvFile(resolve(repoRoot, '.env'));
loadEnvFile(resolve(root, '.env'));

const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error('OPEN_ROUTER_API_KEY missing — добавь в Music story/.env.example');
  process.exit(1);
}

const MODELS = [
  'liquid/lfm-2.5-1.2b-instruct:free',
];

const SNIPPETS = [
  '0. Redbone is a Native American rock band formed in 1969.',
  '1. Come and Get Your Love reached No. 5 on the Billboard Hot 100 in 1974.',
];

async function chat(model, system, user, maxTokens = 400) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://music-story.app',
      'X-Title': 'Music Story test',
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
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
  if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 220)}`);
  const data = JSON.parse(body);
  return data.choices?.[0]?.message?.content ?? '';
}

const factSystem = `JSON only: {"fact":"...","scope":"track","evidenceSnippetIndex":1,"evidenceQuote":"..."} or {"reject":true,"reason":"..."}`;
const factUser = `Artist: Redbone\nTrack: Come and Get Your Love\n\nSNIPPETS:\n${SNIPPETS.join('\n')}`;
const storySystem = `JSON: {"script":"2-3 Russian sentences","word_count":40,"voiceId":"zahar"}`;
const storyUser = `Seed: Billboard Hot 100 #5 in 1974.\nArtist: Redbone\nTrack: Come and Get Your Love`;

let passed = 0;
let failed = 0;

for (const model of MODELS) {
  process.stdout.write(`\n=== ${model} ===\n`);
  try {
    const factRaw = await chat(model, factSystem, factUser, 350);
    const factJson = JSON.parse(factRaw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    const factOk = factJson.fact && factJson.evidenceSnippetIndex !== undefined;
    console.log(`  fact-hunt: ${factOk ? 'OK' : 'FAIL'}`);

    const storyRaw = await chat(model, storySystem, storyUser, 500);
    const storyJson = JSON.parse(storyRaw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    const storyOk = typeof storyJson.script === 'string' && storyJson.script.length > 20;
    console.log(`  story:     ${storyOk ? 'OK' : 'FAIL'}`);

    if (factOk && storyOk) passed += 1;
    else failed += 1;
  } catch (e) {
    failed += 1;
    console.log(`  ERROR: ${e.message}`);
  }
}

console.log(`\nDone: ${passed} OK, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
