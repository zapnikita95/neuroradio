/**
 * Все TTS-демо в ОДНУ папку demo-audio/ (корень репо).
 * Run: npm run build && node scripts/demo-audio-all.mjs
 *
 * Имена: YYYY-MM-DD_{sample}_{mode}_{voices}.wav
 * Женский RU → женский EN (Svetlana + Jenny). Мужской → мужской (Dmitry + Eric).
 */
import { mkdir, readdir, rm, writeFile, stat } from 'node:fs/promises';
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
const outDir = path.join(root, 'demo-audio');
const DATE = new Date().toISOString().slice(0, 10);

const SAMPLES = [
  {
    id: '01-ratm-christmas',
    artist: 'Rage Against The Machine',
    title: 'Killing in The Name',
    script:
      'Killing in The Name от Rage Against The Machine неожиданно возглавил британский рождественский чарт в две тысячи девятом. ' +
      'Фанаты устроили кампанию в интернете, чтобы вытеснить попсу из топов — и у них получилось.',
    fact: 'UK Christmas #1 2009',
  },
  {
    id: '02-thriller-mtv',
    artist: 'Michael Jackson',
    title: 'Thriller',
    script:
      'Thriller от Michael Jackson вышел, когда клипы только меняли правила игры. ' +
      'MTV крутил в основном рок, но Thriller ставили в эфир целиком. Джексон вложил полмиллиона долларов из своего кармана.',
    fact: '1982 MTV, $500k video',
  },
  {
    id: '03-rhcp-snow',
    artist: 'Red Hot Chili Peppers',
    title: 'Snow (Hey Oh)',
    script:
      'Snow от Red Hot Chili Peppers — гитарный рифф с альбома Stadium Arcadium, две тысячи шестой год. ' +
      'В начале две тысячи седьмого его крутили на повторе: Peppers в эфире звучат по-английски.',
    fact: 'Stadium Arcadium 2006',
  },
];

/** phonetic-edge = кириллица-фонетика на Edge RU */
const PHONETIC_RU = [
  { tag: 'dmitry', voice: 'ru-RU-DmitryNeural', rate: '+0%', pitch: '+0Hz' },
  { tag: 'svetlana', voice: 'ru-RU-SvetlanaNeural', rate: '+0%', pitch: '+0Hz' },
];

/** en-mixed = RU Edge + EN Edge; пол RU = пол EN */
const EN_MIXED_PAIRS = [
  { tag: 'svetlana-jenny', ru: 'ru-RU-SvetlanaNeural', en: 'en-US-JennyNeural', rate: '+0%', pitch: '+0Hz' },
  { tag: 'dmitry-eric', ru: 'ru-RU-DmitryNeural', en: 'en-US-EricNeural', rate: '+0%', pitch: '+0Hz' },
];

async function synthEdge(text, { voice, rate, pitch }) {
  const tts = new EdgeTTS(text.trim(), voice, { rate, pitch });
  return Buffer.from(await (await tts.synthesize()).audio.arrayBuffer());
}

function fname(sampleId, mode, voiceTag) {
  return `${DATE}_${sampleId}_${mode}_${voiceTag}.wav`;
}

async function concatBuffers(bufs) {
  const tmp = path.join(outDir, `_tmp-${Date.now()}.wav`);
  await concatAudioBuffersToWav(bufs.filter((b) => b.length > 64), tmp);
  const { readFile, unlink } = await import('node:fs/promises');
  const data = await readFile(tmp);
  await unlink(tmp).catch(() => {});
  return data;
}

function prepareEnMixedText(script, artist, title) {
  const marked = prepareYandexTtsText(script, { artist, title, sentencePauses: false });
  return mergeLatinTitleOtArtist(marked.replace(/<\[[^\]]+\]>/g, ' ').replace(/\s+/g, ' ').trim());
}

async function writeTranscript(sample, trace, edgeText) {
  const base = `${DATE}_${sample.id}_transcript.txt`;
  const lines = [
    `Generated: ${DATE} ${new Date().toISOString()}`,
    `Sample: ${sample.id}`,
    `Artist: ${sample.artist}`,
    `Title: ${sample.title}`,
    `Fact: ${sample.fact}`,
    '',
    '## Script',
    sample.script,
    '',
    '## Silero (+ stress)',
    trace.prepared,
    '',
    '## Edge phonetic (CAPS = stress vowel)',
    edgeText,
    '',
    '## Phrase breakdown',
  ];
  for (const phrase of [sample.title, sample.artist]) {
    const t = englishPhrasePhoneticTranscript(phrase);
    lines.push(`### ${phrase}`);
    lines.push(`Silero: ${t.phraseSilero}`);
    lines.push(`Edge:   ${t.phraseEdge}`);
    lines.push('');
  }
  await writeFile(path.join(outDir, base), lines.join('\n'), 'utf8');
  return base;
}

/** Удалить старые подпапки demo-audio/* — всё только в корне demo-audio/. */
async function cleanOldSubfolders() {
  const entries = await readdir(outDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sub = path.join(outDir, e.name);
    await rm(sub, { recursive: true, force: true });
    console.log('[clean] removed', sub);
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await cleanOldSubfolders();

  const manifest = [
    `# Demo audio — ${DATE}`,
    '',
    `Сгенерировано: ${new Date().toISOString()}`,
    'Папка одна: demo-audio/ (без вложенных каталогов).',
    '',
    '## Режимы',
    '- `phonetic-edge` — Edge RU читает кириллицу-фонетику (CMU+G2P)',
    '- `en-mixed` — Edge RU русский текст + Edge EN латиница (род совпадает)',
    '',
    '## Пары голосов',
    '- svetlana-jenny: ru-RU-SvetlanaNeural + en-US-JennyNeural (ж/ж)',
    '- dmitry-eric: ru-RU-DmitryNeural + en-US-EricNeural (м/м)',
    '',
    '## Файлы',
    '',
  ];

  for (const sample of SAMPLES) {
    const trace = prepareSileroTtsTextTrace(sample.script, {
      artist: sample.artist,
      title: sample.title,
    });
    const edgeText = sileroPhoneticToEdge(trace.prepared);
    const transcriptFile = await writeTranscript(sample, trace, edgeText);
    manifest.push(`### ${sample.id} — ${sample.fact}`);
    manifest.push(`transcript: ${transcriptFile}`);
    manifest.push('');

    for (const v of PHONETIC_RU) {
      const name = fname(sample.id, 'phonetic-edge', v.tag);
      const out = path.join(outDir, name);
      const buf = await synthEdge(edgeText, v);
      await writeFile(out, buf);
      const st = await stat(out);
      manifest.push(`${name}  (${Math.round(st.size / 1024)} KB)  ${v.voice}`);
      console.log('[phonetic]', name);
    }

    const ruText = prepareEnMixedText(sample.script, sample.artist, sample.title);
    const segments = splitMixedLanguageForSilero(ruText, sample.artist, sample.title).map((s) =>
      s.lang === 'ru' ? { ...s, text: s.text.replace(/\+/g, '') } : s,
    );

    for (const pair of EN_MIXED_PAIRS) {
      const name = fname(sample.id, 'en-mixed', pair.tag);
      const bufs = [];
      for (const seg of segments) {
        bufs.push(
          await synthEdge(seg.text, {
            voice: seg.lang === 'en' ? pair.en : pair.ru,
            rate: pair.rate,
            pitch: pair.pitch,
          }),
        );
      }
      await writeFile(path.join(outDir, name), await concatBuffers(bufs));
      const st = await stat(path.join(outDir, name));
      manifest.push(
        `${name}  (${Math.round(st.size / 1024)} KB)  RU ${pair.ru} + EN ${pair.en}`,
      );
      console.log('[en-mixed]', name, `(${segments.length} segs)`);
    }
    manifest.push('');
  }

  await writeFile(path.join(outDir, 'README.md'), manifest.join('\n'), 'utf8');
  console.log('[demo-audio-all] done →', outDir);
}

main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
