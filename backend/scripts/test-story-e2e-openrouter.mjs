#!/usr/bin/env node
/** End-to-end OpenRouter story generation (same path as production). */
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

const { generateStoryScript } = await import('../dist/services/openrouter.js');

const artist = process.argv[2] ?? 'Michael Jackson';
const title = process.argv[3] ?? "They Don't Care About Us";
const seed =
  process.argv[4] ??
  'The song was released on March 31, 1996 as the fourth single from HIStory. Music videos were controversial.';

console.log(`Testing generateStoryScript: ${artist} — ${title}`);
console.log(`Seed: ${seed.slice(0, 100)}…`);

try {
  const story = await generateStoryScript({
    artist,
    title,
    year: 1996,
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
    openRouterModel: 'liquid/lfm-2.5-1.2b-instruct:free',
  });
  console.log('\nOK words=', story.word_count);
  console.log('SCRIPT:\n', story.script);
  process.exit(0);
} catch (e) {
  console.error('\nFAIL:', e.message);
  process.exit(1);
}
