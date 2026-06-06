/**
 * Test local Silero Russian TTS.
 * Run: start-silero-tts.bat  then  node scripts/test-silero-tts.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fetch from 'node-fetch';

const baseUrl = (process.env.SILERO_TTS_URL ?? 'http://127.0.0.1:8001').replace(/\/$/, '');
const voice = process.env.SILERO_TTS_VOICE ?? 'baya';
const api = process.env.SILERO_TTS_API ?? 'legacy';

const sample =
  'Это тест нейрорадио на русском. Queen выпустили Bohemian Rhapsody — ' +
  'шестиминутную оперу в рок-обёртке, и радио не знало, что с этим делать.';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../data/audio');
const outFile = path.join(outDir, 'test-silero.wav');

console.log(`[silero-test] URL=${baseUrl} voice=${voice} api=${api}`);

const healthLegacy = await fetch(`${baseUrl}/voices`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
const healthOpenAi = healthLegacy?.ok
  ? null
  : await fetch(`${baseUrl}/tts/model`, { signal: AbortSignal.timeout(8000) }).catch(() => null);

if (!healthLegacy?.ok && !healthOpenAi?.ok) {
  console.error('Silero not reachable. Run start-silero-tts.bat first (Docker).');
  process.exit(1);
}

let buf;
if (api === 'legacy' || healthLegacy?.ok) {
  const url =
    `${baseUrl}/process?VOICE=${encodeURIComponent(voice)}` +
    `&INPUT_TEXT=${encodeURIComponent(sample)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    console.error('Legacy synthesis failed:', res.status);
    process.exit(1);
  }
  buf = Buffer.from(await res.arrayBuffer());
} else {
  const res = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: sample, voice, response_format: 'ogg' }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    console.error('OpenAI synthesis failed:', res.status, (await res.text()).slice(0, 200));
    process.exit(1);
  }
  buf = Buffer.from(await res.arrayBuffer());
}

await mkdir(outDir, { recursive: true });
await writeFile(outFile, buf);
console.log(`OK: ${buf.length} bytes → ${outFile}`);
console.log('Open the file and listen — Silero Russian quality check.');
