/**
 * Offline Yandex TTS demos for efir-ai.ru — nothing is synthesized in the browser.
 *
 *   node scripts/generate-website-demos.mjs --preview   # texts only → preview-texts.json
 *   node scripts/generate-website-demos.mjs --test      # 3 persona WAVs (smoke test)
 *   node scripts/generate-website-demos.mjs --personas  # 6 persona WAVs
 *   node scripts/generate-website-demos.mjs --studio    # 6×13 studio WAVs (voice per persona)
 *   node scripts/generate-website-demos.mjs --all        # personas + studio
 *
 * Requires YANDEX_API_KEY + YANDEX_FOLDER_ID in backend/.env (не коммить ключи в .env.example).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../dist/load-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../website/assets/demos');

const THRILLER_CORE =
  'Thriller — единственный музыкальный клип в National Film Registry США: его сохраняют как культурное наследие наравне с художественным кино. Vincent Price записал зловещий закадровый текст, а съёмки танца с зомби длились неделями.';

const FACTS = [
  'National Film Registry включил этот клип в список культурного наследия США',
  'Vincent Price записал зловещий закадровый монолог',
  'съёмки танца с зомби заняли недели',
  'именно этот ролик сделал короткометражку главным событием эры MTV',
];

const PERSONAS = [
  {
    id: 'radio_host',
    voice: 'zahar',
    speed: 1.08,
    script: 'А вот это — личное. ' + THRILLER_CORE + ' Именно этот клип взорвал MTV!',
  },
  {
    id: 'night_dj',
    voice: 'filipp',
    speed: 0.92,
    script: 'Тихо. Только вы и эта песня. ' + THRILLER_CORE + ' Останьтесь со мной до утра.',
  },
  {
    id: 'expert',
    voice: 'ermil',
    speed: 1.0,
      script: 'Разберём, почему это работает. ' + THRILLER_CORE + ' Это эталон поп-хоррора восьмидесятых.',
  },
  {
    id: 'contemporary',
    voice: 'alena',
    speed: 0.98,
    script: 'Я помню это время. ' + THRILLER_CORE,
  },
  {
    id: 'fan',
    voice: 'jane',
    speed: 1.12,
    script: 'Обожаю этот момент! ' + THRILLER_CORE + ' И да — я знаю каждую секунду этого клипа наизусть!',
  },
  {
    id: 'backstage',
    voice: 'omazh',
    speed: 0.96,
    script: 'Только между нами. ' + THRILLER_CORE + ' Об этом редко рассказывают вслух.',
  },
];

const VOICES = [
  'zahar', 'ermil', 'filipp', 'alexander', 'kirill',
  'alena', 'jane', 'omazh', 'marina', 'dasha', 'julia', 'masha', 'lera',
];

const TEST_IDS = ['radio_host', 'night_dj', 'expert'];

function studioScript(persona, factCount = 2) {
  const opener = persona.script.split('.')[0] + '.';
  const body = FACTS.slice(0, factCount).map((f) => f + '.').join(' ');
  return opener + ' ' + body;
}

async function loadTts() {
  const { prepareYandexTtsText } = await import('../dist/services/tts-markup.js');
  const { stripYandexMarkup } = await import('../dist/services/tts-azure-ssml.js');
  const { synthesizeSpeech } = await import('../dist/services/yandex-tts.js');
  return { prepareYandexTtsText, stripYandexMarkup, synthesizeSpeech };
}

function ensureKeys() {
  if (!process.env.YANDEX_API_KEY?.trim() || !process.env.YANDEX_FOLDER_ID?.trim()) {
    throw new Error(
      'YANDEX_API_KEY и YANDEX_FOLDER_ID не найдены. Раскомментируйте в backend/.env или создайте backend/.env',
    );
  }
}

async function writePreview() {
  const { prepareYandexTtsText, stripYandexMarkup } = await loadTts();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const out = {
    generatedAt: new Date().toISOString(),
    note: 'Проверьте тексты перед --all. Озвучка только из статических WAV, не с сайта.',
    personas: PERSONAS.map((p) => {
      const marked = prepareYandexTtsText(p.script, {
        artist: 'Michael Jackson',
        title: 'Thriller',
        sentencePauses: true,
        pauseProfile: 'tight',
      });
      return {
        id: p.id,
        voice: p.voice,
        speed: p.speed,
        raw: p.script,
        marked,
        speakable: stripYandexMarkup(marked),
        file: `persona-${p.id}.wav`,
      };
    }),
    studioSamples: PERSONAS.slice(0, 3).map((p) => {
      const raw = studioScript(p, 2);
      const marked = prepareYandexTtsText(raw, {
        artist: 'Michael Jackson',
        title: 'Thriller',
        sentencePauses: true,
        pauseProfile: 'tight',
      });
      return {
        persona: p.id,
        voice: p.voice,
        raw,
        marked,
        speakable: stripYandexMarkup(marked),
        file: `studio-${p.id}-${p.voice}.wav`,
      };
    }),
  };

  const jsonPath = path.join(OUT_DIR, 'preview-texts.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('wrote', jsonPath);
  for (const p of out.personas) {
    console.log('\n---', p.id, '---\n', p.speakable);
  }
}

async function synthPersona(p, synthesizeSpeech) {
  const tmp = `_tmp-${p.id}`;
  const result = await synthesizeSpeech(p.script, p.voice, tmp, {
    speed: p.speed,
    artist: 'Michael Jackson',
    title: 'Thriller',
    pauseProfile: 'tight',
  });
  const buf = fs.readFileSync(result.filePath);
  fs.unlinkSync(result.filePath);
  const out = path.join(OUT_DIR, `persona-${p.id}.wav`);
  fs.writeFileSync(out, buf);
  console.log('wrote', out, buf.length, 'bytes');
  console.log('  speakable:', result.ttsTranscript.slice(0, 120) + '…');
}

async function synthStudio(persona, voice, synthesizeSpeech) {
  const raw = studioScript(persona, 2);
  const tmp = `_tmp-studio-${persona.id}-${voice}`;
  const result = await synthesizeSpeech(raw, voice, tmp, {
    speed: voice === persona.voice ? persona.speed : 1.08,
    artist: 'Michael Jackson',
    title: 'Thriller',
    pauseProfile: 'tight',
  });
  const buf = fs.readFileSync(result.filePath);
  fs.unlinkSync(result.filePath);
  const out = path.join(OUT_DIR, `studio-${persona.id}-${voice}.wav`);
  fs.writeFileSync(out, buf);
  console.log('wrote', out, buf.length, 'bytes');
}

async function main() {
  const arg = process.argv[2] ?? '--preview';

  if (arg === '--preview') {
    await writePreview();
    return;
  }

  ensureKeys();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { synthesizeSpeech } = await loadTts();

  if (arg === '--test') {
    for (const id of TEST_IDS) {
      const p = PERSONAS.find((x) => x.id === id);
      await synthPersona(p, synthesizeSpeech);
    }
    console.log('test done — 3 files in', OUT_DIR);
    return;
  }

  if (arg === '--personas' || arg === '--all') {
    for (const p of PERSONAS) {
      await synthPersona(p, synthesizeSpeech);
    }
  }

  if (arg === '--studio' || arg === '--all') {
    for (const p of PERSONAS) {
      for (const voice of VOICES) {
        await synthStudio(p, voice, synthesizeSpeech);
      }
    }
  }

  if (!['--test', '--personas', '--studio', '--all'].includes(arg)) {
    console.error('Unknown flag:', arg);
    process.exit(1);
  }

  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
