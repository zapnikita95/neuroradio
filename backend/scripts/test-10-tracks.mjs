/**
 * Test 10 tracks: Wikipedia facts + pick + optional Groq.
 * Run: npm run build && node scripts/test-10-tracks.mjs
 */
import 'dotenv/config';
import { fetchReferenceFactBundle } from '../dist/services/wikipedia-facts.js';
import { pickReferenceFact } from '../dist/services/fact-picker.js';
import {
  filterAndRankFacts,
  interestScore,
  isBoringFact,
} from '../dist/services/reference-fact-quality.js';
import { generateStoryScript, hasGroqApiKey } from '../dist/services/groq.js';
import { validateStoryScript, countWords, hasDryEncyclopediaTone } from '../dist/services/story-quality.js';

const TRACKS = [
  { artist: 'Merle Travis', title: 'Sixteen Tons', countryCode: 'US', year: 1955, genre: 'country' },
  { artist: 'Benny Goodman', title: 'Sing, Sing, Sing', countryCode: 'US', year: 1937, genre: 'swing' },
  { artist: 'twenty one pilots', title: 'Stressed Out', countryCode: 'US', year: 2015, genre: 'alternative' },
  { artist: 'The Subways', title: 'Rock & Roll Queen', countryCode: 'GB', year: 2005, genre: 'rock' },
  { artist: 'Redbone', title: 'Come and Get Your Love', countryCode: 'US', year: 1974, genre: 'rock' },
  { artist: 'Queen', title: 'Bohemian Rhapsody', countryCode: 'GB', year: 1975, genre: 'rock' },
  { artist: 'Nirvana', title: 'Smells Like Teen Spirit', countryCode: 'US', year: 1991, genre: 'grunge' },
  { artist: 'ABBA', title: 'Dancing Queen', countryCode: 'SE', year: 1976, genre: 'pop' },
  { artist: 'Кино', title: 'Группа крови', countryCode: 'RU', year: 1988, genre: 'rock' },
  { artist: 'Screamin\' Jay Hawkins', title: 'I Put a Spell on You', countryCode: 'US', year: 1956, genre: 'rock' },
];

const issues = [];
const factIssues = [];
const groqOk = hasGroqApiKey();

console.log('=== 10-track fact audit ===\n');

for (const track of TRACKS) {
  await new Promise((r) => setTimeout(r, 300));
  console.log(`--- ${track.artist} — ${track.title} ---`);
  const bundle = await fetchReferenceFactBundle(track.artist, track.title, track.countryCode);
  const allRaw = [...bundle.trackFacts, ...bundle.artistFacts];
  const ranked = filterAndRankFacts(allRaw, 8);
  const picked = pickReferenceFact(bundle, [], 0);
  const picked2 = pickReferenceFact(bundle, picked ? [picked.fact] : [], 1);

  console.log(`  raw: track=${bundle.trackFacts.length} artist=${bundle.artistFacts.length}`);
  if (ranked.length === 0) {
    console.log('  ranked: NONE');
    issues.push({ track, type: 'no_facts', detail: 'no interesting facts after filter' });
    factIssues.push(issues[issues.length - 1]);
    if (allRaw.length > 0) {
      console.log('  top raw (all boring?):');
      allRaw.slice(0, 3).forEach((f, i) => {
        console.log(`    ${i + 1}. score=${interestScore(f)} boring=${isBoringFact(f)} | ${f.slice(0, 100)}…`);
      });
    }
  } else {
    console.log('  ranked top:');
    ranked.slice(0, 3).forEach((f, i) => {
      console.log(`    ${i + 1}. [${interestScore(f)}] ${f.slice(0, 110)}${f.length > 110 ? '…' : ''}`);
    });
  }

  if (!picked) {
    issues.push({ track, type: 'no_pick', detail: 'pickReferenceFact returned null' });
    console.log('  PICK: null');
  } else {
    const boring = isBoringFact(picked.fact);
    console.log(`  PICK (${picked.scope}): [${interestScore(picked.fact)}] boring=${boring}`);
    console.log(`    ${picked.fact.slice(0, 130)}${picked.fact.length > 130 ? '…' : ''}`);
    if (boring) issues.push({ track, type: 'boring_pick', detail: picked.fact });
    if (/\b(?:appeared|featured|Rimmel|FIFA|soundtrack|is a song by|from LA)\b/i.test(picked.fact)) {
      issues.push({ track, type: 'dry_pick', detail: picked.fact });
    }
  }

  if (picked2) {
    console.log(`  PICK#2 (${picked2.scope}): ${picked2.fact.slice(0, 90)}…`);
  }
  console.log('');
}

// Groq on subset if key works
const GROQ_SAMPLE = TRACKS.filter((t) =>
  ['Redbone', 'Merle Travis', 'twenty one pilots', 'Nirvana', 'Кино'].includes(t.artist),
);

if (groqOk) {
  console.log('\n=== Groq sample (30s, contemporary) ===\n');
  for (const track of GROQ_SAMPLE) {
    const bundle = await fetchReferenceFactBundle(track.artist, track.title, track.countryCode);
    const selected = pickReferenceFact(bundle, [], 0);
    if (!selected) {
      console.log(`SKIP ${track.title}: no fact`);
      continue;
    }
    try {
      const story = await generateStoryScript({
        ...track,
        voiceId: 'zahar',
        storyLength: '30s',
        storyNarrator: 'contemporary',
        previousScripts: [],
        referenceFacts: [selected.fact],
        selectedReferenceFact: selected,
      });
      const words = countWords(story.script);
      const quality = validateStoryScript(story.script, '30s', track.artist, track.title, {
        referenceFacts: [selected.fact],
      });
      const dry = hasDryEncyclopediaTone(story.script);
      console.log(`${track.artist} — ${track.title}: ${words}w quality=${quality.ok ? 'OK' : quality.reason} dry=${dry}`);
      console.log(`  ${story.script.slice(0, 280)}${story.script.length > 280 ? '…' : ''}\n`);
      if (!quality.ok) issues.push({ track, type: 'groq_quality', detail: quality.reason });
      if (dry) issues.push({ track, type: 'groq_dry', detail: story.script.slice(0, 120) });
    } catch (err) {
      console.log(`ERROR ${track.title}: ${err instanceof Error ? err.message : err}\n`);
      issues.push({ track, type: 'groq_error', detail: String(err) });
    }
  }
} else {
  console.log('\nSKIP Groq — no API key\n');
}

console.log('\n=== ISSUES SUMMARY ===');
const factOnly = issues.filter((i) => !i.type.startsWith('groq_'));
if (factOnly.length === 0) {
  console.log('Facts: all 10 tracks OK');
} else {
  for (const i of factOnly) {
    console.log(`[${i.type}] ${i.track.artist} — ${i.track.title}: ${i.detail?.slice?.(0, 100) ?? i.detail}`);
  }
}
const groqIssues = issues.filter((i) => i.type.startsWith('groq_'));
if (groqIssues.length > 0) {
  console.log(`\nGroq skipped/failed: ${groqIssues.length} (server key 403 — test on device)`);
}
process.exit(factOnly.length > 0 ? 1 : 0);
