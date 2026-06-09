/**
 * Edge phonetic A/B: Dmitry vs Svetlana на реальных фактах.
 * Run: npm run build && node scripts/demo-edge-phonetic-samples.mjs
 * Output: demo-audio/edge-phonetic-samples/
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EdgeTTS } from 'edge-tts-universal';
import { prepareSileroTtsTextTrace } from '../dist/services/tts-markup.js';
import { sileroPhoneticToEdge } from '../dist/services/en-phonetic-ru.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const outRoot = path.join(root, 'demo-audio/edge-phonetic-samples');

/** Реальные факты — как в проде, короткие радио-вставки. */
const SAMPLES = [
  {
    id: '01-ratm-christmas',
    artist: 'Rage Against The Machine',
    title: 'Killing in The Name',
    script:
      'Killing in The Name by Rage Against The Machine неожиданно возглавил британский рождественский чарт в две тысячи девятом. ' +
      'Фанаты устроили кампанию в интернете, чтобы вытеснить попсу из топов — и у них получилось.',
    fact: 'UK Christmas #1 2009, fan campaign vs pop charts',
  },
  {
    id: '02-thriller-mtv',
    artist: 'Michael Jackson',
    title: 'Thriller',
    script:
      'Thriller by Michael Jackson вышел, когда клипы только меняли правила игры. ' +
      'MTV крутил в основном рок, но Thriller ставили в эфир целиком. Джексон вложил полмиллиона долларов из своего кармана.',
    fact: '1982 MTV era, $500k self-funded video',
  },
  {
    id: '03-rhcp-snow',
    artist: 'Red Hot Chili Peppers',
    title: 'Snow (Hey Oh)',
    script:
      'Snow by Red Hot Chili Peppers — гитарный рифф с альбома Stadium Arcadium, две тысячи шестой год. ' +
      'В начале две тысячи седьмого его крутили на повторе: Peppers в эфире звучат по-английски.',
    fact: 'Stadium Arcadium 2006, radio repeat 2007',
  },
];

const VOICES = [
  { tag: 'dmitry', voice: 'ru-RU-DmitryNeural', rate: '+0%', pitch: '+0Hz' },
  { tag: 'svetlana', voice: 'ru-RU-SvetlanaNeural', rate: '+0%', pitch: '+0Hz' },
  { tag: 'svetlana-slow', voice: 'ru-RU-SvetlanaNeural', rate: '-8%', pitch: '+0Hz' },
];

async function synth(text, { voice, rate, pitch }) {
  const tts = new EdgeTTS(text.trim(), voice, { rate, pitch });
  return Buffer.from(await (await tts.synthesize()).audio.arrayBuffer());
}

async function main() {
  await mkdir(outRoot, { recursive: true });
  const manifest = ['Edge phonetic samples — Dmitry vs Svetlana', ''];

  for (const sample of SAMPLES) {
    const trace = prepareSileroTtsTextTrace(sample.script, {
      artist: sample.artist,
      title: sample.title,
    });
    const edgeText = sileroPhoneticToEdge(trace.prepared);

    manifest.push(`## ${sample.id}`);
    manifest.push(`Artist: ${sample.artist}`);
    manifest.push(`Title: ${sample.title}`);
    manifest.push(`Fact: ${sample.fact}`);
    manifest.push(`Script: ${sample.script}`);
    manifest.push(`Silero: ${trace.prepared}`);
    manifest.push(`Edge:   ${edgeText}`);
    manifest.push('');

    console.log(`[${sample.id}] Edge text: ${edgeText.slice(0, 100)}…`);

    for (const v of VOICES) {
      const file = `${sample.id}-${v.tag}.wav`;
      const out = path.join(outRoot, file);
      const buf = await synth(edgeText, v);
      await writeFile(out, buf);
      console.log(`  → ${file} (${buf.length} bytes)`);
      manifest.push(`${file} — ${v.voice} ${v.rate}`);
    }
    manifest.push('');
  }

  manifest.push(
    'Fix v2: sileroPhoneticToEdge lowercases word caps — only stress vowel uppercase (пЭпэрз not ПЭпэрз).',
    'Dmitry breaks ПЭ as two syllables; Svetlana tolerates it better.',
  );
  await writeFile(path.join(outRoot, 'README.txt'), manifest.join('\n'), 'utf8');
  console.log('[demo-edge-phonetic-samples] done →', outRoot);
}

main().catch((err) => {
  console.error('[demo-edge-phonetic-samples] FATAL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
