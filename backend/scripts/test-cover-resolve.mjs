/**
 * Known cover title → original artist resolution + TTS title preservation.
 * Run: npm run build && node scripts/test-cover-resolve.mjs
 */
import assert from 'node:assert/strict';
import { resolveCoverForFacts, normalizeCoverTitleKey } from '../dist/services/cover-resolve.js';
import { lookupCuratedFact } from '../dist/services/curated-facts.js';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';
import { buildYandexSsml } from '../dist/services/tts-yandex-ssml.js';
import { sanitizeClosingTail } from '../dist/services/story-closing-phrases.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok', name);
  } catch (e) {
    console.error('  FAIL', name, e.message);
    process.exitCode = 1;
  }
}

test('La Marcha — Tous les Mêmes resolves to Stromae cover', () => {
  const ctx = resolveCoverForFacts('La Marcha', 'Tous les Mêmes');
  assert.equal(ctx.isCover, true);
  assert.equal(ctx.factArtist, 'Stromae');
  assert.equal(ctx.factTitle, 'Tous les Mêmes');
  assert.match(ctx.coverNoteRu ?? '', /кавер.*Stromae/i);
});

test('Stromae own track is not a cover', () => {
  const ctx = resolveCoverForFacts('Stromae', 'Tous les Mêmes');
  assert.equal(ctx.isCover, false);
  assert.equal(ctx.factArtist, 'Stromae');
});

test('Wonderwall cover band resolves to Oasis', () => {
  const ctx = resolveCoverForFacts('The Hit Crew', 'Wonderwall');
  assert.equal(ctx.isCover, true);
  assert.equal(ctx.factArtist, 'Oasis');
});

test('curated fact hits Stromae after cover resolve', () => {
  const ctx = resolveCoverForFacts('La Marcha', 'Tous les Mêmes');
  const hit = lookupCuratedFact(ctx.factArtist, ctx.factTitle);
  assert.ok(hit);
  assert.match(hit.fact, /Stromae/i);
  assert.match(hit.fact, /Racine Carrée|2013/i);
});

test('normalizeCoverTitleKey strips accents', () => {
  assert.equal(normalizeCoverTitleKey('Tous les Mêmes'), 'tous les memes');
});

test('closing tail keeps Tous les Mêmes in last sentence', () => {
  const script =
    'Marga Bult, выступающая под именем La Marcha, — голландская певица. Среди её работ можно выделить Tous les Mêmes.';
  const out = sanitizeClosingTail(script, 'ru');
  assert.match(out, /Tous les Mêmes/i);
  assert.doesNotMatch(out, />ê\./i);
  assert.doesNotMatch(out, /выделить\s+ê/i);
});

test('Yandex SSML reads full French title Tous les Mêmes', () => {
  const script =
    'Среди её работ можно выделить Tous les Mêmes.';
  const marked = prepareYandexTtsText(script, {
    artist: 'La Marcha',
    title: 'Tous les Mêmes',
    speakTrackNamesInVoiceover: true,
  });
  const ssml = buildYandexSsml(marked);
  assert.match(ssml, /Tous les M[êe]mes/i);
  assert.doesNotMatch(ssml, />ê\./i);
});

console.log(`\n[test-cover-resolve] ${passed} passed`);
