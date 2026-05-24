/**
 * Run: npm run build && node scripts/test-subways-bad-script.mjs
 */
import { validateStoryScript, hasFictionPattern } from '../dist/services/story-quality.js';

const badScript =
  'Я помогаюсь в создании музыки, как это происходит на студии. Артист, Брэд Салливан, и его команда работают вместе, чтобы создать этот трек «Rock & Roll Queen». Они сосредоточены на деталях, от выбора инструмента до постановки вокала.';

const artist = 'The Subways';
const title = 'Rock & Roll Queen';
const ref = [
  'Rock & Roll Queen is a song by English indie rock band The Subways, released as the second single from their debut album Young for Eternity.',
];

let failed = 0;
if (!hasFictionPattern(badScript)) {
  console.error('FAIL: hasFictionPattern should be true');
  failed++;
} else {
  console.log('OK: hasFictionPattern rejects bad script');
}

const q = validateStoryScript(badScript, '30s', artist, title, { referenceFacts: ref });
if (q.ok) {
  console.error('FAIL: validateStoryScript should reject bad script:', q);
  failed++;
} else {
  console.log('OK: validateStoryScript rejected:', q.reason);
}

process.exit(failed > 0 ? 1 : 0);
