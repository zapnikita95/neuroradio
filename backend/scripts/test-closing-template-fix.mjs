import { sanitizeClosingTail } from '../dist/services/story-closing-phrases.js';
import { validateStoryScript } from '../dist/services/story-quality.js';

const queenStory =
  'I Want To Break Free by Queen — это трек, который написал басист группы Джон Дикон. Обычно в коллективе авторами были Фредди Меркьюри или Брайан Мэй, но тут неожиданно прозвучал голос Дикона. После такой истории трек звучит не как filler, а как событие.';
const seed =
  '"I Want to Break Free" is a song performed by Queen, which was written by bassist John Deacon.';

let failed = 0;

const sanitizedQueen = sanitizeClosingTail(queenStory, 'ru');
console.log('sanitize filler closing=', sanitizedQueen);
if (/filler|филлер|событие/i.test(sanitizedQueen.slice(-80))) {
  console.error('FAIL: bad filler closing should be stripped');
  failed++;
}

const staleRadio =
  'В студии сомневались, но сингл всё равно вышел в ротацию. Такой факт в эфир не выкинешь — слушатели сразу цепляются.';
const sanitizedStale = sanitizeClosingTail(staleRadio, 'ru');
console.log('sanitize stale radio closing=', sanitizedStale);
if (/в эфир не выкинешь/i.test(sanitizedStale)) {
  console.error('FAIL: stale radio closing should be stripped');
  failed++;
}

const q = validateStoryScript(queenStory, undefined, 'Queen', 'I Want To Break Free', {
  referenceFacts: [seed],
  skipPersonaCliches: true,
  speakTrackNamesInVoiceover: true,
});
console.log('validate after auto-sanitize path=', q);
if (/template closing|filler|филлер/i.test(q.reason ?? '')) {
  console.error('FAIL: should auto-fix closing, not reject for filler template');
  failed++;
}

process.exit(failed > 0 ? 1 : 0);
