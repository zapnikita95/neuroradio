/**
 * Validates narrator presets: unique roles, format rules, prompt wiring.
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
import { getStoryLengthPreset } from '../dist/services/story-length.js';

const SAMPLE = {
  artist: 'James Brown',
  title: 'I Got You (I Feel Good)',
  year: 1965,
  genre: 'funk',
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
    if (!system.includes('ФОКУС:')) {
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
  if (!user.includes('Страна/сцена:')) {
    fail(`${id}: user prompt missing locale block`);
  }
}
if (failed === 0) ok('System/user prompts built for all narrators');

console.log('\n=== Summary ===');
if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll narrator checks passed');
