/**
 * Direct Groq story generation via dist/services/groq.js (local GROQ_API_KEY).
 */
import 'dotenv/config';
import { generateStoryScript, hasGroqApiKey } from '../dist/services/groq.js';
import { validateStoryScript } from '../dist/services/story-quality.js';
import { voiceForYear } from '../dist/services/voices.js';

const TRACKS = [
  { artist: 'James Brown', title: 'I Got You (I Feel Good)', year: 1965, genre: 'funk' },
  { artist: 'Elvis Presley', title: 'Suspicious Minds', year: 1969, genre: 'rock' },
  { artist: 'Miles Davis', title: 'So What', year: 1959, genre: 'jazz' },
  { artist: '2Pac', title: 'California Love', year: 1996, genre: 'hip hop' },
  { artist: 'Billie Eilish', title: 'bad guy', year: 2019, genre: 'pop' },
];

async function main() {
  if (!hasGroqApiKey()) {
    console.error('FAIL: GROQ_API_KEY not set in .env');
    process.exit(2);
  }

  console.log('Direct Groq benchmark (local key)');
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const track of TRACKS) {
    const label = `${track.artist} — ${track.title}`;
    process.stdout.write(`\n=== ${label} ===\n`);
    try {
      const voiceId = voiceForYear(track.year, track.genre);
      const story = await generateStoryScript({
        artist: track.artist,
        title: track.title,
        year: track.year,
        genre: track.genre,
        voiceId,
        storyLength: '30s',
        previousScripts: [],
      });

      const q = validateStoryScript(story.script, '30s', track.artist, track.title);
      if (q.ok) {
        passed++;
        console.log(`OK (${story.word_count} words, voice=${story.voiceId})`);
        console.log(story.script);
      } else {
        failed++;
        failures.push({ label, reason: q.reason, script: story.script });
        console.log(`QUALITY FAIL: ${q.reason}`);
        console.log(story.script);
      }
    } catch (e) {
      failed++;
      failures.push({ label, reason: e.message });
      console.log(`ERROR: ${e.message.slice(0, 500)}`);
    }
  }

  console.log(`\n========== SUMMARY ==========`);
  console.log(`Passed: ${passed}/${TRACKS.length}`);
  console.log(`Failed: ${failed}/${TRACKS.length}`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`- ${f.label}: ${f.reason}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
