/**
 * Live Groq — all narrators × tracks. Rejects generic studio fiction.
 * Run: npm run build && node scripts/test-narrators-groq.mjs
 */
import 'dotenv/config';
import fetch from 'node-fetch';
import { fetchAggregatedFactBundle } from '../dist/services/fact-aggregator.js';
import { pickReferenceFact } from '../dist/services/fact-picker.js';
import {
  buildPersonaForNarrator,
  buildStoryUserPrompt,
  buildSystemPrompt,
} from '../dist/services/prompts.js';
import { STORY_NARRATOR_PRESETS } from '../dist/services/story-narrator.js';
import { DEFAULT_STORY_LENGTH, getStoryLengthPreset } from '../dist/services/story-length.js';
import { findGenericFiction, validateStoryScript } from '../dist/services/story-quality.js';
import { generateStoryScript } from '../dist/services/groq.js';

const TRACKS = [
  { artist: 'Afric Simone', title: 'Hafanana', countryCode: 'RU' },
  { artist: 'Jorge Ben', title: 'Mas Que Nada', countryCode: 'BR' },
  { artist: 'Redbone', title: 'Come and Get Your Love', countryCode: 'US' },
];

const NARRATORS = ['auto', ...Object.keys(STORY_NARRATOR_PRESETS)];

const apiKey = process.env.GROQ_API_KEY?.trim();
if (!apiKey) {
  console.error('SKIP: GROQ_API_KEY not set');
  process.exit(1);
}

let failed = 0;

for (const track of TRACKS) {
  console.log(`\n=== ${track.artist} — ${track.title} ===`);
  const bundle = await fetchAggregatedFactBundle(track.artist, track.title, track.countryCode);
  const selected = pickReferenceFact(bundle, []);
  const facts = selected ? [selected.fact] : [...bundle.trackFacts, ...bundle.artistFacts].slice(0, 4);
  console.log('SEED:', selected?.fact?.slice(0, 160) ?? facts[0]?.slice(0, 160) ?? '(empty)');

  if (facts.length === 0) {
    console.error('FAIL: no reference facts');
    failed++;
    continue;
  }

  for (const narratorId of NARRATORS) {
    try {
      const story = await generateStoryScript({
        artist: track.artist,
        title: track.title,
        countryCode: track.countryCode,
        voiceId: 'zahar',
        storyLength: DEFAULT_STORY_LENGTH,
        storyNarrator: narratorId,
        previousScripts: [],
        referenceFacts: facts,
        selectedReferenceFact: selected ?? undefined,
      });
      const fiction = findGenericFiction(story.script);
      const quality = validateStoryScript(story.script, DEFAULT_STORY_LENGTH, track.artist, track.title, {
        referenceFacts: facts,
      });
      if (fiction || !quality.ok) {
        failed++;
        console.error(`FAIL [${narratorId}]: ${fiction ?? quality.reason}`);
        console.error(`  ${story.script.slice(0, 140)}…`);
      } else {
        console.log(`OK [${narratorId}]: ${story.script.slice(0, 120)}…`);
      }
    } catch (err) {
      failed++;
      console.error(`FAIL [${narratorId}]: ${err.message}`);
    }
  }
}

console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILURES`}`);
process.exit(failed > 0 ? 1 : 0);
