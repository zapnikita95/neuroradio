import { validateStoryScript } from '../dist/services/story-quality.js';

const queenStory =
  'I Want To Break Free by Queen — это трек, который написал басист группы Джон Дикон. Обычно в коллективе авторами были Фредди Меркьюри или Брайан Мэй, но тут неожиданно прозвучал голос Дикона. После такой истории трек звучит не как filler, а как событие.';
const seed =
  '"I Want to Break Free" is a song performed by Queen, which was written by bassist John Deacon.';

let failed = 0;
const q = validateStoryScript(queenStory, undefined, 'Queen', 'I Want To Break Free', {
  referenceFacts: [seed],
  skipPersonaCliches: true,
  speakTrackNamesInVoiceover: true,
});
console.log('validate template closing=', q);
if (q.ok || !/template closing|hard reject/i.test(q.reason)) failed++;

const staleRadio =
  'В студии сомневались, но сингл всё равно вышел в ротацию. Такой факт в эфир не выкинешь — слушатели сразу цепляются.';
const staleQ = validateStoryScript(staleRadio, undefined, 'Queen', 'Bohemian Rhapsody', {
  referenceFacts: ['Bohemian Rhapsody was recorded by Queen.'],
  skipPersonaCliches: true,
  speakTrackNamesInVoiceover: true,
});
console.log('validate stale radio closing=', staleQ);
if (staleQ.ok || !/stale radio closing/i.test(staleQ.reason)) failed++;

process.exit(failed > 0 ? 1 : 0);
