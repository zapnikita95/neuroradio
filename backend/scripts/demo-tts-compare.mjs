/**
 * 5× Edge-only + 5× Silero+Edge + 5× Silero phonetic (CMU/G2P) — разные голоса.
 * Текст — демо, не утверждение про метаданные в Яндекс Музыке.
 *
 * Run: npm run build && node scripts/demo-tts-compare.mjs
 * Output: demo-audio/tts-compare/
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
import { splitMixedLanguageForSilero } from '../dist/services/tts-silero-segments.js';
import { wrapSileroRussianSsml } from '../dist/services/tts-silero-ssml.js';
import { prepareSileroTtsTextTrace } from '../dist/services/tts-markup.js';
import { sanitizeScriptForTts } from '../dist/services/story-quality.js';
import { preserveMusicProperNames } from '../dist/services/tts-foreign-pronounce.js';
import { runTtsQualityPass } from '../dist/services/tts-quality-pass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const outRoot = path.join(root, 'demo-audio/tts-compare');

const ARTIST = 'Red Hot Chili Peppers';
const TITLE = 'Snow (Hey Oh)';

/** Нейтральный демо-сценарий — не про «ошибку исполнителя» в стриминге. */
const SCRIPT =
  'Red Hot Chili Peppers выпустили Snow — трек с запоминающимся гитарным риффом. ' +
  'Помню, как в начале две тысячи седьмого года включали его на повторе: Snow и фамилия Peppers в эфире звучат по-английски.';

const SILERO_URL = (process.env.SILERO_TTS_URL ?? 'http://127.0.0.1:8001').replace(/\/$/, '');

/** 5 пар Edge RU + Edge EN */
const EDGE_ONLY = [
  { file: '01-dmitry-christopher', ru: 'ru-RU-DmitryNeural', en: 'en-US-ChristopherNeural', rate: '+6%', pitch: '+1Hz' },
  { file: '02-dmitry-eric', ru: 'ru-RU-DmitryNeural', en: 'en-US-EricNeural', rate: '+0%', pitch: '+0Hz' },
  { file: '03-dmitry-jenny', ru: 'ru-RU-DmitryNeural', en: 'en-US-JennyNeural', rate: '+0%', pitch: '+0Hz' },
  { file: '04-svetlana-aria', ru: 'ru-RU-SvetlanaNeural', en: 'en-US-AriaNeural', rate: '+5%', pitch: '+2Hz' },
  { file: '05-svetlana-guy', ru: 'ru-RU-SvetlanaNeural', en: 'en-US-GuyNeural', rate: '+0%', pitch: '+0Hz' },
];

/** 5 Silero RU + paired Edge EN (via silero voice id) */
const SILERO_EDGE = [
  { file: '01-eugene-christopher', silero: 'eugene' },
  { file: '02-aidar-eric', silero: 'aidar', enOverride: 'en-US-EricNeural', rate: '+0%', pitch: '+0Hz' },
  { file: '03-baya-jenny', silero: 'baya' },
  { file: '04-kseniya-aria', silero: 'kseniya' },
  { file: '05-aidar-christopher', silero: 'aidar', enOverride: 'en-US-ChristopherNeural', rate: '+6%', pitch: '+1Hz' },
];

/** 5 Silero phonetic (prod default) — один голос, CMU+G2P кириллица */
const SILERO_PHONETIC = [
  { file: '01-eugene', silero: 'eugene' },
  { file: '02-aidar', silero: 'aidar' },
  { file: '03-baya', silero: 'baya' },
  { file: '04-kseniya', silero: 'kseniya' },
  { file: '05-xenia', silero: 'xenia' },
];

function prepareMixedLatinText() {
  let text = preserveMusicProperNames(SCRIPT, ARTIST, TITLE);
  text = sanitizeScriptForTts(text, ARTIST, TITLE);
  text = runTtsQualityPass(text).text;
  return text;
}

async function edgeRu(text, voice, speed = 1.0) {
  if (!text.trim()) return Buffer.alloc(0);
  const pct = Math.round((speed - 1) * 100);
  const rate = `${pct >= 0 ? '+' : ''}${pct}%`;
  const tts = new EdgeTTS(text.trim(), voice, { rate, pitch: '+0Hz' });
  return Buffer.from(await (await tts.synthesize()).audio.arrayBuffer());
}

async function edgeEn(text, voice, rate = '+0%', pitch = '+0Hz', retries = 3) {
  if (!text.trim()) return Buffer.alloc(0);
  let lastErr;
  for (let i = 0; i < retries; i += 1) {
    try {
      const tts = new EdgeTTS(text.trim(), voice, { rate, pitch });
      const buf = Buffer.from(await (await tts.synthesize()).audio.arrayBuffer());
      if (buf.length >= 64) return buf;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr ?? new Error('Edge EN empty');
}

async function sileroRu(text, voice) {
  if (!text.trim()) return Buffer.alloc(0);
  const ssml = wrapSileroRussianSsml(text, { pauseProfile: 'natural', styleId: 'warm_story' });
  const url =
    `${SILERO_URL}/process?VOICE=${encodeURIComponent(voice)}` +
    `&INPUT_TEXT=${encodeURIComponent(ssml.slice(0, 980))}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Silero ${voice}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function concatSegments(segments, outPath) {
  const bufs = [];
  for (const seg of segments) {
    bufs.push(await seg());
  }
  await concatAudioBuffersToWav(bufs.filter((b) => b.length > 64), outPath);
}

async function waitSilero(sec = 120) {
  const t0 = Date.now();
  while (Date.now() - t0 < sec * 1000) {
    try {
      if ((await fetch(`${SILERO_URL}/voices`, { signal: AbortSignal.timeout(5000) })).ok) return true;
    } catch {
      /* */
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  return false;
}

function segmentJobs(segments, mode, preset) {
  return segments.map((seg) => async () => {
    if (seg.lang === 'ru') {
      if (mode === 'edge') return edgeRu(seg.text, preset.ru);
      return sileroRu(seg.text, preset.silero);
    }
    if (mode === 'edge') {
      return edgeEn(seg.text, preset.en, preset.rate ?? '+0%', preset.pitch ?? '+0Hz');
    }
    if (preset.enOverride) {
      return edgeEn(seg.text, preset.enOverride, preset.rate ?? '+0%', preset.pitch ?? '+0Hz');
    }
    return synthesizeEnglishEdgeTts(seg.text, preset.silero, { speed: 1.0 });
  });
}

async function main() {
  await mkdir(path.join(outRoot, 'edge-only'), { recursive: true });
  await mkdir(path.join(outRoot, 'silero-edge'), { recursive: true });
  await mkdir(path.join(outRoot, 'silero-phonetic'), { recursive: true });

  const latinText = prepareMixedLatinText();
  const segments = splitMixedLanguageForSilero(latinText, ARTIST, TITLE);
  const phoneticTrace = prepareSileroTtsTextTrace(SCRIPT, { artist: ARTIST, title: TITLE });

  console.log('[demo-tts-compare] Latin segments (Edge / Silero+Edge):');
  segments.forEach((s, i) => console.log(`  ${i + 1}. [${s.lang}] ${s.text.slice(0, 70)}…`));
  console.log('[demo-tts-compare] Silero phonetic text (prod):');
  console.log(`  ${phoneticTrace.prepared.slice(0, 140)}…`);

  if (!(await waitSilero())) {
    console.error('[demo-tts-compare] Silero not ready — start-silero-tts.bat');
    process.exitCode = 1;
    return;
  }

  const manifest = [
    'TTS compare — демо-текст (не факт про метаданные в стриминге)',
    '',
    `Artist: ${ARTIST}`,
    `Title: ${TITLE}`,
    '',
    'Script:',
    SCRIPT,
    '',
    'Silero phonetic (CMU+G2P, один голос):',
    phoneticTrace.prepared,
    '',
  ];

  for (const p of EDGE_ONLY) {
    const out = path.join(outRoot, 'edge-only', `${p.file}.wav`);
    try {
      await concatSegments(segmentJobs(segments, 'edge', p), out);
      console.log('[edge-only]', out);
      manifest.push(`edge-only/${p.file}.wav — RU ${p.ru}, EN ${p.en} (${p.rate})`);
    } catch (err) {
      console.error('[edge-only] FAIL', p.file, err instanceof Error ? err.message : err);
    }
  }

  for (const p of SILERO_EDGE) {
    const out = path.join(outRoot, 'silero-edge', `${p.file}.wav`);
    try {
      await concatSegments(segmentJobs(segments, 'silero-edge', p), out);
      const en = p.enOverride ?? resolveEdgeTtsDeliveryForSilero(p.silero).voice;
      console.log('[silero-edge]', out);
      manifest.push(`silero-edge/${p.file}.wav — Silero ${p.silero}, EN ${en}`);
    } catch (err) {
      console.error('[silero-edge] FAIL', p.file, err instanceof Error ? err.message : err);
    }
  }

  for (const p of SILERO_PHONETIC) {
    const out = path.join(outRoot, 'silero-phonetic', `${p.file}.wav`);
    try {
      const buf = await sileroRu(phoneticTrace.prepared, p.silero);
      await writeFile(out, buf);
      console.log('[silero-phonetic]', out);
      manifest.push(`silero-phonetic/${p.file}.wav — Silero ${p.silero}, CMU+G2P кириллица`);
    } catch (err) {
      console.error('[silero-phonetic] FAIL', p.file, err instanceof Error ? err.message : err);
    }
  }

  manifest.push('', 'Edge rate fix: +6% (не +6.00% — Edge API отклонял .00)');
  await writeFile(path.join(outRoot, 'README.txt'), manifest.join('\n'), 'utf8');
  console.log('[demo-tts-compare] done →', outRoot);
}

main().catch((err) => {
  console.error('[demo-tts-compare] FATAL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
