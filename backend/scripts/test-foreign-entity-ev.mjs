/**
 * Run: npm run build && node scripts/test-foreign-entity-ev.mjs
 */
import { factNamesForeignEntity } from '../dist/services/fact-relevance.js';
import { acceptSearchGroundedSnippet } from '../dist/services/web-snippet-accept.js';
import { pickSalvageSnippetSeed } from '../dist/services/search-snippet-salvage.js';

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

const btsSnippet =
  'EV - Cuppa Tea (Official Music Video) - YouTube. Fans are criticizing BigHit Music after BTS was reportedly credited on Jungkook solo FIFA World Cup song Dreamers.';

ok(factNamesForeignEntity(btsSnippet, 'EV', 'Cuppa Tea'), 'BTS/Jungkook snippet flagged as foreign for EV');
ok(!acceptSearchGroundedSnippet(btsSnippet, 'EV', 'Cuppa Tea'), 'BTS snippet rejected for salvage accept');
ok(
  pickSalvageSnippetSeed([btsSnippet], 'EV', 'Cuppa Tea') === null,
  'BTS snippet not picked as salvage seed',
);

const goodSnippet =
  'EV - Cuppa Tea (Official Video) — WORDPLAY. Hailing from the unlikely breeding ground of Bury St Edmunds in Suffolk, UK star EV blends rap and indie.';
ok(!factNamesForeignEntity(goodSnippet, 'EV', 'Cuppa Tea'), 'EV bio snippet not foreign');
ok(acceptSearchGroundedSnippet(goodSnippet, 'EV', 'Cuppa Tea'), 'EV bio snippet accepted');

if (process.exitCode) process.exit(process.exitCode);
console.log('\nAll foreign-entity EV checks passed.');
