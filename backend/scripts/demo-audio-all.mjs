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

async function synthEdge(text, { voice, rate, pitch }, retries = 5) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const tts = new EdgeTTS(text.trim(), voice, { rate, pitch });
      const buf = Buffer.from(await (await tts.synthesize()).audio.arrayBuffer());
      if (buf.length > 64) return buf;
      lastErr = new Error('No audio was received.');
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function fname(sampleId, mode, voiceTag, variant = '') {
  const mid = variant ? `${mode}_${variant}` : mode;
  return `${DATE}_${sampleId}_${mid}_${voiceTag}.wav`;
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

/** Чистый русский для Edge RU — без латиницы и без + (Edge читает «плюс»). */
function preparePureRuText(script) {
  const marked = prepareYandexTtsText(script, { sentencePauses: false });
  return marked.replace(/<\[[^\]]+\]>/g, ' ').replace(/\+/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Варианты без названия трека/артиста — целый текст переписан под русский,
 * как сделала бы модель: метка вписана в синтаксис, а не подставлена в начало.
 */
const GENERIC_BY_SAMPLE = {
  '01-ratm-christmas': [
    {
      tag: 'tekushchiy-trek',
      script:
        'Текущий трек неожиданно возглавил британский рождественский чарт в две тысячи девятом. ' +
        'Фанаты устроили кампанию в интернете, чтобы вытеснить попсу из топов — и у них получилось.',
    },
    {
      tag: 'eta-kompoziciya',
      script:
        'Эта композиция неожиданно возглавила британский рождественский чарт в две тысячи девятом. ' +
        'Фанаты устроили кампанию в интернете, чтобы вытеснить попсу из топов — и у них получилось.',
    },
    {
      tag: 'eta-pesnya',
      script:
        'Эта песня неожиданно возглавила британский рождественский чарт в две тысячи девятом. ' +
        'Фанаты устроили кампанию в интернете, чтобы вытеснить попсу из топов — и у них получилось.',
    },
    {
      tag: 'etot-hit',
      script:
        'Этот хит неожиданно возглавил британский рождественский чарт в две тысячи девятом. ' +
        'Фанаты устроили кампанию в интернете, чтобы вытеснить попсу из топов — и у них получилось.',
    },
    {
      tag: 'seychas-v-efire',
      script:
        'Неожиданно именно то, что сейчас крутят в эфире, возглавило британский рождественский чарт в две тысячи девятом. ' +
        'Фанаты устроили кампанию в интернете, чтобы вытеснить попсу из топов — и у них получилось.',
    },
  ],
  '02-thriller-mtv': [
    {
      tag: 'tekushchiy-trek',
      script:
        'В эфире сейчас классика, которая вышла тогда, когда клипы только меняли правила игры. ' +
        'МТВ крутил в основном рок, но эту композицию ставили целиком. Исполнитель вложил полмиллиона долларов из своего кармана.',
    },
    {
      tag: 'eta-kompoziciya',
      script:
        'Эта композиция вышла, когда клипы только меняли правила игры. ' +
        'МТВ крутил в основном рок, но её ставили в эфир целиком. Исполнитель вложил полмиллиона долларов из своего кармана.',
    },
    {
      tag: 'eta-pesnya',
      script:
        'Эта песня вышла, когда клипы только меняли правила игры. ' +
        'МТВ крутил в основном рок, но её крутили в эфир без нарезки. Исполнитель вложил полмиллиона долларов из своего кармана.',
    },
    {
      tag: 'etot-hit',
      script:
        'Этот хит появился, когда клипы только меняли правила игры. ' +
        'МТВ крутил в основном рок, но его ставили в эфир целиком. Исполнитель вложил полмиллиона долларов из своего кармана.',
    },
    {
      tag: 'eta-zapis',
      script:
        'Эта запись вышла в момент, когда клипы только перестраивали правила. ' +
        'МТВ крутил в основном рок, а её проигрывали от начала до конца. Исполнитель вложил полмиллиона долларов из своего кармана.',
    },
  ],
  '03-rhcp-snow': [
    {
      tag: 'tekushchiy-trek',
      script:
        'Сейчас играет песня с тем самым гитарным риффом с двойного альбома две тысячи шестого года. ' +
        'В начале две тысячи седьмого её крутили на повторе — в эфире тогда звучали в основном англоязычные названия.',
    },
    {
      tag: 'eta-kompoziciya',
      script:
        'Эта композиция построена на запоминающемся гитарном рифе с альбома две тысячи шестого года. ' +
        'В начале две тысячи седьмого её крутили на повторе по всем станциям.',
    },
    {
      tag: 'eta-pesnya',
      script:
        'У этой песни тот самый гитарный рифф с двойного альбома две тысячи шестого года. ' +
        'В начале две тысячи седьмого её замучили на повторе — в радиоэфире тогда царили англоязычные названия.',
    },
    {
      tag: 'etot-hit',
      script:
        'Этот хит держится на гитарном рифе с альбома две тысячи шестого года. ' +
        'В начале две тысячи седьмого его крутили на повторе по всем станциям.',
    },
    {
      tag: 'seychas-v-efire',
      script:
        'Сейчас в эфире как раз та мелодия с гитарным риффом с двойного альбома две тысячи шестого года. ' +
        'В начале две тысячи седьмого её крутили на повторе без остановки.',
    },
  ],
};

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

const RU_PLAIN_ONLY = process.env.DEMO_RU_PLAIN_ONLY === '1';

async function main() {
  await mkdir(outDir, { recursive: true });
  if (!RU_PLAIN_ONLY) await cleanOldSubfolders();

  const manifest = [
    `# Demo audio — ${DATE}`,
    '',
    `Сгенерировано: ${new Date().toISOString()}`,
    'Папка одна: demo-audio/ (без вложенных каталогов).',
    '',
    '## Режимы',
    '- `phonetic-edge` — Edge RU читает кириллицу-фонетику (CMU+G2P)',
    '- `en-mixed` — Edge RU русский текст + Edge EN латиница (род совпадает)',
    '- `ru-plain_{variant}` — только русский, без названия трека («текущий трек», «эта композиция»…)',
    '',
    '## Пары голосов',
    '- svetlana-jenny: ru-RU-SvetlanaNeural + en-US-JennyNeural (ж/ж)',
    '- dmitry-eric: ru-RU-DmitryNeural + en-US-EricNeural (м/м)',
    '',
    '## Файлы',
    '',
  ];

  if (!RU_PLAIN_ONLY) for (const sample of SAMPLES) {
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

  if (RU_PLAIN_ONLY) {
    manifest.length = 0;
    manifest.push(
      `# Demo audio — ${DATE} (ru-plain only)`,
      '',
      `Сгенерировано: ${new Date().toISOString()}`,
      '',
      '## RU plain — без названия трека в озвучке',
      '',
    );
  } else {
    manifest.push('## RU plain — без названия трека в озвучке', '');
  }

  for (const sample of SAMPLES) {
    const variants = GENERIC_BY_SAMPLE[sample.id] ?? [];
    const genericLines = [
      `# ${sample.id} — generic scripts`,
      `Generated: ${DATE}`,
      '',
    ];

    for (const variant of variants) {
      const ruText = preparePureRuText(variant.script);
      genericLines.push(`## ${variant.tag}`);
      genericLines.push(variant.script);
      genericLines.push('');
      genericLines.push(`TTS: ${ruText}`);
      genericLines.push('');

      for (const v of PHONETIC_RU) {
        const name = fname(sample.id, 'ru-plain', v.tag, variant.tag);
        const out = path.join(outDir, name);
        await writeFile(out, await synthEdge(ruText, v));
        const st = await stat(out);
        manifest.push(
          `${name}  (${Math.round(st.size / 1024)} KB)  ${variant.tag} / ${v.voice}`,
        );
        console.log('[ru-plain]', name);
      }
    }

    await writeFile(
      path.join(outDir, `${DATE}_${sample.id}_generic-scripts.txt`),
      genericLines.join('\n'),
      'utf8',
    );
    manifest.push(`scripts: ${DATE}_${sample.id}_generic-scripts.txt`, '');
  }

  if (!RU_PLAIN_ONLY) {
    await writeFile(path.join(outDir, 'README.md'), manifest.join('\n'), 'utf8');
  }
  console.log('[demo-audio-all] done →', outDir);
}

main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
