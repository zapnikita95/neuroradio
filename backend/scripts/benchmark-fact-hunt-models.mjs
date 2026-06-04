#!/usr/bin/env node
/**
 * Benchmark cheap OpenRouter models for music fact-hunt JSON quality.
 * Run: node scripts/benchmark-fact-hunt-models.mjs
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
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

loadEnvFile(resolve(repoRoot, '.env'));
loadEnvFile(resolve(root, '.env'));
loadEnvFile(resolve(repoRoot, '.env.example'));

const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error('OPEN_ROUTER_API_KEY missing');
  process.exit(1);
}

/** Cheap / free candidates for fact extraction */
const MODELS = [
  'google/gemma-4-26b-a4b-it:free',
  'qwen/qwen3-4b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'openai/gpt-oss-20b:free',
  'google/gemma-3-27b-it:free',
  'qwen/qwen3.5-9b',
  'google/gemma-4-26b-a4b-it',
  'deepseek/deepseek-chat-v3-0324',
  'liquid/lfm-2.5-1.2b-instruct:free',
];

const SNIPPETS = [
  '0. Redbone is a Native American rock band formed in 1969 by brothers Pat and Lafe Vegas.',
  '1. Come and Get Your Love reached No. 5 on the Billboard Hot 100 in April 1974.',
  '2. The song appeared in the Guardians of the Galaxy soundtrack in 2014, reviving interest.',
  '3. Redbone was one of the first Native American bands to have a top-five hit in the US.',
];

const factSystem = `You extract ONE interesting music fact grounded in snippets. JSON only:
{"fact":"Russian sentence 35+ chars","scope":"track"|"artist","evidenceSnippetIndex":N,"evidenceQuote":"exact substring from snippet"}
or {"reject":true,"reason":"..."} if no good fact.`;

const factUser = `Artist: Redbone
Track: Come and Get Your Love
Year: 1974

SNIPPETS:
${SNIPPETS.join('\n')}`;

function verifyFact(json) {
  if (json.reject) return { ok: false, reason: 'rejected' };
  const fact = json.fact?.trim();
  if (!fact || fact.length < 35) return { ok: false, reason: 'short fact' };
  const idx = json.evidenceSnippetIndex;
  if (idx === undefined || idx < 0 || idx >= SNIPPETS.length) return { ok: false, reason: 'bad index' };
  const quote = (json.evidenceQuote ?? '').trim().toLowerCase();
  const snippet = SNIPPETS[idx].toLowerCase();
  if (quote.length < 8) return { ok: false, reason: 'short quote' };
  if (!snippet.includes(quote) && !quote.split(/\s+/).filter((w) => w.length >= 4).some((w) => snippet.includes(w))) {
    return { ok: false, reason: 'quote not grounded' };
  }
  return { ok: true, fact: fact.slice(0, 80) };
}

async function chat(model) {
  const started = Date.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://music-story.app',
      'X-Title': 'Music Story fact-hunt benchmark',
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: factSystem },
        { role: 'user', content: factUser },
      ],
    }),
    signal: AbortSignal.timeout(90000),
  });
  const ms = Date.now() - started;
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 180)}`);
  const data = JSON.parse(body);
  const raw = data.choices?.[0]?.message?.content ?? '';
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  return { ms, json, raw: raw.slice(0, 120) };
}

const results = [];
for (const model of MODELS) {
  process.stdout.write(`${model} ... `);
  try {
    const { ms, json, raw } = await chat(model);
    const v = verifyFact(json);
    results.push({ model, status: v.ok ? 'ok' : 'fail', ms, reason: v.reason, fact: v.fact, preview: raw });
    console.log(v.ok ? `OK ${ms}ms — ${v.fact}` : `FAIL ${ms}ms — ${v.reason}`);
  } catch (e) {
    results.push({ model, status: 'error', error: e.message });
    console.log(`ERROR — ${e.message.slice(0, 100)}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}

const outPath = resolve(__dirname, 'fact-hunt-benchmark-results.json');
writeFileSync(outPath, JSON.stringify({ testedAt: new Date().toISOString(), results }, null, 2));
console.log(`\nWrote ${outPath}`);
const ok = results.filter((r) => r.status === 'ok');
console.log(`Passed: ${ok.length}/${results.length}`);
if (ok.length) {
  ok.sort((a, b) => a.ms - b.ms);
  console.log('Best (by speed among OK):', ok.map((r) => `${r.model} (${r.ms}ms)`).join(', '));
}
