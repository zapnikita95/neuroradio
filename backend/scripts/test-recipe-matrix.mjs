/**
 * Live Groq matrix: lengths × narrators on Redbone.
 * Run: npm run build && node scripts/test-recipe-matrix.mjs
 */
import 'dotenv/config';
import { fetchReferenceFactBundle } from '../dist/services/wikipedia-facts.js';
import { pickReferenceFact } from '../dist/services/fact-picker.js';
import { generateStoryScript, hasGroqApiKey } from '../dist/services/groq.js';
import { validateStoryScript, countWords } from '../dist/services/story-quality.js';
import { getStoryLengthPreset } from '../dist/services/story-length.js';
import { isBoringFact } from '../dist/services/reference-fact-quality.js';

const TRACK = {
  artist: 'Redbone',
  title: 'Come and Get Your Love',
  year: 1974,
  genre: 'rock',
  countryCode: 'US',
};

const LENGTHS = ['30s', '60s', 'unlimited'];
const NARRATORS = [
  'auto',
  'radio_host',
  'contemporary',
  'expert',
  'fan',
  'backstage',
  'night_dj',
];

const rimmelFact =
  'The song appeared in a Rimmel London advert, in the film Live Free or Die Hard, and on the soundtracks of EA Sports FIFA Street 2 and Rugby 06.';

console.log('=== Boring fact filter ===');
console.log('Rimmel list boring:', isBoringFact(rimmelFact));

const bundle = await fetchReferenceFactBundle(TRACK.artist, TRACK.title, TRACK.countryCode);
const selected = pickReferenceFact(bundle, [], 0);
console.log('\nSelected fact:', selected?.fact ?? '(none)');

if (!hasGroqApiKey()) {
  console.warn('\nSKIP Groq — no GROQ_API_KEY');
  process.exit(0);
}

if (!selected) {
  console.error('No fact picked');
  process.exit(1);
}

console.log('\n=== Groq matrix ===\n');

for (const storyLength of LENGTHS) {
  const preset = getStoryLengthPreset(storyLength);
  console.log(`\n${'='.repeat(60)}\nLENGTH: ${storyLength} (${preset.wordsMin}-${preset.wordsMax} words)\n`);

  try {
    const story = await generateStoryScript({
      ...TRACK,
      voiceId: 'zahar',
      storyLength,
      storyNarrator: 'contemporary',
      previousScripts: [],
      referenceFacts: [selected.fact],
      selectedReferenceFact: selected,
    });
    const words = countWords(story.script);
    const quality = validateStoryScript(story.script, storyLength, TRACK.artist, TRACK.title, {
      referenceFacts: [selected.fact],
    });
    console.log(`[contemporary] words=${words} quality=${quality.ok ? 'OK' : quality.reason}`);
    console.log(story.script);
  } catch (err) {
    console.error(`[contemporary] ERROR: ${err instanceof Error ? err.message : err}`);
  }
}

console.log(`\n${'='.repeat(60)}\nNARRATORS @ 30s\n`);

for (const storyNarrator of NARRATORS) {
  try {
    const story = await generateStoryScript({
      ...TRACK,
      voiceId: 'zahar',
      storyLength: '30s',
      storyNarrator,
      previousScripts: [],
      referenceFacts: [selected.fact],
      selectedReferenceFact: selected,
    });
    const words = countWords(story.script);
    const preset = getStoryLengthPreset('30s');
    const inRange = words >= preset.wordsMin - 5 && words <= preset.wordsMax + 10;
    console.log(`\n[${storyNarrator}] words=${words} inRange≈${inRange}`);
    console.log(story.script.slice(0, 400) + (story.script.length > 400 ? '…' : ''));
  } catch (err) {
    console.error(`[${storyNarrator}] ERROR: ${err instanceof Error ? err.message : err}`);
  }
}
