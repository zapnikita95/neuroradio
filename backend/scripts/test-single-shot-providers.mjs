#!/usr/bin/env node
/** One HTTP call per provider — smoke test after single-shot refactor. */
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

const artist = 'Billie Eilish';
const title = 'CHIHIRO';
const seed =
  'CHIHIRO is a song by Billie Eilish from her album Hit Me Hard and Soft, released in 2024.';

const baseInput = {
  artist,
  title,
  year: 2024,
  genre: 'pop',
  voiceId: 'zahar',
  storyLength: '60s',
  storyNarrator: 'auto',
  referenceFacts: [seed],
  selectedReferenceFact: {
    fact: seed,
    scope: 'track',
    scopeLabelRu: 'трек',
  },
};

async function testProvider(name, fn) {
  const t0 = Date.now();
  try {
    const story = await fn();
    const ms = Date.now() - t0;
    const ok = story?.script?.length > 40;
    console.log(`\n[${name}] ${ok ? 'OK' : 'FAIL'} ${ms}ms words=${story?.word_count ?? 0}`);
    if (ok) console.log(story.script.slice(0, 200) + '…');
    return ok;
  } catch (e) {
    console.error(`\n[${name}] FAIL (${Date.now() - t0}ms):`, e.message?.slice(0, 200));
    return false;
  }
}

const results = [];

if (process.env.OPEN_ROUTER_API_KEY?.trim()) {
  const { generateStoryScript } = await import('../dist/services/openrouter.js');
  results.push(
    await testProvider('openrouter', () =>
      generateStoryScript({
        ...baseInput,
        openRouterModel: 'liquid/lfm-2.5-1.2b-instruct:free',
      }),
    ),
  );
} else {
  console.warn('skip openrouter — no key');
}

if (process.env.GROQ_API_KEY?.trim()) {
  const { generateStoryScript } = await import('../dist/services/groq.js');
  results.push(
    await testProvider('groq', () =>
      generateStoryScript({
        ...baseInput,
        groqModel: 'llama-3.1-8b-instant',
      }),
    ),
  );
} else {
  console.warn('skip groq — no key');
}

if (process.env.GEMINI_API_KEY?.trim()) {
  const { generateStoryScript } = await import('../dist/services/gemini.js');
  results.push(
    await testProvider('gemini', () =>
      generateStoryScript({
        ...baseInput,
        geminiModel: 'gemini-2.0-flash-lite',
      }),
    ),
  );
} else {
  console.warn('skip gemini — no key');
}

const passed = results.filter(Boolean).length;
const total = results.length;
console.log(`\n=== ${passed}/${total} providers OK ===`);
process.exit(passed > 0 && passed === total ? 0 : 1);
