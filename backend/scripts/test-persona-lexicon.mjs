/**
 * npm run build && node scripts/test-persona-lexicon.mjs
 */
import {
  findWateryContent,
  personaLexiconRetryHint,
  buildStoryRetryDirective,
} from '../dist/services/story-quality.js';

let failed = 0;
function fail(msg) {
  console.error('FAIL:', msg);
  failed++;
}
function ok(msg) {
  console.log('OK:', msg);
}

const fanScript =
  'Я обожаю, как они выпустили промо-сингл перед альбомом. Марк Foster писал текст в студии.';
const prodOpts = { skipPersonaCliches: true };
if (findWateryContent(fanScript, '', '', ['promotional single Foster'], prodOpts)) {
  fail('production gate must not reject «я обожаю»');
} else {
  ok('«я обожаю» allowed in production gate (persona via prompt)');
}

if (!personaLexiconRetryHint(fanScript, 'expert')) {
  fail('expert + я обожаю should get retry hint');
} else {
  ok('expert gets retry hint for fan lexicon');
}

if (personaLexiconRetryHint(fanScript, 'fan')) {
  fail('fan should not get lexicon hint for я обожаю');
} else {
  ok('fan narrator: no lexicon hint');
}

const retry = buildStoryRetryDirective('no concrete fact', 80, {
  script: fanScript,
  storyNarrator: 'radio_host',
});
if (!retry?.includes('я обожаю')) {
  fail('retry should include persona hint for radio_host');
} else {
  ok('retry merges quality reason + persona hint');
}

process.exit(failed > 0 ? 1 : 0);
