/**
 * Live Gemini smoke + quality test (local key or dist generateStoryScript).
 * Run: npm run build && node scripts/test-live-gemini-story.mjs
 */
import 'dotenv/config';
import { fetchAggregatedFactBundle } from '../dist/services/fact-aggregator.js';
import { pickReferenceFact } from '../dist/services/fact-picker.js';
import { generateStoryScript, hasGeminiApiKey } from '../dist/services/gemini.js';
import { validateStoryScript, countWords, findWateryContent } from '../dist/services/story-quality.js';
import { hasEnglishLeak } from '../dist/services/story-russian-language.js';

const TRACKS = [
  { artist: 'Stromae', title: 'Alors on danse (Radio Edit)', countryCode: 'BE', year: 2009, genre: 'electronic' },
  { artist: 'ABBA', title: 'Dancing Queen', countryCode: 'SE', year: 1976, genre: 'pop' },
  { artist: 'Redbone', title: 'Come and Get Your Love', countryCode: 'US', year: 1974, genre: 'rock' },
  { artist: 'Nirvana', title: 'Smells Like Teen Spirit', countryCode: 'US', year: 1991, genre: 'grunge' },
  { artist: 'Кино', title: 'Группа крови', countryCode: 'RU', year: 1988, genre: 'rock' },
];

async function generateForTrack(track) {
  const bundle = await fetchAggregatedFactBundle(track.artist, track.title, track.countryCode);
  const selected = pickReferenceFact(bundle, []);
  const facts = selected
    ? [selected.fact]
    : [...bundle.trackFacts, ...bundle.artistFacts].slice(0, 4);

  const story = await generateStoryScript({
    artist: track.artist,
    title: track.title,
    year: track.year,
    genre: track.genre,
    countryCode: track.countryCode,
    voiceId: 'zahar',
    storyLength: '30s',
    storyNarrator: 'contemporary',
    previousScripts: [],
    referenceFacts: facts,
    selectedReferenceFact: selected ?? undefined,
  });

  const words = countWords(story.script);
  const quality = validateStoryScript(story.script, '30s', track.artist, track.title, {
    referenceFacts: facts,
    strictLength: false,
  });
  const dry = findWateryContent(story.script, track.artist, track.title);
  const english = hasEnglishLeak(story.script, track.artist, track.title);

  return { story, words, quality, dry, english, facts };
}

if (!hasGeminiApiKey()) {
  console.error('SKIP: GEMINI_API_KEY not set in backend/.env');
  process.exit(1);
}

let failed = 0;
for (const track of TRACKS) {
  const label = `${track.artist} — ${track.title}`;
  try {
    const result = await generateForTrack(track);
    const issues = [];
    if (!result.quality.ok) issues.push(`quality: ${result.quality.reason}`);
    if (result.dry) issues.push(`watery: ${result.dry}`);
    if (result.english) issues.push('english leak');

    if (issues.length) {
      failed++;
      console.error(`FAIL: ${label} (${result.words}w) — ${issues.join('; ')}`);
      console.error(`  ${result.story.script.slice(0, 320)}${result.story.script.length > 320 ? '…' : ''}\n`);
    } else {
      console.log(`OK: ${label} (${result.words} words)`);
      console.log(`  ${result.story.script.slice(0, 280)}${result.story.script.length > 280 ? '…' : ''}\n`);
    }
  } catch (err) {
    failed++;
    console.error(`ERROR: ${label}: ${err instanceof Error ? err.message : err}\n`);
  }
}

process.exit(failed > 0 ? 1 : 0);
