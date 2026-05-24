/**
 * Run: npm run build && node scripts/test-redbone-facts.mjs
 */
import 'dotenv/config';
import { fetchReferenceFactBundle } from '../dist/services/wikipedia-facts.js';
import { pickReferenceFact } from '../dist/services/fact-picker.js';
import { generateStoryScript, hasGroqApiKey } from '../dist/services/groq.js';
import { validateStoryScript, anchorsReferenceFact } from '../dist/services/story-quality.js';

const artist = 'Redbone';
const title = 'Come and Get Your Love';
const year = 1974;
const countryCode = 'US';

const badStory =
  'Их звуки доносились из студии. Мы знали, что они работают над чем-то новым. Ахмад, основатель Redbone, стоял у микрофона. «Come and Get Your Love» – это их первый хит, который разлетелся по всей стране. Мы с друзьями слушали его на VK, снова и снова.';

console.log('=== Wikipedia facts ===');
const bundle = await fetchReferenceFactBundle(artist, title, countryCode);
console.log('track:', bundle.trackFacts.slice(0, 2));
console.log('artist:', bundle.artistFacts.slice(0, 2));

const selected = pickReferenceFact(bundle, [], 0);
console.log('\nSelected fact:', selected?.fact?.slice(0, 160));

if (!hasGroqApiKey()) {
  console.warn('\nSKIP Groq — no GROQ_API_KEY');
  process.exit(0);
}

if (!selected) {
  console.error('No fact picked');
  process.exit(1);
}

console.log('\n=== Groq night_dj ===');
const story = await generateStoryScript({
  artist,
  title,
  year,
  genre: 'rock',
  countryCode,
  voiceId: 'zahar',
  storyLength: '30s',
  storyNarrator: 'night_dj',
  previousScripts: [],
  referenceFacts: [selected.fact],
  selectedReferenceFact: selected,
});

console.log('\nScript:\n', story.script);
console.log('\nStarts with night tone:', /ноч|спиш/i.test(story.script.slice(0, 80)));

const quality = validateStoryScript(story.script, '30s', artist, title, {
  referenceFacts: [selected.fact],
});
console.log('Quality:', quality.ok ? 'OK' : quality.reason);
console.log('Anchors fact:', anchorsReferenceFact(story.script, [selected.fact]));
console.log('Contains VK:', /\bvk\b/i.test(story.script));
console.log('Bad story would fail:', !validateStoryScript(badStory, '30s', artist, title, { referenceFacts: [selected.fact] }).ok);
