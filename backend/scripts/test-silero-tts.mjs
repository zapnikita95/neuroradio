/**
 * Silero A/B: samples × voice presets, rich transcript .txt next to each .wav
 *
 * Run: START.bat  then  cd backend && npm run build && node scripts/test-silero-tts.mjs
 *
 * Env:
 *   SILERO_TTS_URL=http://127.0.0.1:8001
 *   SILERO_PRESETS=calm_female,lively_male   (default: all 4)
 *   SILERO_SAMPLES=queen,damiano             (default: all)
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fetch from 'node-fetch';
import { prepareSileroTtsTextTrace } from '../dist/services/tts-markup.js';
import { formatSileroTranscriptReport } from '../dist/services/tts-silero-transcript.js';
import { SILERO_VOICE_PRESETS } from '../dist/services/silero-voices.js';

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
const outDir = path.resolve(__dirname, '../data/audio');

const ALL_SAMPLES = [
  {
    id: 'queen',
    artist: 'Queen',
    title: 'Bohemian Rhapsody',
    script:
      'Это тест нейрорадио на русском. Queen выпустили Bohemian Rhapsody — ' +
      'шестиминутную оперу в рок-обёртке, и радио не знало, что с этим делать.',
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
      'Звукорежиссёр поймал свист в колонках, инженер перезаписал дубль — Lou Bega дописал куплет в студии.',
  },
];

const presetFilter = process.env.SILERO_PRESETS?.split(',').map((s) => s.trim()).filter(Boolean);
const sampleFilter = process.env.SILERO_SAMPLES?.split(',').map((s) => s.trim()).filter(Boolean);

const presets = presetFilter?.length
  ? SILERO_VOICE_PRESETS.filter((p) => presetFilter.includes(p.id))
  : SILERO_VOICE_PRESETS;

const samples = sampleFilter?.length
  ? ALL_SAMPLES.filter((s) => sampleFilter.includes(s.id))
  : ALL_SAMPLES;

console.log(`[silero-test] URL=${baseUrl}`);
console.log(`[silero-test] presets=${presets.map((p) => p.id).join(', ')}`);
console.log(`[silero-test] samples=${samples.map((s) => s.id).join(', ')}\n`);

const health = await fetch(`${baseUrl}/voices`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
if (!health?.ok) {
  console.error('Silero not reachable. Run START.bat first.');
  process.exit(1);
}
console.log('Voices:', (await health.text()).trim().replace(/\n/g, ', '), '\n');

await mkdir(outDir, { recursive: true });

async function synthesizeSilero(preparedText, voice) {
  const started = Date.now();
  const url =
    `${baseUrl}/process?VOICE=${encodeURIComponent(voice)}` +
    `&INPUT_TEXT=${encodeURIComponent(preparedText.slice(0, 4096))}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new Error(`Silero HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return { buf: Buffer.from(await res.arrayBuffer()), ms: Date.now() - started };
}

const indexLines = [
  '# Silero test index — wav + .txt pairs',
  `# generated ${new Date().toISOString()}`,
  '',
];

for (const sample of samples) {
  const trace = prepareSileroTtsTextTrace(sample.script, {
    artist: sample.artist,
    title: sample.title,
  });

  console.log(`=== ${sample.id} (payload ${trace.prepared.length} chars) ===`);

  for (const preset of presets) {
    const baseName = `test-silero-${sample.id}-${preset.id}`;
    const { buf, ms } = await synthesizeSilero(trace.prepared, preset.voice);
    const wavPath = path.join(outDir, `${baseName}.wav`);
    const txtPath = path.join(outDir, `${baseName}.txt`);

    await writeFile(wavPath, buf);
    await writeFile(
      txtPath,
      formatSileroTranscriptReport({
        trace,
        preset,
        voice: preset.voice,
        sampleId: sample.id,
        synthMs: ms,
        audioBytes: buf.length,
        audioFileName: `${baseName}.wav`,
      }),
      'utf8',
    );

    console.log(`  ${preset.id} (${preset.voice}): ${ms} ms`);
    console.log(`    ${wavPath}`);
    console.log(`    ${txtPath}`);

    indexLines.push(`${baseName}.wav  ←→  ${baseName}.txt  [${preset.labelRu}]`);
  }
  console.log('');
}

const indexPath = path.join(outDir, 'test-silero-INDEX.txt');
await writeFile(indexPath, `${indexLines.join('\n')}\n`, 'utf8');

console.log('=== Готово ===');
console.log(`Индекс: ${indexPath}`);
console.log('Слушай .wav, для багрепорта копируй целиком парный .txt (разделы 2–4).');
console.log('Пресеты: calm_female/male ≈ Yandex neutral, lively_* ≈ emotion=good');
