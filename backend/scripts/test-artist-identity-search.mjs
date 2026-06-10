/**
 * Run: npm run build && node scripts/test-artist-identity-search.mjs
 */
import {
  buildArtistIdentityQueries,
  buildWebOnlyQueries,
} from '../dist/services/web-search-facts.js';
import {
  isArtistIdentityBioSnippet,
  acceptIndieEmergingSnippet,
} from '../dist/services/web-snippet-accept.js';
import { interestScore } from '../dist/services/reference-fact-quality.js';

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

const galagaQueries = buildArtistIdentityQueries('GALAGA');
ok(galagaQueries.some((q) => q.includes('артист')), 'GALAGA identity queries include артист');
console.log('GALAGA queries →', galagaQueries);

const webQueries = buildWebOnlyQueries('GALAGA', 'Английская рубашка');
ok(webQueries.some((q) => /galaga артист/i.test(q)), 'web-only uses GALAGA артист for latin+cyrillic track');
console.log('web-only →', webQueries);

const bio =
  'GALAGA — Русский рэп GALAGA — сольный проект Родиона Лубенского, известного как вокалиста и создателя группы «Голос Омерики».';
ok(isArtistIdentityBioSnippet(bio), 'detects artist identity bio snippet');
ok(acceptIndieEmergingSnippet(bio, 'GALAGA', 'Английская рубашка'), 'accepts GALAGA bio for salvage');
ok(interestScore(bio) >= 6, 'bio scores as interesting seed');
console.log('bio score →', interestScore(bio));

if (process.exitCode) process.exit(process.exitCode);
console.log('\nAll artist-identity checks passed.');
