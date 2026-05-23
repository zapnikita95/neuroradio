/**
 * Validates narrator presets: unique roles, format rules, demo scripts per persona.
 * Run: npm run build && node scripts/test-narrators.mjs
 */
import {
  buildPersonaForNarrator,
  resolveStoryNarrator,
} from '../dist/services/prompts.js';
import {
  STORY_NARRATOR_PRESETS,
  listNarratorOptions,
} from '../dist/services/story-narrator.js';
import { buildSystemPrompt, buildStoryUserPrompt } from '../dist/services/prompts.js';
import { buildDemoStory } from '../dist/services/demo.js';
import { getStoryLengthPreset } from '../dist/services/story-length.js';
import { validateStoryScript } from '../dist/services/story-quality.js';

const SAMPLE = {
  artist: 'James Brown',
  title: 'I Got You (I Feel Good)',
  year: 1965,
  genre: 'funk',
};

const NARRATOR_MARKERS = {
  auto: ['фанат', 'Apollo', 'жанр'],
  radio_host: ['слушайте', 'эфир', 'остань'],
  contemporary: ['помню', 'ночь', 'запах', 'колон'],
  expert: ['суть', 'ритм', 'мало кто', 'бас'],
  fan: ['версии', 'оборот', 'live', 'фанат'],
  backstage: ['кулис', 'спор', 'дубль', 'продюс'],
  night_dj: ['спишь', 'полноч', 'ноч', 'исповед'],
};

let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

console.log('=== Narrator options ===');
const options = listNarratorOptions();
if (options.length !== 7) {
  fail(`Expected 7 narrator options, got ${options.length}`);
} else {
  ok(`${options.length} narrator options listed`);
}

console.log('\n=== Preset uniqueness ===');
const roles = new Set();
for (const preset of Object.values(STORY_NARRATOR_PRESETS)) {
  if (roles.has(preset.roleTitle)) {
    fail(`Duplicate roleTitle: ${preset.roleTitle}`);
  }
  roles.add(preset.roleTitle);
  if (!preset.formatRules || preset.formatRules.length < 20) {
    fail(`${preset.id}: formatRules too short`);
  }
  if (!preset.contentFocus || preset.contentFocus.length < 20) {
    fail(`${preset.id}: contentFocus too short`);
  }
}
if (failed === 0) ok('All presets have unique roles and rules');

console.log('\n=== System prompts per narrator ===');
for (const id of ['auto', ...Object.keys(STORY_NARRATOR_PRESETS)]) {
  const narratorId = resolveStoryNarrator(id);
  const persona = buildPersonaForNarrator(
    narratorId,
    SAMPLE.year,
    SAMPLE.genre,
    SAMPLE.artist,
  );
  const system = buildSystemPrompt(persona, getStoryLengthPreset('30s'));

  if (!system.includes(persona.roleTitle.split('.')[0].slice(0, 12))) {
    fail(`${id}: system prompt missing role`);
  }
  if (narratorId !== 'auto') {
    if (!system.includes('ФОКУС СОДЕРЖАНИЯ')) {
      fail(`${id}: missing content focus block`);
    }
    const preset = STORY_NARRATOR_PRESETS[narratorId];
    if (!system.includes(preset.formatRules.slice(0, 20))) {
      fail(`${id}: format rules not injected`);
    }
  }

  const user = buildStoryUserPrompt({
    ...SAMPLE,
    voiceId: 'zahar',
    angle: 'LIVE',
    storyLength: '30s',
    storyNarrator: narratorId,
    previousScripts: [],
  });

  if (!user.includes(SAMPLE.artist) || !user.includes(SAMPLE.title)) {
    fail(`${id}: user prompt missing track info`);
  }
}
if (failed === 0) ok('System/user prompts built for all narrators');

console.log('\n=== Demo scripts per narrator ===');
for (const id of Object.keys(NARRATOR_MARKERS)) {
  const demo = buildDemoStory(
    SAMPLE.artist,
    SAMPLE.title,
    SAMPLE.year,
    SAMPLE.genre,
    [],
    id,
  );
  const script = demo.script.toLowerCase();
  const quality = validateStoryScript(script, '30s', SAMPLE.artist, SAMPLE.title, {
    strictLength: false,
  });

  if (script.trim().length < 40) {
    fail(`${id}: demo script too short`);
  }
  if (!quality.ok && quality.reason?.startsWith('too short') == false) {
    fail(`${id}: demo quality: ${quality.reason}`);
  }

  const markers = NARRATOR_MARKERS[id];
  const hit = markers.some((m) => script.includes(m));
  if (id !== 'auto' && !hit) {
    fail(`${id}: demo script missing persona markers (${markers.join(', ')})`);
  } else {
    ok(`${id}: "${demo.script.slice(0, 60)}…" (${demo.word_count} words)`);
  }
}

console.log('\n=== Summary ===');
if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll narrator checks passed');
