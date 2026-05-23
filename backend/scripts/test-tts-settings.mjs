/**
 * Validates Yandex TTS settings: voices, emotions, speed, API params.
 * Run: npm run build && node scripts/test-tts-settings.mjs
 */
import {
  ALL_VOICES,
  listVoiceOptions,
  resolveTtsVoice,
  resolveVoiceForStory,
  voiceSupportsEvilEmotion,
} from '../dist/services/voices.js';
import {
  DEFAULT_TTS_EMOTION,
  DEFAULT_TTS_SPEED,
  listEmotionOptions,
  listSpeedPresets,
  resolveTtsEmotion,
  resolveTtsSpeed,
  TTS_SPEED_MAX,
  TTS_SPEED_MIN,
} from '../dist/services/tts-options.js';

let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

console.log('=== Voice catalog ===');
const voices = listVoiceOptions();
if (voices.length !== ALL_VOICES.length + 1) {
  fail(`Expected ${ALL_VOICES.length + 1} voice options, got ${voices.length}`);
} else {
  ok(`${voices.length} voice options (auto + ${ALL_VOICES.length} Yandex voices)`);
}

for (const id of ALL_VOICES) {
  if (resolveTtsVoice(id) !== id) fail(`resolveTtsVoice(${id}) broken`);
}
if (resolveTtsVoice('unknown') !== 'auto') fail('unknown voice should fallback to auto');
ok('Voice resolution works');

console.log('\n=== Auto voice by era ===');
const autoSixties = resolveVoiceForStory('auto', 1965, 'funk');
const manualJane = resolveVoiceForStory('jane', 1965, 'funk');
if (autoSixties !== 'zahar') fail(`Expected zahar for funk, got ${autoSixties}`);
if (manualJane !== 'jane') fail(`Manual voice override failed: ${manualJane}`);
ok(`Auto=${autoSixties}, manual=jane`);

console.log('\n=== Emotions (SpeechKit: neutral | good | evil) ===');
for (const preset of listEmotionOptions()) {
  if (resolveTtsEmotion(preset.id) !== preset.id) {
    fail(`resolveTtsEmotion(${preset.id}) failed`);
  }
}
if (resolveTtsEmotion('unknown') !== DEFAULT_TTS_EMOTION) {
  fail('unknown emotion fallback broken');
}
ok(`${listEmotionOptions().length} emotions: ${listEmotionOptions().map((e) => e.id).join(', ')}`);

console.log('\n=== Evil emotion voice compatibility ===');
const evilVoices = ALL_VOICES.filter((v) => voiceSupportsEvilEmotion(v));
if (evilVoices.length < 4) fail(`Too few evil-capable voices: ${evilVoices.length}`);
ok(`Evil supported by: ${evilVoices.join(', ')}`);

console.log('\n=== Speed (SpeechKit: 0.1–3.0) ===');
for (const preset of listSpeedPresets()) {
  const resolved = resolveTtsSpeed(preset.speed);
  if (resolved !== preset.speed) fail(`Speed preset ${preset.id}: ${resolved} != ${preset.speed}`);
}
if (resolveTtsSpeed(0.01) !== TTS_SPEED_MIN) fail('speed min clamp broken');
if (resolveTtsSpeed(9) !== TTS_SPEED_MAX) fail('speed max clamp broken');
if (resolveTtsSpeed('bad') !== DEFAULT_TTS_SPEED) fail('speed default broken');
ok(`${listSpeedPresets().length} speed presets within ${TTS_SPEED_MIN}–${TTS_SPEED_MAX}`);

console.log('\n=== TTS request params shape ===');
const sampleParams = new URLSearchParams({
  text: 'Тест',
  lang: 'ru-RU',
  voice: 'alena',
  format: 'oggopus',
  folderId: 'test-folder',
  speed: String(resolveTtsSpeed(0.92)),
  emotion: resolveTtsEmotion('good'),
});
for (const key of ['text', 'lang', 'voice', 'format', 'folderId', 'speed', 'emotion']) {
  if (!sampleParams.has(key)) fail(`Missing param: ${key}`);
}
ok('Request params match SpeechKit shape');

console.log('\n=== Summary ===');
if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll TTS settings checks passed');
