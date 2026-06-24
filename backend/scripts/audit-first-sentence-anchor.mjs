#!/usr/bin/env node
/**
 * Audit opening-anchor gate: how often strict (sentence 1 only) vs relaxed (2 sentences + bridges) differ.
 *
 *   cd backend && npm run build && node scripts/audit-first-sentence-anchor.mjs
 */
import {
  anchorsReferenceFact,
  openingAnchoredToFact,
  openingBlockForAnchor,
  validateStoryScript,
} from '../dist/services/story-quality.js';
import { qualityOptionsForProductionAttempt } from '../dist/services/story-generate-loop.js';

/** Legacy check — first sentence only, pre-fix behavior. */
function legacyFirstSentenceOnly(script, facts) {
  const first = script.split(/(?<=[.!?…])\s+/).find(Boolean)?.trim() ?? '';
  if (first.length < 12) return false;
  return anchorsReferenceFact(first, facts);
}

const CASES = [
  {
    label: 'Stromae — RU paraphrase origin (2 sentences)',
    artist: 'Stromae',
    title: 'Alors on danse',
    seed: 'Paul van Haver, known as Stromae, was born in Brussels to a Rwandan father and Belgian mother.',
    script:
      'Родился в Брюсселе в семье с руандийскими корнями. Отец приехал из Руанды, мать была бельгийкой — так вырос Paul van Haver, которого мир знает как Stromae. «Alors on danse» он собрал из минималистичного бита и колких строк про повседневность.',
  },
  {
    label: 'Stromae — anchor in sentence 2 only',
    artist: 'Stromae',
    title: 'Papaoutai',
    seed: 'Stromae co-directed the Papaoutai music video with Jérôme Guiot.',
    script:
      'Клип начинается с сюрреалистичной улицы без отцов. Stromae снял «Papaoutai» вместе с Jérôme Guiot — в кадре толпа людей с пустыми лицами вместо голов.',
  },
  {
    label: 'Lou Bega — concrete good sample',
    artist: 'Lou Bega',
    title: 'Mambo No. 5',
    seed: 'Lou Bega adapted Perez Prado Mambo No. 5 and added verses listing women names in Munich studio.',
    script:
      'Продюсер взял старый сэмпл «Perez Prado» — «Mambo No. 5» — и Lou Bega дописал куплеты в студии в Мюнхене. На радио сначала крутили только клубную версию, без списка имён.',
  },
  {
    label: 'Chart fact — anchor in sentence 2 (legacy FAIL, relaxed PASS)',
    artist: 'Stromae',
    title: 'Alors on danse',
    seed: 'The song topped French charts in 2010.',
    script:
      'Пластинки того сезона звучали одинаково. В 2010 году «Alors on danse» возглавил французский чарт — редкий прорыв для бельгийского автора.',
  },
  {
    label: 'Generic hook — watery opening, no seed in first 2 sentences',
    artist: 'Lou Bega',
    title: 'Mambo No. 5',
    seed: 'Lou Bega adapted Perez Prado Mambo No. 5 and added verses listing women names in Munich studio.',
    script:
      'Эта песня — настоящая находка для фанатов. Музыка может соединить всех нас — так звучит настоящий хит. Lou Bega взял сэмпл Perez Prado в мюнхенской студии.',
  },
  {
    label: 'Billboard bridge — RU script',
    artist: 'ABBA',
    title: 'Dancing Queen',
    seed: "It was ABBA's only number-one hit on the Billboard Hot 100.",
    script:
      '«Dancing Queen» — единственный хит ABBA, который дошёл до первого места в американском хит-параде. Для шведов это был редкий случай.',
  },
];

let legacyFailRelaxedPass = 0;
let legacyPassRelaxedFail = 0;
let prodWouldReject = 0;
let strictLocalWouldReject = 0;

console.log('=== first-sentence / opening anchor audit ===\n');
console.log(
  'Columns: legacy=sentence1 only | relaxed=openingBlock(2 sent) + bridges | prod=skipFirstSentenceAnchor\n',
);

for (const c of CASES) {
  const facts = [c.seed];
  const legacy = legacyFirstSentenceOnly(c.script, facts);
  const relaxed = openingAnchoredToFact(c.script, facts);
  const full = anchorsReferenceFact(c.script, facts);
  const strictVal = validateStoryScript(c.script, '30s', c.artist, c.title, {
    referenceFacts: facts,
    strictLength: false,
    skipPersonaCliches: true,
  });
  const prodVal = validateStoryScript(c.script, '30s', c.artist, c.title, {
    ...qualityOptionsForProductionAttempt(facts, 'ru'),
  });

  if (!legacy && relaxed) legacyFailRelaxedPass++;
  if (legacy && !relaxed) legacyPassRelaxedFail++;
  if (!prodVal.ok) prodWouldReject++;
  if (!strictVal.ok && strictVal.reason?.includes('first sentence')) strictLocalWouldReject++;

  const opening = openingBlockForAnchor(c.script);
  console.log(`--- ${c.label} ---`);
  console.log(`  opening (${opening.length} chars): ${opening.slice(0, 120)}${opening.length > 120 ? '…' : ''}`);
  console.log(`  full script anchors seed: ${full ? 'YES' : 'NO'}`);
  console.log(`  legacy (1 sent): ${legacy ? 'PASS' : 'FAIL'}`);
  console.log(`  relaxed (opening): ${relaxed ? 'PASS' : 'FAIL'}`);
  console.log(`  strict local validate: ${strictVal.ok ? 'PASS' : `FAIL (${strictVal.reason})`}`);
  console.log(`  prod options validate: ${prodVal.ok ? 'PASS' : `FAIL (${prodVal.reason})`}`);
  console.log('');
}

console.log('=== SUMMARY ===');
console.log(`cases: ${CASES.length}`);
console.log(`legacy FAIL → relaxed PASS (fixed false rejects): ${legacyFailRelaxedPass}`);
console.log(`legacy PASS → relaxed FAIL (new false rejects): ${legacyPassRelaxedFail}`);
console.log(`strict local would reject on opening gate: ${strictLocalWouldReject}`);
console.log(`prod pipeline would reject (opening gate skipped): ${prodWouldReject}`);
console.log('');
console.log(
  'Production OpenRouter loop uses skipFirstSentenceAnchor=true — verify now matches prod options.',
);

process.exit(legacyPassRelaxedFail > 0 ? 1 : 0);
