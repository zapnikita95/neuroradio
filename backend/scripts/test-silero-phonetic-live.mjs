/**
 * Live Silero phonetic pipeline: text prep + synthesis smoke test.
 * Run: npm run build && node scripts/test-silero-phonetic-live.mjs
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSileroTtsTextTrace } from '../dist/services/tts-markup.js';
import { englishPhraseToRussianPhonetic } from '../dist/services/en-phonetic-ru.js';
import { wrapSileroRussianSsml } from '../dist/services/tts-silero-ssml.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../demo-audio/silero-phonetic-test');
const SILERO_URL = (process.env.SILERO_TTS_URL ?? 'http://127.0.0.1:8001').replace(/\/$/, '');

const CASES = [
  {
    artist: 'The Hit Co.',
    title: 'My Favorite Game',
    script:
      'The Hit Co. — демо-текст с английскими названиями. Трек My Favorite Game часто встречается в подборках.',
  },
  {
    artist: 'Red Hot Chili Peppers',
    title: 'Snow',
    script:
      'Помню Snow от Red Hot Chili Peppers — гитарный рифф и вокал Anthony Kiedis. В начале 2006 года трек крутили на повторе.',
  },
  {
    artist: 'Queen',
    title: 'Bohemian Rhapsody',
    script: 'Queen выпустили Bohemian Rhapsody — шестиминутную композицию с операной середины.',
  },
];

async function waitSilero(sec = 90) {
  const t0 = Date.now();
  while (Date.now() - t0 < sec * 1000) {
    try {
      const r = await fetch(`${SILERO_URL}/voices`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return true;
    } catch {
      /* */
    }
    await new Promise((x) => setTimeout(x, 4000));
  }
  return false;
}

async function synthSilero(text, voice = 'eugene') {
  const ssml = wrapSileroRussianSsml(text, { pauseProfile: 'natural', styleId: 'warm_story' });
  const url =
    `${SILERO_URL}/process?VOICE=${voice}&INPUT_TEXT=${encodeURIComponent(ssml.slice(0, 980))}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Silero ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function test(name, fn) {
  tests.push({ name, fn });
}

const tests = [];
let passed = 0;

console.log('[test-silero-phonetic-live]');

test('The Hit Co. phonetic is not Тхе Хит Цо', () => {
  const p = englishPhraseToRussianPhonetic('The Hit Co.');
  assert.match(p, /зэ/i);
  assert.doesNotMatch(p, /тхе|цо/i);
});

test('prepareSileroTtsTextTrace removes all Latin', () => {
  for (const c of CASES) {
    const trace = prepareSileroTtsTextTrace(c.script, { artist: c.artist, title: c.title });
    assert.doesNotMatch(
      trace.prepared,
      /[A-Za-z]{2,}/,
      `Latin left for ${c.artist}: ${trace.prepared.slice(0, 80)}`,
    );
  }
});

for (const { name, fn } of tests) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const sileroUp = await waitSilero();
if (!sileroUp) {
  console.warn('[test-silero-phonetic-live] Silero offline — text tests only');
} else {
  await mkdir(outDir, { recursive: true });
  const lines = [];
  for (const c of CASES) {
    const trace = prepareSileroTtsTextTrace(c.script, { artist: c.artist, title: c.title });
    const safe = c.artist.replace(/[^a-z0-9]+/gi, '-').slice(0, 24);
    const wavPath = path.join(outDir, `${safe}-phonetic-eugene.wav`);
    const buf = await synthSilero(trace.prepared, 'eugene');
    assert.ok(buf.length > 1000, 'wav too small');
    await writeFile(wavPath, buf);
    lines.push(`${path.basename(wavPath)}`);
    lines.push(`  in:  ${c.script.slice(0, 100)}…`);
    lines.push(`  tts: ${trace.prepared.slice(0, 120)}…`);
    lines.push(`  replacements: ${trace.latinReplacements.length}`);
    lines.push('');
    console.log(`  ok synthesized ${path.basename(wavPath)} (${buf.length} bytes)`);
    passed += 1;
  }
  await writeFile(path.join(outDir, 'README.txt'), lines.join('\n'), 'utf8');
}

console.log(`\n[test-silero-phonetic-live] ${passed} checks passed`);
