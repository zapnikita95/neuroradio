/**
 * Run: npm run build && node scripts/test-tts-samples.mjs
 *
 * Checks TTS markup on sample scripts. If YANDEX_API_KEY + YANDEX_FOLDER_ID are set,
 * also synthesizes OGG files into backend/audio/tts-test-*.ogg for listening.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fetch from 'node-fetch';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const audioDir = path.resolve(__dirname, '../audio');

const SAMPLES = [
  {
    name: 'mixed-en',
    artist: 'Doris Day',
    title: 'Perhaps, Perhaps, Perhaps',
    script:
      'Продюсер записал «Perhaps, Perhaps, Perhaps» для Doris Day в студии — еще один дубль ушел в эфир с первого раза.',
  },
  {
    name: 'studio-ru',
    artist: 'Lou Bega',
    title: 'Mambo No. 5',
    script:
      'Звукорежиссёр поймал свист в колонках, инженер перезаписал дубль — Lou Bega дописал куплет в студии.',
  },
];

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}
function ok(msg) {
  console.log(`OK: ${msg}`);
}

console.log('=== TTS markup samples ===\n');
for (const sample of SAMPLES) {
  const marked = prepareYandexTtsText(sample.script, {
    artist: sample.artist,
    title: sample.title,
    sentencePauses: false,
  });
  console.log(`--- ${sample.name} ---`);
  console.log(marked);
  console.log('');

  if (marked.includes('[[')) fail(`${sample.name}: unexpected phoneme blocks`);
  else ok(`${sample.name}: no phoneme blocks`);

  if (!marked.includes('ё') && !marked.includes('Ё') && sample.script.includes('еще')) {
    fail(`${sample.name}: expected ё normalization`);
  } else if (sample.script.includes('еще')) {
    ok(`${sample.name}: ё normalized`);
  }
}

async function maybeSynthesize(name, marked) {
  const apiKey = process.env.YANDEX_API_KEY?.trim();
  const folderId = process.env.YANDEX_FOLDER_ID?.trim();
  if (!apiKey || !folderId) return;

  const params = new URLSearchParams({
    text: marked,
    lang: 'ru-RU',
    voice: 'zahar',
    format: 'oggopus',
    folderId,
    speed: '0.92',
    emotion: 'good',
  });

  const response = await fetch(`https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize?${params}`, {
    method: 'POST',
    headers: { Authorization: `Api-Key ${apiKey}` },
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    fail(`${name}: Yandex synth HTTP ${response.status}: ${(await response.text()).slice(0, 120)}`);
    return;
  }

  await mkdir(audioDir, { recursive: true });
  const filePath = path.join(audioDir, `tts-test-${name}.ogg`);
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  ok(`${name}: saved ${filePath}`);
}

if (process.env.YANDEX_API_KEY && process.env.YANDEX_FOLDER_ID) {
  console.log('=== Yandex synthesis (listen in backend/audio/) ===\n');
  for (const sample of SAMPLES) {
    const marked = prepareYandexTtsText(sample.script, {
      artist: sample.artist,
      title: sample.title,
      sentencePauses: false,
    });
    await maybeSynthesize(sample.name, marked);
  }
} else {
  console.log('Skip synthesis: set YANDEX_API_KEY + YANDEX_FOLDER_ID to generate OGG samples.\n');
}

process.exit(failed > 0 ? 1 : 0);
