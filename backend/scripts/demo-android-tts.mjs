/**
 * Android TTS preview via Windows System.Speech (ru-RU Irina/Pavel).
 * Run: npm run build && node scripts/demo-android-tts.mjs
 */
import { mkdir } from 'node:fs/promises';
import { normalizeEdgeRussianOrthography } from '../dist/services/tts-edge-normalize.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const outDir = path.join(root, 'demo-audio');
const date = new Date().toISOString().slice(0, 10);

const SAMPLES = [
  {
    id: '01-ratm-christmas',
    namesOn:
      'Killing in The Name by Rage Against The Machine neozhidanno vozglavil britanskiy rozhdestvenskiy chart v dve tysyachi devyatom. Fanaty ustroili kampaniyu v internete, chtoby vytesnit popsu iz topov - i u nih poluchilos.',
    namesOff:
      'Etot hit neozhidanno vozglavil britanskiy rozhdestvenskiy chart v dve tysyachi devyatom. Fanaty ustroili kampaniyu v internete, chtoby vytesnit popsu iz topov - i u nih poluchilos.',
    namesOnRu:
      'Killing in The Name by Rage Against The Machine неожиданно возглавил британский рождественский чарт в две тысячи девятом. Фанаты устроили кампанию в интернете, чтобы вытеснить попсу из топов — и у них получилось.',
    namesOffRu:
      'Этот хит неожиданно возглавил британский рождественский чарт в две тысячи девятом. Фанаты устроили кампанию в интернете, чтобы вытеснить попсу из топов — и у них получилось.',
  },
  {
    id: '02-thriller-mtv',
    namesOnRu:
      'Thriller by Michael Jackson вышел, когда клипы только меняли правила игры. МТВ крутил в основном рок, но Thriller ставили в эфир целиком. Исполнитель вложил полмиллиона долларов из своего кармана.',
    namesOffRu:
      'Эта песня вышла, когда клипы только меняли правила игры. МТВ крутил в основном рок, но её крутили в эфир без нарезки. Исполнитель вложил полмиллиона долларов из своего кармана.',
  },
  {
    id: '03-rhcp-snow',
    namesOnRu:
      'Snow by Red Hot Chili Peppers — гитарный рифф с альбома две тысячи шестого года. В начале две тысячи седьмого его крутили на повторе.',
    namesOffRu:
      'Этот хит держится на гитарном риффе с альбома две тысячи шестого года. В начале две тысячи седьмого его крутили на повторе по всем станциям.',
  },
];

function synthWav(text, outFile) {
  const ps = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$ru = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'ru-RU' } | Select-Object -First 1
if (-not $ru) { throw 'ru-RU voice missing' }
$s.SelectVoice($ru.VoiceInfo.Name)
$s.SetOutputToWaveFile('${outFile.replace(/'/g, "''")}')
$s.Speak(@'
${text.replace(/'/g, "''")}
'@)
$s.SetOutputToDefaultAudioDevice()
`;
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `powershell exit ${r.status}`);
  }
}

await mkdir(outDir, { recursive: true });

for (const sample of SAMPLES) {
  for (const mode of ['names-on', 'names-off']) {
    let text = mode === 'names-on' ? sample.namesOnRu : sample.namesOffRu;
    if (mode === 'names-off') text = normalizeEdgeRussianOrthography(text);
    const file = path.join(outDir, `${date}_${sample.id}_android-tts_${mode}.wav`);
    synthWav(text, file);
    console.log('[android-tts]', path.basename(file));
  }
}

console.log('[demo-android-tts] done ->', outDir);
