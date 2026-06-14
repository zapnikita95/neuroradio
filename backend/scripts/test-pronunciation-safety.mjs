/**
 * Pronunciation / TTS substring safety — EN ElevenLabs + RU foreign pass.
 * Run: npm run build && node scripts/test-pronunciation-safety.mjs
 */
import assert from 'node:assert/strict';
import { applyEnglishArtistPronunciation } from '../dist/services/artist-pronunciation.js';
import { buildElevenLabsSpeechPlan } from '../dist/services/elevenlabs-text.js';
import { applyForeignPronunciationWithReplacements } from '../dist/services/tts-foreign-pronounce.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok: ${name}`);
}

console.log('[test-pronunciation-safety]');

const EN_SAFE_SENTENCES = [
  'Never Gonna Give You Up was a revolution.',
  'That voice made you believe every word.',
  'They never expected such executive decisions.',
  'The evening event evolved into something special.',
  'Revolution and revelation changed the scene.',
  'She wishes he would achieve more.',
  'Pink Floyd influenced progressive rock deeply.',
  'The pink sunset looked incredible.',
  'Korn and corn fields in autumn.',
  'Death grips your soul in winter.',
  'Grimes and crimes are different words.',
  'Motown sound had its defining moment.',
  'Executive decisions evolved overnight.',
  'System overload flexion emotion motivation.',
  'Asia and Russia toured together.',
  'The evening event prevents evil.',
  'Rick Astley and Pink are different artists.',
  'Yeat and wheat are not the same.',
  'David and D4vd spellings differ.',
  'BBNO money scheme sounds catchy.',
];

test('EN: 20 narrative sentences stay intact without artist context', () => {
  for (const sentence of EN_SAFE_SENTENCES) {
    const out = applyEnglishArtistPronunciation(sentence, '', '');
    assert.equal(out, sentence, `mangled: "${sentence}" -> "${out}"`);
    const plan = buildElevenLabsSpeechPlan(sentence, 'Rick Astley', 'Never Gonna Give You Up', false);
    assert.equal(plan.ttsTranscript, sentence, `plan mangled: "${sentence}"`);
  }
});

test('EN: substring traps Never / believe / wishes (ev, she)', () => {
  assert.doesNotMatch(
    applyEnglishArtistPronunciation('Never believe wishes', '', ''),
    /NE Ver|E V|sh\+i/i,
  );
});

test('EN: stylized abbreviations still respell (BTS, MGK, 2pac)', () => {
  assert.match(
    applyEnglishArtistPronunciation('BTS and MGK dominated charts.', '', ''),
    /B T S/,
  );
  assert.match(
    applyEnglishArtistPronunciation('2pac changed hip hop.', '', ''),
    /two pack changed/i,
  );
  assert.equal(
    applyEnglishArtistPronunciation('Tupac legacy lives on.', '', ''),
    'Tupac legacy lives on.',
  );
  assert.match(
    applyEnglishArtistPronunciation('Tupac legacy lives on.', '2Pac', 'Changes'),
    /two pack legacy/i,
  );
});

test('EN: artist metadata still respells Pink (P!nk) and Death Grips', () => {
  assert.match(
    applyEnglishArtistPronunciation('Pink dropped a new single.', 'P!nk', 'So What'),
    /^pink dropped/i,
  );
  assert.match(
    applyEnglishArtistPronunciation('Death Grips pushed boundaries.', 'Death Grips', 'Guillotine'),
    /death grips pushed/i,
  );
});

test('EN: Sia respells only when artist is Sia (global abbrev) or via metadata', () => {
  const generic = applyEnglishArtistPronunciation('Sia wrote this hook.', '', '');
  assert.match(generic, /see ah wrote/);
  const meta = applyEnglishArtistPronunciation('Sia wrote this hook.', 'Sia', 'Chandelier');
  assert.match(meta, /see ah wrote/);
});

test('RU: «she» does not match inside «wishes» or English pronoun falsely', () => {
  const { replacements } = applyForeignPronunciationWithReplacements(
    "The label's wishes shaped the revolution.",
    'Michael Jackson',
    'Billie Jean',
  );
  assert.ok(!replacements.some((r) => r.from === 'she'), JSON.stringify(replacements));
});

test('RU: «ev» does not match inside «Never» / «believe»', () => {
  const { replacements } = applyForeignPronunciationWithReplacements(
    'Never believe the evening event.',
    'Rick Astley',
    'Never Gonna Give You Up',
  );
  assert.ok(!replacements.some((r) => r.from === 'ev'), JSON.stringify(replacements));
});

test('EN ElevenLabs plan: Rick Astley script unchanged', () => {
  const script =
    "Never Gonna Give You Up wasn't just a hit — it conquered charts. That voice made you believe every word.";
  const plan = buildElevenLabsSpeechPlan(script, 'Rick Astley', 'Never Gonna Give You Up', false);
  assert.match(plan.ttsTranscript, /Never Gonna Give You Up/i);
  assert.match(plan.ttsTranscript, /believe/i);
  assert.doesNotMatch(plan.ttsTranscript, /NE Ver|E V/i);
});

console.log(`\n[test-pronunciation-safety] ${passed} passed`);
