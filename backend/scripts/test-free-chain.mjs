/** Production free chain smoke — node scripts/test-free-chain.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
const { buildOpenRouterFreeStoryModelChain } = await import('../dist/services/openrouter-models.js');

const SEED =
  'Michael Jackson invested five hundred thousand dollars of his own money in the Thriller music video. ' +
  'MTV primarily played rock; the fourteen-minute Thriller video was aired in full, interrupting regular programming. ' +
  'Album sales increased sevenfold after the video premiere. Director John Landis came from film; ' +
  'choreographer Michael Peters had to convince Landis to keep the zombie dance sequence. ' +
  'VHS tapes sold out in stores as people rewatched the video at home.';

const chain = buildOpenRouterFreeStoryModelChain();
console.log('Free story chain:', chain.join(' → '));

for (const storyNarrator of ['contemporary', 'fan', 'expert']) {
  console.log(`\n=== ${storyNarrator} ===`);
  try {
    const s = await generateStoryScript({
      artist: 'Michael Jackson',
      title: 'Thriller',
      year: 1982,
      genre: 'pop',
      countryCode: 'US',
      voiceId: 'zahar',
      storyLength: '60s',
      storyNarrator,
      referenceFacts: [SEED],
      selectedReferenceFact: { fact: SEED, scope: 'track', scopeLabelRu: 'трек' },
      openRouterModels: chain,
    });
    console.log(`OK ${s.word_count} words\n${s.script}`);
  } catch (e) {
    console.log('FAIL:', e instanceof Error ? e.message : e);
  }
}
