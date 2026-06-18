#!/usr/bin/env node
import { isEncyclopediaDefinitionSeed } from '../dist/services/reference-fact-quality.js';
import { isRejectedPickSeed } from '../dist/services/fact-seed-pick.js';

const cases = [
  ['"Sorry" is a song by Canadian singer Justin Bieber for his fourth studio album Purpose.', true],
  ['"Shape of You" is a song by singer-songwriter Ed Sheeran.', true],
  ['Shape of You Ed Sheeran (2017) — за одну ночь как шутка про курортные романы', false],
  ['Dolly Parton написала I Will Always Love You в 1973 как прощание продюсеру', false],
  ['«Weak» впервые прозвучала на живом выступлении SWV 01-07-2025 (CFG Bank Arena, Baltimore)', false],
];

let ok = 0;
for (const [fact, expectReject] of cases) {
  const enc = isEncyclopediaDefinitionSeed(fact);
  const pick = isRejectedPickSeed(fact, 'Sorry', 'ru', [], 'Justin Bieber');
  const pass = enc === expectReject;
  console.log(`${pass ? 'OK' : 'FAIL'} enc=${enc} pick=${pick} | ${fact.slice(0, 90)}`);
  if (pass) ok += 1;
}
console.log(`\n${ok}/${cases.length} filter checks`);
process.exit(ok === cases.length ? 0 : 1);
