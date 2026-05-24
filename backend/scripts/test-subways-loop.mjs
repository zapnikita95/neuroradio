/**
 * Run: npm run build && node scripts/test-subways-loop.mjs
 */
import 'dotenv/config';
import { fetchReferenceFactBundle } from '../dist/services/wikipedia-facts.js';
import { pickReferenceFact } from '../dist/services/fact-picker.js';
import { generateStoryScript, hasGroqApiKey } from '../dist/services/groq.js';
import {
  validateStoryScript,
  anchorsReferenceFact,
  hasFictionPattern,
} from '../dist/services/story-quality.js';
import { isBoringFact } from '../dist/services/reference-fact-quality.js';

const artist = 'The Subways';
const title = 'Rock & Roll Queen';
const year = 2005;
const countryCode = 'GB';

const badScript =
  'Я помогаюсь в создании музыки, как это происходит на студии. Артист, Брэд Салливан, и его команда работают вместе, чтобы создать этот трек «Rock & Roll Queen». Они сосредоточены на деталях, от выбора инструмента до постановки вокала.';

const bundle = await fetchReferenceFactBundle(artist, title, countryCode);
const selected = pickReferenceFact(bundle, [], 0);
console.log('Facts track:', bundle.trackFacts.length, 'artist:', bundle.artistFacts.length);
console.log('Selected:', selected?.fact?.slice(0, 180));
console.log('Bad script boring:', isBoringFact(badScript));

const badQ = validateStoryScript(badScript, '30s', artist, title, {
  referenceFacts: selected ? [selected.fact] : [],
});
if (badQ.ok || !hasFictionPattern(badScript)) {
  console.error('FAIL: bad studio script must be rejected', badQ);
  process.exit(1);
}
console.log('OK: bad studio script rejected:', badQ.reason);

if (!hasGroqApiKey()) {
  console.warn('No GROQ_API_KEY — quality gate only');
  process.exit(0);
}

let failed = 0;
for (const narrator of ['expert', 'night_dj', 'radio_host']) {
  let story;
  try {
    story = await generateStoryScript({
    artist,
    title,
    year,
    genre: 'rock',
    countryCode,
    voiceId: 'zahar',
    storyLength: '30s',
    storyNarrator: narrator,
    previousScripts: [],
    referenceFacts: selected ? [selected.fact] : [],
    selectedReferenceFact: selected ?? undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/403|Forbidden/i.test(msg)) {
      console.warn('Groq 403 — skipping live generation; quality gate for bad script already OK');
      process.exit(0);
    }
    throw err;
  }
  const q = validateStoryScript(story.script, '30s', artist, title, {
    referenceFacts: selected ? [selected.fact] : [],
  });
  const anchor = selected ? anchorsReferenceFact(story.script, [selected.fact]) : false;
  const fiction = /\b(помогаю|помогаюсь|работают вместе|сосредоточены|Brad|Брэд)\b/i.test(story.script);
  console.log(`\n--- ${narrator} ---`);
  console.log(story.script);
  console.log('quality:', q.ok ? 'OK' : q.reason, '| anchor:', anchor, '| fiction:', fiction);
  if (!q.ok || !anchor || fiction) failed++;
}
process.exit(failed > 0 ? 1 : 0);
