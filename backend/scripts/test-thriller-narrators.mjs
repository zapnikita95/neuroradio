/**
 * Thriller × 4 narrators — smoke after persona prompt tweaks.
 * Run: npm run build && node scripts/test-thriller-narrators.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repoRoot = resolve(root, '..');

for (const p of [resolve(repoRoot, '.env'), resolve(root, '.env')]) {
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

const SEED =
  'Michael Jackson invested five hundred thousand dollars of his own money in the Thriller music video. ' +
  'MTV primarily played rock; the fourteen-minute Thriller video was aired in full, interrupting regular programming. ' +
  'Album sales increased sevenfold after the video premiere. Director John Landis came from film; ' +
  'choreographer Michael Peters had to convince Landis to keep the zombie dance sequence. ' +
  'VHS tapes sold out in stores as people rewatched the video at home.';

const NARRATORS = ['contemporary', 'expert', 'fan', 'backstage'];

if (!process.env.OPEN_ROUTER_API_KEY?.trim()) {
  console.error('SKIP: OPEN_ROUTER_API_KEY not set');
  process.exit(1);
}

console.log('=== Michael Jackson — Thriller (seed fact) ===\n');
console.log(`${SEED.slice(0, 120)}…\n`);

for (const storyNarrator of NARRATORS) {
  console.log(`--- ${storyNarrator} ---`);
  try {
    const story = await generateStoryScript({
      artist: 'Michael Jackson',
      title: 'Thriller',
      year: 1982,
      genre: 'pop',
      countryCode: 'US',
      voiceId: 'zahar',
      storyLength: '60s',
      storyNarrator,
      referenceFacts: [SEED],
      selectedReferenceFact: {
        fact: SEED,
        scope: 'track',
        scopeLabelRu: 'трек',
      },
      openRouterModel:
        process.env.OPENROUTER_STORY_MODEL?.trim() || 'deepseek/deepseek-chat-v3-0324',
    });
    console.log(story.script);
    console.log(`[words=${story.word_count}]\n`);
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : err}\n`);
  }
}
