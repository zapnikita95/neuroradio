/**
 * Offline checks: length plan in prompts + boring media facts.
 * Run: npm run build && node scripts/test-recipe-offline.mjs
 */
import { buildSystemPrompt, buildStoryUserPrompt } from '../dist/services/prompts.js';
import { buildPersonaForNarrator } from '../dist/services/story-narrator.js';
import { getStoryLengthPreset } from '../dist/services/story-length.js';
import { isBoringFact } from '../dist/services/reference-fact-quality.js';

let failed = 0;
const fail = (m) => {
  console.error('FAIL:', m);
  failed++;
};
const ok = (m) => console.log('OK:', m);

const mediaFact =
  'The song appeared in a Rimmel London advert, in the film Live Free or Die Hard, and on the soundtracks of EA Sports FIFA Street 2 and Rugby 06.';

if (!isBoringFact(mediaFact)) fail('Rimmel media list should be boring');
else ok('Rimmel media list rejected');

for (const id of ['15s', '30s', '60s', 'unlimited']) {
  const length = getStoryLengthPreset(id);
  const persona = buildPersonaForNarrator('contemporary', 1974, 'rock', 'Redbone', 'Come and Get Your Love', 'US');
  const system = buildSystemPrompt(persona, length);
  const user = buildStoryUserPrompt({
    artist: 'Redbone',
    title: 'Come and Get Your Love',
    year: 1974,
    genre: 'rock',
    countryCode: 'US',
    voiceId: 'zahar',
    angle: { labelRu: 'Смысл', wrapHint: 'Почему цепляет' },
    storyLength: id,
    storyNarrator: 'contemporary',
    selectedReferenceFact: {
      fact: 'It made them the first Native American band to reach the top five on the US Billboard Hot 100.',
      scope: 'track',
      scopeLabelRu: 'трек',
    },
    referenceFacts: [],
  });

  if (!system.includes('ЖЁСТКИЙ ОБЪЁМ')) fail(`${id}: missing strict length in system`);
  if (!system.includes(`${length.wordsMin}–${length.wordsMax}`)) fail(`${id}: word range missing`);
  if (!user.includes('ЖЁСТКАЯ ДЛИНА')) fail(`${id}: missing strict length in user`);
  if (!user.includes('КРЮЧОК')) fail(`${id}: missing recipe hook in user`);

  if (id === '15s' && !system.includes('КРЮЧОК + одна ударная')) fail('15s plan missing hook-only');
  if (id === '30s' && !system.includes('4–6 коротких')) fail('30s plan missing sentence hint');
  if (id === '60s' && !system.includes('внутренняя кухня')) fail('60s plan missing kitchen');
}

if (failed === 0) ok('All offline recipe checks passed');
process.exit(failed > 0 ? 1 : 0);
