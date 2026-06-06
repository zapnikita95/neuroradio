/**
 * Test local Silero with the same TTS text pipeline as Yandex (stress, translit, quotes).
 *
 * Run: START.bat (or start-silero-tts.bat) then:
 *   cd backend && npm run build && node scripts/test-silero-tts.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fetch from 'node-fetch';
import { prepareSileroTtsText, prepareYandexTtsText } from '../dist/services/tts-markup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (v && !process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(path.join(repoRoot, '.env'));
loadEnvFile(path.join(repoRoot, 'backend', '.env'));

const baseUrl = (process.env.SILERO_TTS_URL ?? 'http://127.0.0.1:8001').replace(/\/$/, '');
const voice = process.env.SILERO_TTS_VOICE ?? 'baya';
const api = process.env.SILERO_TTS_API ?? 'legacy';
const outDir = path.resolve(__dirname, '../data/audio');

const SAMPLES = [
  {
    id: 'queen',
    artist: 'Queen',
    title: 'Bohemian Rhapsody',
    script:
      'Это тест нейрорадио на русском. Queen выпустили Bohemian Rhapsody — ' +
      'шестиминутную оперу в р+ок-обёртке, и радио не знало, что с этим делать.',
  },
  {
    id: 'damiano',
    artist: 'Damiano David',
    title: 'Next Summer',
    script:
      'Damiano David — итальянский певец, фронтмен рок-группы Måneskin. ' +
      'В 2021 году коллектив победил на Евровидении с песней «Zitti e buoni».',
  },
  {
    id: 'ella',
    artist: 'Ella Boh',
    title: 'babydoll',
    script:
      'Ella Boh записала «babydoll» в своей маленькой комнате, а её друг выложил клип без продюсерского плана. ' +
      'Алгоритм подхватил мелодию, и bedroom‑запись превратилась в глобальный трек.',
  },
  {
    id: 'lou-bega',
    artist: 'Lou Bega',
    title: 'Mambo No. 5',
    script:
      'Звукорежиссёр поймал св+ист в кол+онках, инжен+ер перезаписал д+убль — Lou Bega дописал куплет в ст+удии.',
  },
];

console.log(`[silero-test] URL=${baseUrl} voice=${voice} api=${api}\n`);

const healthLegacy = await fetch(`${baseUrl}/voices`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
if (!healthLegacy?.ok) {
  console.error('Silero not reachable. Run START.bat or start-silero-tts.bat first.');
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

async function synthesizeSilero(preparedText) {
  const started = Date.now();
  const url =
    `${baseUrl}/process?VOICE=${encodeURIComponent(voice)}` +
    `&INPUT_TEXT=${encodeURIComponent(preparedText.slice(0, 4096))}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new Error(`Silero HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, ms: Date.now() - started };
}

async function synthesizeYandex(script, artist, title) {
  const apiKey = process.env.YANDEX_API_KEY?.trim();
  const folderId = process.env.YANDEX_FOLDER_ID?.trim();
  if (!apiKey || !folderId) return null;

  const marked = prepareYandexTtsText(script, {
    artist,
    title,
    sentencePauses: true,
    pauseProfile: 'natural',
  });
  const params = new URLSearchParams({
    text: marked,
    lang: 'ru-RU',
    voice: 'zahar',
    format: 'oggopus',
    folderId,
    speed: '0.92',
    emotion: 'good',
  });

  const started = Date.now();
  const res = await fetch(`https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize?${params}`, {
    method: 'POST',
    headers: { Authorization: `Api-Key ${apiKey}` },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    console.warn(`  Yandex skip: HTTP ${res.status}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, ms: Date.now() - started };
}

async function writePair(baseName, preparedText, audioBuf, metaLines) {
  const wavPath = path.join(outDir, `${baseName}.wav`);
  const txtPath = path.join(outDir, `${baseName}.txt`);
  await writeFile(wavPath, audioBuf);
  await writeFile(
    txtPath,
    [
      '# Транскрипт для Silero (скопируй и покажи, что не так)',
      ...metaLines,
      '',
      preparedText,
      '',
    ].join('\n'),
    'utf8',
  );
  return { wavPath, txtPath };
}

const yandexTimes = [];
const sileroTimes = [];

for (const sample of SAMPLES) {
  const prepared = prepareSileroTtsText(sample.script, {
    artist: sample.artist,
    title: sample.title,
  });

  console.log(`--- ${sample.id} (${prepared.length} chars) ---`);
  console.log(prepared);
  console.log('');

  const { buf, ms: sileroMs } = await synthesizeSilero(prepared);
  sileroTimes.push(sileroMs);

  const { wavPath, txtPath } = await writePair(`test-silero-${sample.id}`, prepared, buf, [
    `# sample=${sample.id} artist=${sample.artist} title=${sample.title}`,
    `# silero_ms=${sileroMs} bytes=${buf.length}`,
  ]);

  console.log(`  Silero: ${sileroMs} ms → ${wavPath}`);
  console.log(`  Текст:  ${txtPath}`);

  const yandex = await synthesizeYandex(sample.script, sample.artist, sample.title);
  if (yandex) {
    yandexTimes.push(yandex.ms);
    const yandexPath = path.join(outDir, `test-yandex-${sample.id}.ogg`);
    await writeFile(yandexPath, yandex.buf);
    console.log(`  Yandex: ${yandex.ms} ms → ${yandexPath}`);
  }
  console.log('');
}

const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);

console.log('=== Итог ===');
console.log(`Silero среднее: ${avg(sileroTimes)} ms (${sileroTimes.length} сэмплов)`);
if (yandexTimes.length) {
  console.log(`Yandex среднее: ${avg(yandexTimes)} ms (${yandexTimes.length} сэмплов)`);
  const ratio = avg(sileroTimes) / avg(yandexTimes);
  if (ratio < 0.9) console.log('Silero быстрее Yandex SpeechKit (локальный CPU vs облако).');
  else if (ratio > 1.1) console.log('Silero медленнее Yandex SpeechKit.');
  else console.log('Silero и Yandex примерно одинаково по времени на этих фразах.');
} else {
  console.log('Yandex: не замеряли (нет YANDEX_API_KEY + YANDEX_FOLDER_ID в .env).');
}
console.log(`\nФайлы: ${outDir}`);
console.log('Слушай .wav и копируй текст из парного .txt');
