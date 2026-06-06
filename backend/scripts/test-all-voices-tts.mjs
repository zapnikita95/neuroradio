#!/usr/bin/env node
/**
 * All Yandex UI voices — SSML shape + optional live synth (mixed RU/EN).
 * npm run build && node scripts/test-all-voices-tts.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL_VOICES,
  coerceVoiceForSpeechKit,
  voiceSupportsEmotion,
} from '../dist/services/voices.js';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';
import { buildYandexSsml, hasLatinForSsml } from '../dist/services/tts-yandex-ssml.js';
import { synthesizeSpeech } from '../dist/services/yandex-tts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repoRoot = resolve(root, '..');

function loadEnv(p) {
  if (!existsSync(p)) return;
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
loadEnv(resolve(repoRoot, '.env'));
loadEnv(resolve(root, '.env'));

const SCRIPT =
  'Black Eyed Peas — американская группа. В составе will.i.am и Taboo. Хит — Let\'s Get It Started.';
const ARTIST = 'Black Eyed Peas';
const TITLE = "Let's Get It Started";

const marked = prepareYandexTtsText(SCRIPT, { artist: ARTIST, title: TITLE });
if (!hasLatinForSsml(marked)) {
  console.error('FAIL: sample must use SSML (Latin present)');
  process.exit(1);
}

let failed = 0;
const live = Boolean(process.env.YANDEX_API_KEY?.trim() && process.env.YANDEX_FOLDER_ID?.trim());

console.log(`=== SSML checks (${ALL_VOICES.length} UI voices) ===\n`);

for (const voiceId of ALL_VOICES) {
  const apiVoice = coerceVoiceForSpeechKit(voiceId);
  const ssml = buildYandexSsml(marked, apiVoice);
  const mapNote = apiVoice !== voiceId ? ` → API voice ${apiVoice}` : '';

  if (ssml.includes('<voice')) {
    console.error(`FAIL ${voiceId}${mapNote}: SSML must not contain <voice>`);
    failed++;
    continue;
  }
  if (!ssml.includes('<speak') || !ssml.includes('xml:lang="en-US"')) {
    console.error(`FAIL ${voiceId}${mapNote}: missing speak or en-US lang`);
    failed++;
    continue;
  }
  if (!ssml.includes("Let&apos;s Get It Started")) {
    console.error(`FAIL ${voiceId}${mapNote}: track title missing in SSML`);
    failed++;
    continue;
  }
  console.log(`OK ${voiceId}${mapNote} emotion=${voiceSupportsEmotion(apiVoice)}`);
}

if (live) {
  console.log('\n=== Live Yandex synth (SSML, one phrase each) ===\n');
  for (const voiceId of ALL_VOICES) {
    const apiVoice = coerceVoiceForSpeechKit(voiceId);
    const fileName = `voice-test-${voiceId}.ogg`;
    try {
      const result = await synthesizeSpeech(
        SCRIPT,
        voiceId,
        fileName,
        { artist: ARTIST, title: TITLE, speed: 1.06, emotion: 'good' },
      );
      console.log(`OK live ${voiceId} → ${apiVoice} bytes=${result.filePath}`);
    } catch (err) {
      console.error(`FAIL live ${voiceId} → ${apiVoice}: ${err instanceof Error ? err.message.slice(0, 200) : err}`);
      failed++;
    }
  }
} else {
  console.log('\nSkip live synth: set YANDEX_API_KEY + YANDEX_FOLDER_ID in .env\n');
}

if (failed > 0) {
  console.error(`\n${failed} voice(s) failed`);
  process.exit(1);
}
console.log('\nAll voice checks passed');
