#!/usr/bin/env node
/**
 * EN indie track — all narrators + ElevenLabs voices.
 * node scripts/test-elevenlabs-narrators.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repoRoot = resolve(root, '..');
const outDir = resolve(root, 'audio', 'elevenlabs-test');

for (const p of [resolve(repoRoot, '.env'), resolve(root, '.env')]) {
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (v && !process.env[k]) process.env[k] = v;
  }
}

process.env.ELEVENLABS_ENABLED = 'true';

const INDIE = {
  artist: 'Girlpool',
  title: 'Nothing\'s Wrong',
  year: 2015,
  genre: 'indie rock',
  countryCode: 'US',
};

const NARRATORS = [
  'auto',
  'radio_host',
  'contemporary',
  'expert',
  'fan',
  'backstage',
  'night_dj',
];

const {
  fetchAggregatedFactContext,
} = await import('../dist/services/fact-aggregator.js');
const { pickReferenceFact } = await import('../dist/services/fact-picker.js');
const { generateStoryScript: generateOpenRouter } = await import('../dist/services/openrouter.js');
const { generateStoryScript: generateGroq } = await import('../dist/services/groq.js');
const { STORY_NARRATOR_PRESETS } = await import('../dist/services/story-narrator.js');
const {
  ELEVENLABS_VOICE_PRESETS,
  resolveElevenLabsVoiceId,
} = await import('../dist/services/elevenlabs-voices.js');
const { synthesizeSpeechElevenLabs, hasElevenLabsCredentials } = await import(
  '../dist/services/elevenlabs-tts.js'
);

if (!hasElevenLabsCredentials()) {
  console.error('ELEVENLABS_API_KEY missing — add to backend/.env');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const orModel =
  process.env.OPENROUTER_STORY_MODEL?.trim() ||
  'deepseek/deepseek-chat-v3-0324';

async function generateStory(input) {
  if (process.env.OPEN_ROUTER_API_KEY?.trim()) {
    return generateOpenRouter({
      ...input,
      openRouterModel: orModel,
      openRouterModels: [orModel],
    });
  }
  if (process.env.GROQ_API_KEY?.trim()) {
    return generateGroq(input);
  }
  throw new Error('Need OPEN_ROUTER_API_KEY or GROQ_API_KEY');
}

console.log(`=== Indie EN test: ${INDIE.artist} — ${INDIE.title} ===\n`);

const factCtx = await fetchAggregatedFactContext(
  INDIE.artist,
  INDIE.title,
  INDIE.countryCode,
  undefined,
  undefined,
  { storyLanguage: 'en' },
);

const selected = pickReferenceFact(factCtx.bundle, [], 0, INDIE.artist, INDIE.title);
const seed =
  selected?.fact ??
  factCtx.bundle.trackFacts[0] ??
  factCtx.bundle.artistFacts[0] ??
  factCtx.rawSnippets[0];
if (!seed) {
  console.error('No facts found for indie track');
  process.exit(1);
}
console.log(`Seed (${selected?.scope ?? 'bundle'}): ${seed.slice(0, 200)}…\n`);

const report = [];

for (const narratorId of NARRATORS) {
  const label = STORY_NARRATOR_PRESETS[narratorId]?.labelRu ?? narratorId;
  console.log(`--- Narrator: ${narratorId} (${label}) ---`);
  let story;
  try {
    story = await generateStory({
      ...INDIE,
      voiceId: 'auto',
      storyLength: '60s',
      storyNarrator: narratorId,
      storyLanguage: 'en',
      referenceFacts: [seed],
      selectedReferenceFact: {
        fact: seed,
        scope: selected?.scope ?? 'artist',
        scopeLabelRu: 'artist',
      },
      artistTier: 'indie',
    });
  } catch (e) {
    console.error(`  STORY FAIL: ${e.message}`);
    report.push({ narratorId, error: e.message });
    continue;
  }

  console.log(`  words=${story.word_count} chars=${story.script.length}`);
  console.log(`  SCRIPT: ${story.script.slice(0, 280)}…`);

  const autoVoiceId = resolveElevenLabsVoiceId('auto', { storyNarrator: narratorId, genre: INDIE.genre });
  const safeNarrator = narratorId.replace(/[^a-z_]/gi, '');
  const fileName = `${safeNarrator}_auto.ogg`;
  try {
    const audio = await synthesizeSpeechElevenLabs(story.script, fileName, { voiceId: autoVoiceId });
    console.log(`  TTS ok: ${audio.filePath} voice=${autoVoiceId}`);
    report.push({
      narratorId,
      label,
      words: story.word_count,
      chars: story.script.length,
      script: story.script,
      voiceId: autoVoiceId,
      audio: audio.filePath,
    });
  } catch (e) {
    console.error(`  TTS FAIL: ${e.message}`);
    report.push({ narratorId, script: story.script, ttsError: e.message });
  }
  console.log('');
}

console.log('=== Voice sweep (radio_host story) ===\n');
const hostStory = report.find((r) => r.narratorId === 'radio_host' && r.script);
if (hostStory?.script) {
  for (const preset of Object.values(ELEVENLABS_VOICE_PRESETS)) {
    const fileName = `radio_host_${preset.id}.ogg`;
    try {
      const audio = await synthesizeSpeechElevenLabs(hostStory.script, fileName, {
        voiceId: preset.voiceId,
      });
      console.log(`  ${preset.id} (${preset.labelEn}): ok → ${audio.filePath}`);
    } catch (e) {
      console.error(`  ${preset.id}: FAIL ${e.message}`);
    }
  }
}

writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\nReport: ${join(outDir, 'report.json')}`);
console.log(`Audio: ${outDir}`);
