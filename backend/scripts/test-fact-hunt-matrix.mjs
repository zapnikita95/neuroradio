/**
 * Narrator × track matrix via local fact context + Groq story (30s).
 * Run: npm run build && node scripts/test-fact-hunt-matrix.mjs
 */
import 'dotenv/config';
import { fetchAggregatedFactContext } from '../dist/services/fact-aggregator.js';
import { pickReferenceFact } from '../dist/services/fact-picker.js';
import {
  huntReferenceFactWithLlm,
  shouldRunLlmFactHunt,
} from '../dist/services/story-llm-fact-hunt.js';
import { generateStoryScript, hasGroqApiKey } from '../dist/services/groq.js';
import { validateStoryScript, countWords } from '../dist/services/story-quality.js';
import { listNarratorOptions } from '../dist/services/story-narrator.js';

const TRACKS = [
  { artist: 'Queen', title: 'Bohemian Rhapsody', year: 1975, genre: 'rock' },
  { artist: 'Jencarlos', title: 'Caramba', year: undefined, genre: 'latin' },
  { artist: 'Кино', title: 'Группа крови', year: 1988, genre: 'rock' },
];

const NARRATORS = listNarratorOptions().map((o) => o.id);

let failed = 0;

if (!hasGroqApiKey()) {
  console.warn('SKIP — no GROQ_API_KEY');
  process.exit(0);
}

for (const track of TRACKS) {
  console.log(`\n${'='.repeat(56)}\n${track.artist} — ${track.title}\n`);
  const ctx = await fetchAggregatedFactContext(track.artist, track.title);
  let selected = pickReferenceFact(ctx.bundle, [], 0, track.artist, track.title);
  const bundleCount = ctx.bundle.trackFacts.length + ctx.bundle.artistFacts.length;

  if (shouldRunLlmFactHunt(selected, ctx.rawSnippets.length, bundleCount)) {
    const hunted = await huntReferenceFactWithLlm({
      artist: track.artist,
      title: track.title,
      year: track.year,
      genre: track.genre,
      rawSnippets: ctx.rawSnippets,
      preferredProvider: 'groq',
    });
    if (hunted) {
      selected = hunted;
      console.log(`LLM hunt seed: ${hunted.fact.slice(0, 140)}…`);
    }
  } else if (selected) {
    console.log(`Picker seed: ${selected.fact.slice(0, 140)}…`);
  }

  if (!selected) {
    console.error(`SKIP stories — no seed (raw=${ctx.rawSnippets.length})`);
    failed++;
    continue;
  }

  for (const storyNarrator of NARRATORS) {
    try {
      const story = await generateStoryScript({
        artist: track.artist,
        title: track.title,
        year: track.year,
        genre: track.genre,
        voiceId: 'zahar',
        storyLength: '30s',
        storyNarrator,
        previousScripts: [],
        referenceFacts: [selected.fact],
        selectedReferenceFact: selected,
      });
      const q = validateStoryScript(story.script, '30s', track.artist, track.title, {
        referenceFacts: [selected.fact],
        strictLength: false,
      });
      const tag = q.ok ? 'OK' : q.reason;
      console.log(`  [${storyNarrator}] ${tag} (${countWords(story.script)}w)`);
      if (!q.ok) failed++;
      if (/расизм|дискриминац/i.test(story.script)) {
        console.error(`  FAIL racism in script for ${storyNarrator}`);
        failed++;
      }
    } catch (err) {
      console.error(`  [${storyNarrator}] ERROR: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

process.exit(failed > 0 ? 1 : 0);
