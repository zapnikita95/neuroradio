/**
 * Generates Yandex TTS demo WAVs for efir-ai.ru (personas + studio presets).
 * Usage: cd backend && npm run build && node scripts/generate-website-demos.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../dist/load-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../website/assets/demos');

const THRILLER_CORE =
  'Thriller — единственный музыкальный клип в National Film Registry США: его сохраняют как культурное наследие наравне с художественным кино. Vincent Price записал зловещий закадровый текст, а съёмки танца с зомби длились неделями.';

const PERSONAS = [
  { id: 'radio_host', voice: 'zahar', speed: 1.08, script: 'А вот это — личное. ' + THRILLER_CORE + ' Именно этот клип взорвал MTV!' },
  { id: 'night_dj', voice: 'filipp', speed: 0.92, script: 'Тихо. Только вы и эта песня. ' + THRILLER_CORE },
  { id: 'expert', voice: 'ermil', speed: 1.0, script: 'Разберём, почему это работает. ' + THRILLER_CORE },
  { id: 'contemporary', voice: 'alena', speed: 0.98, script: 'Я помню это время. ' + THRILLER_CORE },
  { id: 'fan', voice: 'jane', speed: 1.12, script: 'Обожаю этот момент! ' + THRILLER_CORE },
  { id: 'backstage', voice: 'omazh', speed: 0.96, script: 'Только между нами. ' + THRILLER_CORE },
];

const VOICES = ['zahar', 'ermil', 'filipp', 'alexander', 'kirill', 'alena', 'jane', 'omazh', 'marina', 'dasha', 'julia', 'masha', 'lera'];
const TEMPOS = [0.85, 0.95, 1.08, 1.22, 1.38];
const LENGTHS = [0, 1, 2];

async function synthesize(text, voice, speed) {
  const { synthesizeYandexSpeech } = await import('../dist/services/yandex-tts.js');
  return synthesizeYandexSpeech({ text, voice, speed, format: 'lpcm-wav' });
}

async function writeWav(name, buffer) {
  const out = path.join(OUT_DIR, name);
  fs.writeFileSync(out, buffer);
  console.log('wrote', name, buffer.length);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const p of PERSONAS) {
    await writeWav(`persona-${p.id}.wav`, await synthesize(p.script, p.voice, p.speed));
  }

  for (const p of PERSONAS) {
    for (const voice of VOICES) {
      for (let ti = 0; ti < TEMPOS.length; ti++) {
        for (let li = 0; li < LENGTHS.length; li++) {
          const n = li + 1;
          const facts = [
            'National Film Registry сохранил клип Thriller как культурное наследие США',
            'Vincent Price записал зловещий закадровый монолог',
            'съёмки танца с зомби заняли недели',
          ].slice(0, n);
          const script = p.script.split('.')[0] + '. ' + facts.join('. ') + '.';
          const buf = await synthesize(script, voice, TEMPOS[ti]);
          await writeWav(`studio-${p.id}-${voice}-t${ti}-l${li}.wav`, buf);
        }
      }
    }
  }
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
