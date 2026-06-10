/**
 * Demo: The Hit Co. — Edge-only vs Silero+Edge (mixed Latin).
 * Run: npm run build && node scripts/demo-hit-co-tts.mjs
 *
 * Output: ../../demo-audio/hit-co/*.wav + transcript.txt
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EdgeTTS } from 'edge-tts-universal';
import { concatAudioBuffersToWav } from '../dist/services/audio-concat.js';
import {
  resolveEdgeTtsDeliveryForSilero,
  synthesizeEnglishEdgeTts,
} from '../dist/services/edge-tts-en.js';
import { splitMixedLanguageForEdge } from '../dist/services/tts-mixed-segments.js';
import { wrapSileroRussianSsml } from '../dist/services/tts-silero-ssml.js';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';
import { sanitizeScriptForTts } from '../dist/services/story-quality.js';
import { preserveMusicProperNames } from '../dist/services/tts-foreign-pronounce.js';
import { runTtsQualityPass } from '../dist/services/tts-quality-pass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../demo-audio/hit-co');

const ARTIST = 'The Hit Co.';
const TITLE = 'My Favorite Game';

const SCRIPT =
  'The Hit Co. — это не настоящая группа, а серия кавер-сборников. ' +
  'Их версия My Favorite Game часто светится в плейлистах с чужими именами артистов. ' +
  'Алгоритмы находят похожий звук — и в метаданных остаётся только The Hit Co.';

const SILERO_URL = (process.env.SILERO_TTS_URL ?? 'http://127.0.0.1:8001').replace(/\/$/, '');
const SILERO_VOICE = 'eugene';

async function synthesizeEdgeRussian(text, voice = 'ru-RU-DmitryNeural', speed = 1.0) {
  const trimmed = text.trim();
  if (!trimmed) return Buffer.alloc(0);
  const pct = Math.round((speed - 1) * 100);
  const rate = `${pct >= 0 ? '+' : ''}${pct}%`;
  const tts = new EdgeTTS(trimmed, voice, { rate, pitch: '+0Hz' });
  const result = await tts.synthesize();
  return Buffer.from(await result.audio.arrayBuffer());
}

async function fetchSileroRu(text) {
  const ssml = wrapSileroRussianSsml(text, { pauseProfile: 'natural', styleId: 'warm_story' });
  const url =
    `${SILERO_URL}/process?VOICE=${encodeURIComponent(SILERO_VOICE)}` +
    `&INPUT_TEXT=${encodeURIComponent(ssml.slice(0, 980))}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new Error(`Silero HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function prepareMixedSourceText() {
  let text = preserveMusicProperNames(SCRIPT, ARTIST, TITLE);
  text = sanitizeScriptForTts(text, ARTIST, TITLE);
  text = runTtsQualityPass(text).text;
  return text;
}

async function buildSegmented(chunks, label) {
  const buffers = [];
  for (const chunk of chunks) {
    if (!chunk.text.trim()) continue;
    if (chunk.engine === 'edge-ru') {
      buffers.push(await synthesizeEdgeRussian(chunk.text));
    } else if (chunk.engine === 'edge-en') {
      buffers.push(await synthesizeEnglishEdgeTts(chunk.text, SILERO_VOICE, { speed: 1.0 }));
    } else if (chunk.engine === 'silero-ru') {
      buffers.push(await fetchSileroRu(chunk.text));
    }
  }
  const outPath = path.join(outDir, `${label}.wav`);
  await concatAudioBuffersToWav(buffers, outPath);
  return outPath;
}

async function waitSilero(maxSec = 120) {
  const started = Date.now();
  while (Date.now() - started < maxSec * 1000) {
    try {
      const res = await fetch(`${SILERO_URL}/voices`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const mixedSource = prepareMixedSourceText();
  const segments = splitMixedLanguageForEdge(mixedSource, ARTIST, TITLE);

  const edgeChunks = segments.map((seg) => ({
    text: seg.text,
    engine: seg.lang === 'en' ? 'edge-en' : 'edge-ru',
  }));

  const sileroEdgeChunks = segments.map((seg) => ({
    text: seg.text,
    engine: seg.lang === 'en' ? 'edge-en' : 'silero-ru',
  }));

  console.log('[demo-hit-co] waiting Silero…');
  const sileroOk = await waitSilero();
  if (!sileroOk) {
    console.error('[demo-hit-co] Silero not ready at', SILERO_URL);
    console.error('Run: start-silero-tts.bat');
    process.exitCode = 1;
    return;
  }

  console.log('[demo-hit-co] segments:');
  for (const [i, seg] of segments.entries()) {
    console.log(`  ${i + 1}. [${seg.lang}] ${seg.text.slice(0, 72)}${seg.text.length > 72 ? '…' : ''}`);
  }

  const edgePath = await buildSegmented(edgeChunks, '01-edge-only-dmitry-christopher');
  console.log('[demo-hit-co] wrote', edgePath);

  const mixedPath = await buildSegmented(sileroEdgeChunks, '02-silero-edge-mixed');
  console.log('[demo-hit-co] wrote', mixedPath);

  const edgeRuVoice = 'ru-RU-DmitryNeural';
  const edgeEnVoice = resolveEdgeTtsDeliveryForSilero(SILERO_VOICE).voice;

  const report = [
    'The Hit Co. — demo TTS',
    '',
    'Исходный текст:',
    SCRIPT,
    '',
    'Сегменты:',
    ...segments.map((s, i) => `${i + 1}. [${s.lang}] ${s.text}`),
    '',
    '01-edge-only-dmitry-christopher.wav',
    `  RU: Edge ${edgeRuVoice}`,
    `  EN: Edge ${edgeEnVoice}`,
    '',
    '02-silero-edge-mixed.wav',
    `  RU: Silero ${SILERO_VOICE} (legacy @ ${SILERO_URL})`,
    `  EN: Edge ${edgeEnVoice}`,
    '',
    'Yandex premium (для сравнения — не сгенерирован, нужен API key):',
    prepareYandexTtsText(SCRIPT, { artist: ARTIST, title: TITLE }).slice(0, 400) + '…',
  ].join('\n');

  const reportPath = path.join(outDir, 'README.txt');
  await writeFile(reportPath, report, 'utf8');
  console.log('[demo-hit-co] wrote', reportPath);
}

main().catch((err) => {
  console.error('[demo-hit-co] FATAL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
