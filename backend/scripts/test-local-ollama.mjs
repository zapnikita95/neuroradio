#!/usr/bin/env node
/**
 * Smoke-test local Ollama models — must pass quality gate (no fiction).
 * Usage: node scripts/test-local-ollama.mjs [model1 model2 ...]
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

const baseUrl = (process.env.LOCAL_OLLAMA_BASE_URL ?? 'http://127.0.0.1:11435').replace(/\/+$/, '');
const defaultModels = [
  'qwen3.6:35b-a3b-q4_K_M',
  'qwen3.5:35b-a3b',
  'qwen3.5:27b',
  'gemma4:31b',
];
const models = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultModels;

const TRACK = {
  artist: 'Queen',
  title: 'Bohemian Rhapsody',
  year: 1975,
  genre: 'rock',
  voiceId: 'zahar',
  storyLength: '60s',
  referenceFacts: [],
};

async function probeModel(model) {
  const tagsRes = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(8000) });
  if (!tagsRes.ok) throw new Error(`/api/tags HTTP ${tagsRes.status}`);
  const tags = await tagsRes.json();
  const names = (tags.models ?? []).map((m) => m.name ?? m.model).filter(Boolean);
  if (!names.includes(model)) {
    console.warn(`[test-local] SKIP ${model} — not in pool (${names.slice(0, 5).join(', ')}…)`);
    return null;
  }
  return names;
}

async function testModel(model) {
  console.log(`\n[test-local] === model=${model} ===`);
  const { generateStoryScriptLocal } = await import('../dist/services/local-ollama-story.js');
  const { findGenericFiction, findUngroundedClaims } = await import('../dist/services/story-quality.js');

  const started = Date.now();
  const story = await generateStoryScriptLocal({
    ...TRACK,
    localOllamaBaseUrl: baseUrl,
    localOllamaModel: model,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const fiction = findGenericFiction(story.script);
  const ungrounded = findUngroundedClaims(story.script, []);
  if (fiction || ungrounded) {
    console.error(`[test-local] FAIL ${model} quality: ${fiction ?? ungrounded}`);
    console.error('[test-local] script:', story.script);
    return { model, ok: false, reason: fiction ?? ungrounded, script: story.script, words: story.word_count, elapsed };
  }

  console.log(`[test-local] PASS ${model} words=${story.word_count} time=${elapsed}s`);
  console.log('[test-local] script:', story.script);
  return { model, ok: true, script: story.script, words: story.word_count, elapsed };
}

async function main() {
  console.log(`[test-local] base=${baseUrl} models=${models.join(', ')}`);
  const tagsRes = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(8000) });
  if (!tagsRes.ok) {
    console.error(`[test-local] Ollama unreachable: HTTP ${tagsRes.status}`);
    process.exit(1);
  }

  const results = [];
  for (const model of models) {
    const available = await probeModel(model);
    if (!available) continue;
    try {
      results.push(await testModel(model));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[test-local] FAIL ${model}: ${msg}`);
      results.push({ model, ok: false, reason: msg });
    }
  }

  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n[test-local] summary: ${passed.length} passed, ${failed.length} failed`);
  for (const r of passed) console.log(`  OK  ${r.model} (${r.words} words, ${r.elapsed}s)`);
  for (const r of failed) console.log(`  FAIL ${r.model}: ${r.reason}`);

  if (passed.length === 0) {
    console.error('[test-local] NO MODEL PRODUCED ACCEPTABLE STORY');
    process.exit(1);
  }
  console.log(`[test-local] best: ${passed[0].model}`);
}

main().catch((err) => {
  console.error('[test-local] FATAL:', err);
  process.exit(1);
});
