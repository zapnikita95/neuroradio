#!/usr/bin/env node
/** Scan Railway CSV logs for wrongly rejected narrative/backstory seeds. */
import { readFileSync } from 'node:fs';
import { isNonMusicTitleCollisionFact } from '../dist/services/fact-relevance.js';
import { isRejectedPickSeed } from '../dist/services/fact-seed-pick.js';
import { isArtistBackstoryNarrative } from '../dist/services/web-snippet-accept.js';
import { interestScore } from '../dist/services/reference-fact-quality.js';
import { isBoringFact } from '../dist/services/reference-fact-quality.js';

const logPath = process.argv[2];
if (!logPath) {
  console.error('Usage: node scripts/audit-log-rejections.mjs <logs.csv>');
  process.exit(2);
}

const text = readFileSync(logPath, 'utf8');

function extractFacts(pattern) {
  const out = [];
  const re = new RegExp(pattern, 'gi');
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = (m[1] ?? m[0]).replace(/""/g, '"').trim();
    out.push(raw);
  }
  return out;
}

const unanchored = extractFacts('reject unanchored seed ORIGIN=[^ ]+ fact=""([^""]+)""');
const weakRejected = extractFacts('weak seed rejected score=\\d+ fact=""([^""]+)""');
const rejectWeak = extractFacts('reject weak seed score=\\d+ fact=""([^""]+)""');
const saved = (text.match(/\[fact-bank\] saved/g) ?? []).length;
const noFacts = (text.match(/NO_REFERENCE_FACTS|не удалось собрать|не получилось/gi) ?? []).length;

const narrativeLike = [...unanchored, ...weakRejected, ...rejectWeak].filter((f) =>
  isArtistBackstoryNarrative(f),
);

const taxLike = [...unanchored, ...weakRejected, ...rejectWeak].filter((f) =>
  /\b(?:95\s*%|supertax|tax rate|one for you|income tax|written.*tax|protest.*tax)\b/i.test(f),
);

const collisionFalsePos = [...unanchored, ...weakRejected, ...rejectWeak].filter((f) => {
  const m = f.match(/^(.+?) — (.+?)(?:\"|$)/) ?? f.match(/artist="([^"]+)".*title="([^"]+)"/);
  if (!m) return false;
  const title = m[2] ?? '';
  const artist = m[1] ?? '';
  if (!title || title.length > 80) return false;
  return isNonMusicTitleCollisionFact(f, title, artist);
});

console.log('=== LOG AUDIT ===');
console.log('file:', logPath);
console.log('fact-bank saved:', saved);
console.log('no-facts errors:', noFacts);
console.log('unanchored rejects:', unanchored.length);
console.log('weak seed rejects:', weakRejected.length + rejectWeak.length);
console.log('');
console.log('NARRATIVE/BACKSTORY wrongly in reject logs:', narrativeLike.length);
for (const f of narrativeLike.slice(0, 25)) {
  console.log('  -', f.slice(0, 180));
  console.log('    backstory=', isArtistBackstoryNarrative(f), 'pickReject=', isRejectedPickSeed(f, '', 'ru', [], ''));
}
console.log('');
console.log('TAX-MEANING facts in reject logs:', taxLike.length);
for (const f of taxLike) console.log('  -', f.slice(0, 200));
console.log('');
console.log('Would-be title-collision (check Taxman-like):', collisionFalsePos.length);
for (const f of collisionFalsePos.slice(0, 10)) console.log('  -', f.slice(0, 200));

// Bulk simulation on narrative samples
console.log('\n=== BULK wouldReject (isBoringFact) ===');
const bulkWouldBoring = narrativeLike.filter((f) => isBoringFact(f));
console.log('narrative marked boring by bulk gate:', bulkWouldBoring.length);
for (const f of bulkWouldBoring.slice(0, 15)) {
  console.log(`  score=${interestScore(f)} boring=${isBoringFact(f)} | ${f.slice(0, 120)}`);
}
