import { isEncyclopediaDefinitionSeed, isBoringFact } from '../dist/services/reference-fact-quality.js';
import { isRejectedPickSeed } from '../dist/services/fact-seed-pick.js';
import { sanitizeScriptForTts } from '../dist/services/story-quality.js';

const seed =
  '"Never Gonna Give You Up" is a pop song originally performed by Rick Astley.';
const raw =
  'Never Gonna Give You Up by Rick Astley — это поп-хит, где баритон артиста стал визитной карточкой трека.';

let failed = 0;
if (!isEncyclopediaDefinitionSeed(seed)) failed++;
if (!isBoringFact(seed)) failed++;
if (!isRejectedPickSeed(seed, 'Never Gonna Give You Up', 'ru', [], 'Rick Astley')) failed++;

const once = sanitizeScriptForTts(raw, 'Rick Astley', 'Never Gonna Give You Up', [seed], {
  speakTrackNamesInVoiceover: true,
});
const twice = sanitizeScriptForTts(once, 'Rick Astley', 'Never Gonna Give You Up', [seed], {
  speakTrackNamesInVoiceover: true,
});
if (!twice.includes('Never Gonna Give You Up by Rick Astley')) failed++;

console.log({ encyclopedia: isEncyclopediaDefinitionSeed(seed), twice: twice.slice(0, 80) });
process.exit(failed > 0 ? 1 : 0);
