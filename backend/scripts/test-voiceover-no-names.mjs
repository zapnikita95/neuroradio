/**
 * Prompt-first voiceover without artist/track names (quality gate, not strip-and-substitute).
 * Run: npm run build && node scripts/test-voiceover-no-names.mjs
 */
import { buildSystemPrompt, buildStoryUserPrompt } from '../dist/services/prompts.js';
import { buildPersonaForNarrator } from '../dist/services/story-narrator.js';
import { getStoryLengthPreset } from '../dist/services/story-length.js';
import { validateStoryScript } from '../dist/services/story-quality.js';
import {
  buildVoiceoverNoNamesPromptBlock,
  scriptLeaksVoiceoverNames,
} from '../dist/services/voiceover-no-names.js';
import { resolveArtistGrammarRu } from '../dist/services/artist-grammar.js';
import { sanitizeScriptForTts } from '../dist/services/story-quality.js';

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}
function ok(msg) {
  console.log(`OK: ${msg}`);
}

const ARTIST = 'Foster The People';
const TITLE = 'Sit Next to Me';
const FACTS = [
  'Марк Фостер переехал к дяде в Лос-Анджелес и там начал писать песни.',
  'Группа записала альбом Supermodel в студии в Лос-Анджелесе.',
];

const noNamesOpts = { speakTrackNamesInVoiceover: false };

// --- Prompt injection ---
const block = buildVoiceoverNoNamesPromptBlock(ARTIST, TITLE);
if (!block.includes(ARTIST) || !block.includes(TITLE)) {
  fail('no-names block must quote forbidden artist/title');
} else {
  ok('no-names block quotes forbidden names');
}
if (!/эта группа|этот коллектив/i.test(block)) {
  fail('Foster The People prompt must suggest group phrasing');
} else {
  ok('Foster The People → group phrasing in prompt');
}

const persona = buildPersonaForNarrator('expert', 2017, 'indie pop', ARTIST, TITLE, 'US');
const length = getStoryLengthPreset('30s');
const system = buildSystemPrompt(persona, length, 'ru', {
  speakTrackNamesInVoiceover: false,
  artist: ARTIST,
  title: TITLE,
});
if (!system.includes('ОЗВУЧКА БЕЗ ИМЁН')) {
  fail('system prompt missing no-names block');
} else {
  ok('system prompt includes no-names block');
}

const user = buildStoryUserPrompt({
  artist: ARTIST,
  title: TITLE,
  year: 2017,
  genre: 'indie pop',
  voiceId: 'zahar',
  storyLength: '30s',
  storyNarrator: 'expert',
  referenceFacts: FACTS,
  speakTrackNamesInVoiceover: false,
});
if (!user.includes('Контекст (НЕ вставляй в script)')) {
  fail('user prompt must mark metadata as context-only');
} else {
  ok('user prompt marks metadata as context-only');
}

// --- Grammar ---
const grammar = resolveArtistGrammarRu(ARTIST);
if (grammar.kind !== 'group') {
  fail(`Foster The People should be group, got ${grammar.kind}`);
} else {
  ok('Foster The People resolved as group');
}

// --- Leak detector ---
const leaky =
  'Foster The People — это история о поддержке семьи. Sit Next to Me вышел из этой истории.';
const leak = scriptLeaksVoiceoverNames(leaky, ARTIST, TITLE);
if (!leak) {
  fail('scriptLeaksVoiceoverNames must catch artist+title');
} else {
  ok(`leak detector: ${leak}`);
}

const bareLead = 'Музыкант — это история о студии в Лос-Анджелесе.';
if (!scriptLeaksVoiceoverNames(bareLead, ARTIST, TITLE)) {
  fail('must reject bare musician lead');
} else {
  ok('bare musician lead rejected');
}

// --- Quality gate: reject scripts with names ---
const badWithNames =
  'Foster The People записали Sit Next to Me после переезда Марка Фостера в Лос-Анджелес.';
const badVal = validateStoryScript(badWithNames, '30s', ARTIST, TITLE, {
  referenceFacts: FACTS,
  speakTrackNamesInVoiceover: false,
  strictLength: false,
});
if (badVal.ok) {
  fail('validateStoryScript must reject script that names artist/track');
} else {
  ok(`named script rejected (${badVal.reason})`);
}

// --- Quality gate: accept natural Russian without names ---
const goodNoNames =
  'Эта группа — история о том, как поддержка семьи может изменить всё. ' +
  'Марк Фостер переехал к дяде в Лос-Анджелес и там начал писать песни. ' +
  'У этой песни лёгкий, воздушный звук — один из треков, который вышел из этой истории.';
const goodVal = validateStoryScript(goodNoNames, '30s', ARTIST, TITLE, {
  referenceFacts: FACTS,
  speakTrackNamesInVoiceover: false,
  strictLength: false,
  skipPersonaCliches: true,
});
if (!goodVal.ok) {
  fail(`good no-names script rejected: ${goodVal.reason}`);
} else {
  ok('natural no-names script accepted');
}

// --- sanitize must keep latin title when names ON (regression: PHRASE_SLOT + foreign pronounce) ---
const mjScript =
  'Dirty Diana — один из тех треков, где Dirty Diana решил сыграть. Bad album.';
const mjSanitized = sanitizeScriptForTts(
  mjScript,
  'Michael Jackson',
  'Dirty Diana',
  [],
  { speakTrackNamesInVoiceover: true },
);
if (/[\uE012\uE013]/.test(mjSanitized)) {
  fail(`sanitize left phrase-slot garbage when names ON: ${mjSanitized}`);
} else if (!/Dirty Diana/i.test(mjSanitized)) {
  fail(`sanitize must preserve Dirty Diana when names ON: ${mjSanitized}`);
} else {
  ok('Dirty Diana preserved in sanitize when speak_track_names ON');
}

// --- Latin block when names off: scriptLeaksVoiceoverNames, not english-leak gate ---
if (!scriptLeaksVoiceoverNames('Foster The People rocked the stage', ARTIST, TITLE)) {
  fail('scriptLeaksVoiceoverNames must catch Foster when names off');
} else {
  ok('artist name caught by voiceover leak detector when names off');
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nAll voiceover-no-names tests passed');
