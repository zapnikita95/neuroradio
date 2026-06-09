/**
 * Edge phonetic + Edge EN-mixed demos на реальных фактах.
 * Run: npm run build && node scripts/demo-edge-phonetic-samples.mjs
 * Output:
 *   demo-audio/edge-phonetic-samples/   — Cyrillic phonetic (Dmitry/Svetlana)
 *   demo-audio/edge-en-mixed/           — RU Edge + EN Edge (латиница по-английски)
 *   demo-audio/phonetic-transcripts/    — подробные .txt расшифровки
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EdgeTTS } from 'edge-tts-universal';
import { concatAudioBuffersToWav } from '../dist/services/audio-concat.js';
import { prepareSileroTtsTextTrace, prepareYandexTtsText } from '../dist/services/tts-markup.js';
import {
  sileroPhoneticToEdge,
  englishPhrasePhoneticTranscript,
} from '../dist/services/en-phonetic-ru.js';
import { splitMixedLanguageForSilero } from '../dist/services/tts-silero-segments.js';
import { mergeLatinTitleOtArtist } from '../dist/services/tts-yandex-ssml.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const phoneticOut = path.join(root, 'demo-audio/edge-phonetic-samples');
const enMixedOut = path.join(root, 'demo-audio/edge-en-mixed');
const transcriptOut = path.join(root, 'demo-audio/phonetic-transcripts');

/** Русские скрипты как в проде — латиница только в artist/title, не «Title by Artist». */
const SAMPLES = [
  {
    id: '01-ratm-christmas',
    artist: 'Rage Against The Machine',
    title: 'Killing in The Name',
    script:
      'Killing in The Name от Rage Against The Machine неожиданно возглавил британский рождественский чарт в две тысячи девятом. ' +
      'Фанаты устроили кампанию в интернете, чтобы вытеснить попсу из топов — и у них получилось.',
    fact: 'UK Christmas #1 2009, fan campaign vs pop charts',
  },
  {
    id: '02-thriller-mtv',
    artist: 'Michael Jackson',
    title: 'Thriller',
    script:
      'Thriller от Michael Jackson вышел, когда клипы только меняли правила игры. ' +
      'MTV крутил в основном рок, но Thriller ставили в эфир целиком. Джексон вложил полмиллиона долларов из своего кармана.',
    fact: '1982 MTV era, $500k self-funded video',
  },
  {
    id: '03-rhcp-snow',
    artist: 'Red Hot Chili Peppers',
    title: 'Snow (Hey Oh)',
    script:
      'Snow от Red Hot Chili Peppers — гитарный рифф с альбома Stadium Arcadium, две тысячи шестой год. ' +
      'В начале две тысячи седьмого его крутили на повторе: Peppers в эфире звучат по-английски.',
    fact: 'Stadium Arcadium 2006, radio repeat 2007',
  },
];

const PHONETIC_VOICES = [
  { tag: 'dmitry', voice: 'ru-RU-DmitryNeural', rate: '+0%', pitch: '+0Hz' },
  { tag: 'svetlana', voice: 'ru-RU-SvetlanaNeural', rate: '+0%', pitch: '+0Hz' },
  { tag: 'svetlana-slow', voice: 'ru-RU-SvetlanaNeural', rate: '-8%', pitch: '+0Hz' },
];

const EN_MIXED = {
  ru: 'ru-RU-SvetlanaNeural',
  en: 'en-US-ChristopherNeural',
  rate: '+0%',
  pitch: '+0Hz',
};

async function synthEdge(text, { voice, rate, pitch }) {
  const tts = new EdgeTTS(text.trim(), voice, { rate, pitch });
  return Buffer.from(await (await tts.synthesize()).audio.arrayBuffer());
}

async function writeTranscript(sample, trace, edgeText) {
  const lines = [
    `# ${sample.id}`,
    `Artist: ${sample.artist}`,
    `Title: ${sample.title}`,
    `Fact: ${sample.fact}`,
    '',
    '## Script (display)',
    sample.script,
    '',
    '## Silero (+ = ударение)',
    trace.prepared,
    '',
    '## Edge (ЗАГЛАВНАЯ = ударная гласная)',
    edgeText,
    '',
    '## Latin replacements',
    ...trace.latinReplacements.map(
      (r) => `- [${r.source}] ${r.from} → ${r.to}`,
    ),
    '',
    '## Phrase breakdown',
  ];

  for (const phrase of [sample.title, sample.artist, 'Stadium Arcadium', 'MTV']) {
    const t = englishPhrasePhoneticTranscript(phrase);
    lines.push(`### ${phrase}`);
    lines.push(`Silero: ${t.phraseSilero}`);
    lines.push(`Edge:   ${t.phraseEdge}`);
    for (const w of t.words) {
      if (w.source === 'phrase-override') continue;
      lines.push(
        `  ${w.token}: [${w.source}] ${w.phonemes || '—'} → silero «${w.silero}» edge «${w.edge}»`,
      );
    }
    lines.push('');
  }

  const file = path.join(transcriptOut, `${sample.id}.txt`);
  await writeFile(file, lines.join('\n'), 'utf8');
  return file;
}

/** EN-mixed: русский текст + латиница (как premium Yandex), без фонетической кириллицы. */
function prepareEnMixedText(script, artist, title) {
  const marked = prepareYandexTtsText(script, { artist, title, sentencePauses: false });
  return mergeLatinTitleOtArtist(marked.replace(/<\[[^\]]+\]>/g, ' ').replace(/\s+/g, ' ').trim());
}

async function synthEnMixed(script, artist, title) {
  const ruText = prepareEnMixedText(script, artist, title);
  const segments = splitMixedLanguageForSilero(ruText, artist, title).map((s) =>
    s.lang === 'ru' ? { ...s, text: s.text.replace(/\+/g, '') } : s,
  );
  const bufs = [];
  for (const seg of segments) {
    if (seg.lang === 'en') {
      bufs.push(await synthEdge(seg.text, {
        voice: EN_MIXED.en,
        rate: EN_MIXED.rate,
        pitch: EN_MIXED.pitch,
      }));
    } else {
      bufs.push(await synthEdge(seg.text, {
        voice: EN_MIXED.ru,
        rate: EN_MIXED.rate,
        pitch: EN_MIXED.pitch,
      }));
    }
  }
  return { ruText, segments, buf: await concatBuffers(bufs) };
}

async function concatBuffers(bufs) {
  const tmp = path.join(enMixedOut, `_tmp-${Date.now()}.wav`);
  await mkdir(enMixedOut, { recursive: true });
  await concatAudioBuffersToWav(bufs.filter((b) => b.length > 64), tmp);
  const { readFile, unlink } = await import('node:fs/promises');
  const data = await readFile(tmp);
  await unlink(tmp).catch(() => {});
  return data;
}

async function main() {
  await mkdir(phoneticOut, { recursive: true });
  await mkdir(enMixedOut, { recursive: true });
  await mkdir(transcriptOut, { recursive: true });

  const manifest = ['Edge phonetic + EN-mixed demos', ''];

  for (const sample of SAMPLES) {
    const trace = prepareSileroTtsTextTrace(sample.script, {
      artist: sample.artist,
      title: sample.title,
    });
    const edgeText = sileroPhoneticToEdge(trace.prepared);

    const transcriptFile = await writeTranscript(sample, trace, edgeText);
    console.log(`[${sample.id}] transcript → ${transcriptFile}`);
    console.log(`  Silero: ${trace.prepared.slice(0, 90)}…`);
    console.log(`  Edge:   ${edgeText.slice(0, 90)}…`);

    manifest.push(`## ${sample.id}`);
    manifest.push(trace.prepared);
    manifest.push(edgeText);
    manifest.push('');

    for (const v of PHONETIC_VOICES) {
      const file = `${sample.id}-${v.tag}.wav`;
      const out = path.join(phoneticOut, file);
      await writeFile(out, await synthEdge(edgeText, v));
      console.log(`  phonetic → ${file}`);
      manifest.push(`phonetic/${file}`);
    }

    const mixed = await synthEnMixed(sample.script, sample.artist, sample.title);
    const mixedFile = `${sample.id}-ru-svetlana-en-christopher.wav`;
    await writeFile(path.join(enMixedOut, mixedFile), mixed.buf);
    console.log(`  en-mixed → ${mixedFile} (${mixed.segments.length} segments)`);
    mixed.segments.forEach((s, i) => console.log(`    ${i + 1}. [${s.lang}] ${s.text.slice(0, 60)}`));
    manifest.push(`en-mixed/${mixedFile}`);
    manifest.push('');
  }

  manifest.push(
    'phonetic-transcripts/*.txt — CMU/G2P, +ударения, edge caps',
    'edge-en-mixed — Svetlana RU + Christopher EN на латинице',
  );
  await writeFile(path.join(phoneticOut, 'README.txt'), manifest.join('\n'), 'utf8');
  console.log('[demo-edge-phonetic-samples] done');
}

main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
