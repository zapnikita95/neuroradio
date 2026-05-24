/**
 * Run: npm run build && node scripts/test-facts-groq.mjs
 */
import 'dotenv/config';
import { fetchReferenceFactBundle } from '../dist/services/wikipedia-facts.js';
import { pickReferenceFact } from '../dist/services/fact-picker.js';
import { generateStoryScript, hasGroqApiKey } from '../dist/services/groq.js';
import { validateStoryScript, anchorsReferenceFact } from '../dist/services/story-quality.js';

const TRACKS = [
  { artist: 'Queen', title: 'Bohemian Rhapsody' },
  { artist: 'ABBA', title: 'Dancing Queen' },
  { artist: 'Lou Bega', title: 'Mambo No. 5' },
];

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}
function ok(msg) {
  console.log(`OK: ${msg}`);
}

console.log('=== Wikipedia fact bundles ===');
for (const track of TRACKS) {
  const bundle = await fetchReferenceFactBundle(track.artist, track.title);
  console.log(`\n${track.artist} — ${track.title}`);
  console.log(`  track facts (${bundle.trackFacts.length}):`);
  bundle.trackFacts.slice(0, 2).forEach((f, i) => console.log(`    ${i + 1}. ${f.slice(0, 120)}…`));
  console.log(`  artist facts (${bundle.artistFacts.length}):`);
  bundle.artistFacts.slice(0, 2).forEach((f, i) => console.log(`    ${i + 1}. ${f.slice(0, 120)}…`));

  if (bundle.trackFacts.length === 0 && bundle.artistFacts.length === 0) {
    fail(`no Wikipedia facts for ${track.artist} / ${track.title}`);
    continue;
  }

  const first = pickReferenceFact(bundle, [], 0);
  const second = pickReferenceFact(bundle, first ? [first.fact] : [], 1);
  if (!first) {
    fail(`pickReferenceFact returned null for ${track.title}`);
  } else {
    ok(`${track.title}: pick #1 scope=${first.scope}`);
    if (first.scope !== 'track') fail(`expected track scope on first story for ${track.title}`);
  }
  if (second) {
    ok(`${track.title}: pick #2 scope=${second.scope}`);
    if (second.scope !== 'artist') fail(`expected artist scope on second story for ${track.title}`);
    if (second.fact === first?.fact) fail(`second fact repeats first for ${track.title}`);
  }
}

if (!hasGroqApiKey()) {
  console.warn('\nSKIP Groq live test — GROQ_API_KEY not set');
  process.exit(failed > 0 ? 1 : 0);
}

console.log('\n=== Groq generation (Queen) ===');
const bundle = await fetchReferenceFactBundle('Queen', 'Bohemian Rhapsody');
const selected = pickReferenceFact(bundle, [], 0);
if (!selected) {
  fail('no selected fact for Groq test');
  process.exit(1);
}

console.log(`Selected (${selected.scope}): ${selected.fact.slice(0, 140)}…`);

try {
  const story = await generateStoryScript({
    artist: 'Queen',
    title: 'Bohemian Rhapsody',
    year: 1975,
    genre: 'rock',
    countryCode: 'GB',
    voiceId: 'zahar',
    storyLength: '30s',
    previousScripts: [],
    referenceFacts: [selected.fact],
    selectedReferenceFact: selected,
  });

  console.log(`\nScript (${story.word_count} words):\n${story.script}\n`);

  const quality = validateStoryScript(story.script, '30s', 'Queen', 'Bohemian Rhapsody', {
    referenceFacts: [selected.fact],
  });
  if (!quality.ok) fail(`quality rejected: ${quality.reason}`);
  else ok('quality gate passed');

  if (!anchorsReferenceFact(story.script, [selected.fact])) {
    fail('story does not anchor Wikipedia fact');
  } else {
    ok('anchors Wikipedia fact');
  }
} catch (err) {
  fail(`Groq generation failed: ${err instanceof Error ? err.message : err}`);
}

process.exit(failed > 0 ? 1 : 0);
